import logging
from datetime import timedelta
from typing import Optional, Set

from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from apps.media_library.metadata import sync_metadata
from apps.media_library.models import Library, LibraryScan, MediaFile, MediaItem
from apps.media_library.utils import (
    LibraryScanner,
    apply_probe_metadata,
    classify_media_file,
    probe_media_file,
    resolve_media_item,
)

logger = logging.getLogger(__name__)


def enqueue_library_scan(
    *,
    library_id: int,
    user_id: int | None = None,
    force_full: bool = False,
    rescan_item_id: int | None = None,
) -> LibraryScan:
    library = Library.objects.get(pk=library_id)
    scan = LibraryScan.objects.create(
        library=library,
        created_by_id=user_id,
        status=LibraryScan.STATUS_PENDING,
        extra={
            "force_full": force_full,
            "rescan_item_id": rescan_item_id,
        },
    )

    async_result = scan_library_task.apply_async(
        kwargs={
            "scan_id": str(scan.id),
            "library_id": library_id,
            "force_full": force_full,
            "rescan_item_id": rescan_item_id,
        }
    )
    scan.task_id = async_result.id
    scan.save(update_fields=["task_id", "updated_at"])
    return scan


def _send_scan_event(event: dict) -> None:
    try:
        channel_layer = get_channel_layer()
    except Exception:  # noqa: BLE001
        return
    if not channel_layer:
        return
    payload = {"success": True, "type": "media_scan"}
    payload.update(event)
    async_to_sync(channel_layer.group_send)(
        "updates",
        {"type": "update", "data": payload},
    )


@shared_task(bind=True, name="media_library.scan_library")
def scan_library_task(
    self,
    *,
    scan_id: str,
    library_id: int,
    force_full: bool = False,
    rescan_item_id: int | None = None,
):
    try:
        scan = LibraryScan.objects.select_related("library").get(pk=scan_id)
    except LibraryScan.DoesNotExist:
        logger.warning("LibraryScan %s not found", scan_id)
        return

    scan.mark_running(task_id=self.request.id if self.request else None)
    library = scan.library
    logger.info("Starting scan for library %s (id=%s)", library.name, library.id)
    _send_scan_event(
        {
            "status": "started",
            "scan_id": str(scan.id),
            "library_id": library.id,
            "library_name": library.name,
        }
    )

    try:
        scanner = LibraryScanner(
            library=library,
            scan=scan,
            force_full=force_full,
            rescan_item_id=rescan_item_id,
        )

        discoveries = _discover_media(scan=scan, scanner=scanner)
        logger.debug("Discovered %s files for library %s", len(discoveries), library.id)
        _send_scan_event(
            {
                "status": "discovered",
                "scan_id": str(scan.id),
                "library_id": library.id,
                "files": len(discoveries),
                "new_files": scan.new_files,
                "updated_files": scan.updated_files,
            }
        )

        scanner.mark_missing_files()

        matched = 0
        unmatched = 0
        media_item_ids: Set[int] = set()

        for result in discoveries:
            identify_result = _identify_media_file(
                library=library,
                file_id=result.file_id,
                target_item_id=scanner.target_item.id if scanner.target_item else None,
            )
            matched += identify_result.get("matched", 0)
            unmatched += identify_result.get("unmatched", 0)
            media_id = identify_result.get("media_item_id")
            if media_id:
                media_item_ids.add(media_id)

            if result.requires_probe:
                _probe_media_file(file_id=result.file_id)

        for media_item_id in media_item_ids:
            _sync_metadata(media_item_id)

        summary = (
            f"Processed {scan.total_files} files; "
            f"new={scan.new_files}, updated={scan.updated_files}, "
            f"removed={scan.removed_files}, matched={matched}, "
            f"unmatched={unmatched}"
        )
        scanner.finalize(matched=matched, unmatched=unmatched, summary=summary)
        logger.info("Completed scan for library %s", library.name)
        _send_scan_event(
            {
                "status": "completed",
                "scan_id": str(scan.id),
                "library_id": library.id,
                "summary": summary,
                "matched": matched,
                "unmatched": unmatched,
                "new_files": scan.new_files,
                "updated_files": scan.updated_files,
                "removed_files": scan.removed_files,
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Library scan failed for %s", library.name)
        scan.mark_failed(summary=str(exc))
        _send_scan_event(
            {
                "success": False,
                "status": "failed",
                "scan_id": str(scan.id),
                "library_id": library.id,
                "message": str(exc),
            }
        )
        raise


def _discover_media(scan: LibraryScan, scanner: LibraryScanner):
    with transaction.atomic():
        discovered = scanner.discover_files()
    return discovered


@shared_task(name="media_library.discover_media")
def discover_media_task(scan_id: str) -> list[dict]:
    scan = LibraryScan.objects.select_related("library").get(pk=scan_id)
    scanner = LibraryScanner(scan.library, scan, force_full=False)
    discoveries = _discover_media(scan, scanner)
    return [{"file_id": d.file_id, "requires_probe": d.requires_probe} for d in discoveries]


def _identify_media_file(
    *,
    library: Library,
    file_id: int,
    target_item_id: Optional[int] = None,
) -> dict:
    try:
        file_record = MediaFile.objects.select_related("library", "media_item").get(
            pk=file_id, library=library
        )
    except MediaFile.DoesNotExist:
        return {"matched": 0, "unmatched": 0}

    classification = classify_media_file(file_record.file_name)
    target_item = None
    if target_item_id:
        target_item = MediaItem.objects.filter(pk=target_item_id, library=library).first()

    media_item = resolve_media_item(library, classification, target_item=target_item)
    matched = 0
    unmatched = 0
    if media_item:
        if file_record.media_item_id != media_item.id:
            file_record.media_item = media_item
            file_record.save(update_fields=["media_item", "updated_at"])
        if classification.detected_type == MediaItem.TYPE_OTHER:
            if media_item.status != MediaItem.STATUS_FAILED:
                media_item.status = MediaItem.STATUS_FAILED
                media_item.save(update_fields=["status", "updated_at"])
            unmatched = 1
        else:
            if media_item.status != MediaItem.STATUS_MATCHED:
                media_item.status = MediaItem.STATUS_MATCHED
                media_item.save(update_fields=["status", "updated_at"])
            matched = 1
    else:
        unmatched = 1

    if not file_record.checksum:
        file_record.checksum = file_record.calculate_checksum()
        file_record.save(update_fields=["checksum", "updated_at"])

    return {
        "file_id": file_id,
        "media_item_id": media_item.id if media_item else None,
        "matched": matched,
        "unmatched": unmatched,
    }


@shared_task(name="media_library.identify_media")
def identify_media_task(library_id: int, file_id: int, target_item_id: Optional[int] = None):
    library = Library.objects.get(pk=library_id)
    return _identify_media_file(
        library=library, file_id=file_id, target_item_id=target_item_id
    )


def _probe_media_file(*, file_id: int) -> None:
    try:
        file_record = MediaFile.objects.get(pk=file_id)
    except MediaFile.DoesNotExist:
        return

    probe_data = probe_media_file(file_record.absolute_path)
    apply_probe_metadata(file_record, probe_data)


@shared_task(name="media_library.probe_media")
def probe_media_task(file_id: int):
    _probe_media_file(file_id=file_id)


def _sync_metadata(media_item_id: int) -> None:
    try:
        media_item = MediaItem.objects.get(pk=media_item_id)
    except MediaItem.DoesNotExist:
        return
    sync_metadata(media_item)


@shared_task(name="media_library.sync_metadata")
def sync_metadata_task(media_item_id: int):
    _sync_metadata(media_item_id)


@shared_task(name="media_library.cleanup_missing")
def cleanup_missing_task(library_id: int):
    library = Library.objects.get(pk=library_id)
    dummy_scan = LibraryScan(
        library=library,
        status=LibraryScan.STATUS_RUNNING,
    )
    scanner = LibraryScanner(library=library, scan=dummy_scan)
    return scanner.mark_missing_files()


@shared_task(name="media_library.prune_stale_scans")
def prune_stale_scans(max_age_hours: int = 72):
    threshold = timezone.now() - timedelta(hours=max_age_hours)
    deleted, _ = LibraryScan.objects.filter(
        status__in=[LibraryScan.STATUS_COMPLETED, LibraryScan.STATUS_FAILED],
        created_at__lt=threshold,
    ).delete()
    if deleted:
        logger.info("Pruned %s stale library scan records", deleted)


@shared_task(name="media_library.schedule_auto_scans")
def schedule_auto_scans():
    now = timezone.now()
    for library in Library.objects.filter(auto_scan_enabled=True):
        if not library.last_scan_at:
            enqueue_library_scan(library_id=library.id, user_id=None)
            continue
        next_scan_due = library.last_scan_at + timedelta(minutes=library.scan_interval_minutes)
        if next_scan_due <= now:
            enqueue_library_scan(library_id=library.id, user_id=None)


def refresh_metadata_for_item(media_item_id: int, user_id: int | None = None):
    logger.debug("Metadata refresh requested for media_item=%s by user=%s", media_item_id, user_id)
    sync_metadata_task.delay(media_item_id)
