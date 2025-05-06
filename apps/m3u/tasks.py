# apps/m3u/tasks.py
import logging
import re
import requests
import os
import gc
import gzip, zipfile
from celery.app.control import Inspect
from celery.result import AsyncResult
from celery import shared_task, current_app, group
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from .models import M3UAccount
from apps.channels.models import Stream, ChannelGroup, ChannelGroupM3UAccount
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone
import time
import json
from core.utils import RedisClient, acquire_task_lock, release_task_lock
from core.models import CoreSettings
from asgiref.sync import async_to_sync
from core.xtream_codes import Client as XCClient

logger = logging.getLogger(__name__)

BATCH_SIZE = 1000
SKIP_EXTS = {}
m3u_dir = os.path.join(settings.MEDIA_ROOT, "cached_m3u")

def fetch_m3u_lines(account, use_cache=False):
    os.makedirs(m3u_dir, exist_ok=True)
    file_path = os.path.join(m3u_dir, f"{account.id}.m3u")

    """Fetch M3U file lines efficiently."""
    if account.server_url:
        if not use_cache or not os.path.exists(file_path):
            try:
                # Try to get account-specific user agent first
                user_agent_obj = account.get_user_agent()
                user_agent = user_agent_obj.user_agent if user_agent_obj else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

                logger.debug(f"Using user agent: {user_agent} for M3U account: {account.name}")
                headers = {"User-Agent": user_agent}
                logger.info(f"Fetching from URL {account.server_url}")

                response = requests.get(account.server_url, headers=headers, stream=True)
                response.raise_for_status()

                total_size = int(response.headers.get('Content-Length', 0))
                downloaded = 0
                start_time = time.time()
                last_update_time = start_time
                progress = 0

                with open(file_path, 'wb') as file:
                    send_m3u_update(account.id, "downloading", 0)
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            file.write(chunk)

                            downloaded += len(chunk)
                            elapsed_time = time.time() - start_time

                            # Calculate download speed in KB/s
                            speed = downloaded / elapsed_time / 1024  # in KB/s

                            # Calculate progress percentage
                            if total_size and total_size > 0:
                                progress = (downloaded / total_size) * 100

                            # Time remaining (in seconds)
                            time_remaining = (total_size - downloaded) / (speed * 1024)

                            current_time = time.time()
                            if current_time - last_update_time >= 0.5:
                                last_update_time = current_time
                                if progress > 0:
                                    send_m3u_update(account.id, "downloading", progress, speed=speed, elapsed_time=elapsed_time, time_remaining=time_remaining)

                send_m3u_update(account.id, "downloading", 100)
            except Exception as e:
                logger.error(f"Error fetching M3U from URL {account.server_url}: {e}")
                # Update account status and send error notification
                account.status = M3UAccount.Status.ERROR
                account.last_message = f"Error downloading M3U file: {str(e)}"
                account.save(update_fields=['status', 'last_message'])
                send_m3u_update(account.id, "downloading", 100, status="error", error=f"Error downloading M3U file: {str(e)}")
                return [], False  # Return empty list and False for success

        # Check if the file exists and is not empty
        if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
            error_msg = f"M3U file not found or empty: {file_path}"
            logger.error(error_msg)
            account.status = M3UAccount.Status.ERROR
            account.last_message = error_msg
            account.save(update_fields=['status', 'last_message'])
            send_m3u_update(account.id, "downloading", 100, status="error", error=error_msg)
            return [], False  # Return empty list and False for success

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.readlines(), True
        except Exception as e:
            error_msg = f"Error reading M3U file: {str(e)}"
            logger.error(error_msg)
            account.status = M3UAccount.Status.ERROR
            account.last_message = error_msg
            account.save(update_fields=['status', 'last_message'])
            send_m3u_update(account.id, "downloading", 100, status="error", error=error_msg)
            return [], False

    elif account.file_path:
        try:
            if account.file_path.endswith('.gz'):
                with gzip.open(account.file_path, 'rt', encoding='utf-8') as f:
                    return f.readlines(), True

            elif account.file_path.endswith('.zip'):
                with zipfile.ZipFile(account.file_path, 'r') as zip_file:
                    for name in zip_file.namelist():
                        if name.endswith('.m3u'):
                            with zip_file.open(name) as f:
                                return [line.decode('utf-8') for line in f.readlines()], True

                    error_msg = f"No .m3u file found in ZIP archive: {account.file_path}"
                    logger.warning(error_msg)
                    account.status = M3UAccount.Status.ERROR
                    account.last_message = error_msg
                    account.save(update_fields=['status', 'last_message'])
                    send_m3u_update(account.id, "downloading", 100, status="error", error=error_msg)
                    return [], False

            else:
                with open(account.file_path, 'r', encoding='utf-8') as f:
                    return f.readlines(), True

        except (IOError, OSError, zipfile.BadZipFile, gzip.BadGzipFile) as e:
            error_msg = f"Error opening file {account.file_path}: {e}"
            logger.error(error_msg)
            account.status = M3UAccount.Status.ERROR
            account.last_message = error_msg
            account.save(update_fields=['status', 'last_message'])
            send_m3u_update(account.id, "downloading", 100, status="error", error=error_msg)
            return [], False

    # Neither server_url nor uploaded_file is available
    error_msg = "No M3U source available (missing URL and file)"
    logger.error(error_msg)
    account.status = M3UAccount.Status.ERROR
    account.last_message = error_msg
    account.save(update_fields=['status', 'last_message'])
    send_m3u_update(account.id, "downloading", 100, status="error", error=error_msg)
    return [], False

def parse_extinf_line(line: str) -> dict:
    """
    Parse an EXTINF line from an M3U file.
    This function removes the "#EXTINF:" prefix, then splits the remaining
    string on the first comma that is not enclosed in quotes.

    Returns a dictionary with:
      - 'attributes': a dict of attribute key/value pairs (e.g. tvg-id, tvg-logo, group-title)
      - 'display_name': the text after the comma (the fallback display name)
      - 'name': the value from tvg-name (if present) or the display name otherwise.
    """
    if not line.startswith("#EXTINF:"):
        return None
    content = line[len("#EXTINF:"):].strip()
    # Split on the first comma that is not inside quotes.
    parts = re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)', content, maxsplit=1)
    if len(parts) != 2:
        return None
    attributes_part, display_name = parts[0], parts[1].strip()
    attrs = dict(re.findall(r'([^\s]+)=["\']([^"\']+)["\']', attributes_part))
    # Use tvg-name attribute if available; otherwise, use the display name.
    name = attrs.get('tvg-name', display_name)
    return {
        'attributes': attrs,
        'display_name': display_name,
        'name': name
    }

import re
import logging

logger = logging.getLogger(__name__)

def _matches_filters(stream_name: str, group_name: str, filters):
    """Check if a stream or group name matches a precompiled regex filter."""
    compiled_filters = [(re.compile(f.regex_pattern, re.IGNORECASE), f.exclude) for f in filters]
    for pattern, exclude in compiled_filters:
        target = group_name if f.filter_type == 'group' else stream_name
        if pattern.search(target or ''):
            return exclude
    return False

@shared_task
def refresh_m3u_accounts():
    """Queue background parse for all active M3UAccounts."""
    active_accounts = M3UAccount.objects.filter(is_active=True)
    count = 0
    for account in active_accounts:
        refresh_single_m3u_account.delay(account.id)
        count += 1

    msg = f"Queued M3U refresh for {count} active account(s)."
    logger.info(msg)
    return msg

def check_field_lengths(streams_to_create):
    for stream in streams_to_create:
        for field, value in stream.__dict__.items():
            if isinstance(value, str) and len(value) > 255:
                print(f"{field} --- {value}")

        print("")
        print("")

@shared_task
def process_groups(account, groups):
    existing_groups = {group.name: group for group in ChannelGroup.objects.filter(name__in=groups.keys())}
    logger.info(f"Currently {len(existing_groups)} existing groups")

    group_objs = []
    groups_to_create = []
    for group_name, custom_props in groups.items():
        logger.info(f"Handling group: {group_name}")
        if group_name not in existing_groups:
            groups_to_create.append(ChannelGroup(
                name=group_name,
            ))
        else:
            group_objs.append(existing_groups[group_name])

    if groups_to_create:
        logger.info(f"Creating {len(groups_to_create)} groups")
        created = ChannelGroup.bulk_create_and_fetch(groups_to_create)
        logger.info(f"Created {len(created)} groups")
        group_objs.extend(created)

    relations = []
    for group in group_objs:
        relations.append(ChannelGroupM3UAccount(
            channel_group=group,
            m3u_account=account,
            custom_properties=json.dumps(groups[group.name]),
        ))

    ChannelGroupM3UAccount.objects.bulk_create(
        relations,
        ignore_conflicts=True
    )

@shared_task
def process_xc_category(account_id, batch, groups, hash_keys):
    account = M3UAccount.objects.get(id=account_id)

    streams_to_create = []
    streams_to_update = []
    stream_hashes = {}

    xc_client = XCClient(account.server_url, account.username, account.password, account.get_user_agent())
    for group_name, props in batch.items():
        streams = xc_client.get_live_category_streams(props['xc_id'])
        for stream in streams:
            name = stream["name"]
            url = xc_client.get_stream_url(stream["stream_id"])
            tvg_id = stream["epg_channel_id"]
            tvg_logo = stream["stream_icon"]
            group_title = group_name

            stream_hash = Stream.generate_hash_key(name, url, tvg_id, hash_keys)
            stream_props = {
                "name": name,
                "url": url,
                "logo_url": tvg_logo,
                "tvg_id": tvg_id,
                "m3u_account": account,
                "channel_group_id": int(groups.get(group_title)),
                "stream_hash": stream_hash,
                "custom_properties": json.dumps(stream),
            }

            if stream_hash not in stream_hashes:
                stream_hashes[stream_hash] = stream_props

    existing_streams = {s.stream_hash: s for s in Stream.objects.filter(stream_hash__in=stream_hashes.keys())}

    for stream_hash, stream_props in stream_hashes.items():
        if stream_hash in existing_streams:
            obj = existing_streams[stream_hash]
            existing_attr = {field.name: getattr(obj, field.name) for field in Stream._meta.fields if field != 'channel_group_id'}
            changed = any(existing_attr[key] != value for key, value in stream_props.items() if key != 'channel_group_id')

            if changed:
                for key, value in stream_props.items():
                    setattr(obj, key, value)
                obj.last_seen = timezone.now()
                obj.updated_at = timezone.now()  # Update timestamp only for changed streams
                streams_to_update.append(obj)
                del existing_streams[stream_hash]
            else:
                # Always update last_seen, even if nothing else changed
                obj.last_seen = timezone.now()
                # Don't update updated_at for unchanged streams
                streams_to_update.append(obj)
                existing_streams[stream_hash] = obj
        else:
            stream_props["last_seen"] = timezone.now()
            stream_props["updated_at"] = timezone.now()  # Set initial updated_at for new streams
            streams_to_create.append(Stream(**stream_props))

    try:
        with transaction.atomic():
            if streams_to_create:
                Stream.objects.bulk_create(streams_to_create, ignore_conflicts=True)
            if streams_to_update:
                # We need to split the bulk update to correctly handle updated_at
                # First, get the subset of streams that have content changes
                changed_streams = [s for s in streams_to_update if hasattr(s, 'updated_at') and s.updated_at]
                unchanged_streams = [s for s in streams_to_update if not hasattr(s, 'updated_at') or not s.updated_at]

                # Update changed streams with all fields including updated_at
                if changed_streams:
                    Stream.objects.bulk_update(
                        changed_streams,
                        {key for key in stream_props.keys() if key not in ["m3u_account", "stream_hash"] and key not in hash_keys} | {"last_seen", "updated_at"}
                    )

                # Update unchanged streams with only last_seen
                if unchanged_streams:
                    Stream.objects.bulk_update(unchanged_streams, ["last_seen"])

            if len(existing_streams.keys()) > 0:
                Stream.objects.bulk_update(existing_streams.values(), ["last_seen"])
    except Exception as e:
        logger.error(f"Bulk create failed: {str(e)}")

    retval = f"Batch processed: {len(streams_to_create)} created, {len(streams_to_update)} updated."

    # Aggressive garbage collection
    del streams_to_create, streams_to_update, stream_hashes, existing_streams
    gc.collect()

    return retval

@shared_task
def process_m3u_batch(account_id, batch, groups, hash_keys):
    """Processes a batch of M3U streams using bulk operations."""
    account = M3UAccount.objects.get(id=account_id)

    streams_to_create = []
    streams_to_update = []
    stream_hashes = {}

    # compiled_filters = [(f.filter_type, re.compile(f.regex_pattern, re.IGNORECASE)) for f in filters]
    logger.debug(f"Processing batch of {len(batch)}")
    for stream_info in batch:
        try:
            name, url = stream_info["name"], stream_info["url"]
            tvg_id, tvg_logo = stream_info["attributes"].get("tvg-id", ""), stream_info["attributes"].get("tvg-logo", "")
            group_title = stream_info["attributes"].get("group-title", "Default Group")

            # Filter out disabled groups for this account
            if group_title not in groups:
                logger.debug(f"Skipping stream in disabled group: {group_title}")
                continue

            stream_hash = Stream.generate_hash_key(name, url, tvg_id, hash_keys)
            stream_props = {
                "name": name,
                "url": url,
                "logo_url": tvg_logo,
                "tvg_id": tvg_id,
                "m3u_account": account,
                "channel_group_id": int(groups.get(group_title)),
                "stream_hash": stream_hash,
                "custom_properties": json.dumps(stream_info["attributes"]),
            }

            if stream_hash not in stream_hashes:
                stream_hashes[stream_hash] = stream_props
        except Exception as e:
            logger.error(f"Failed to process stream {name}: {e}")
            logger.error(json.dumps(stream_info))

    existing_streams = {s.stream_hash: s for s in Stream.objects.filter(stream_hash__in=stream_hashes.keys())}

    for stream_hash, stream_props in stream_hashes.items():
        if stream_hash in existing_streams:
            obj = existing_streams[stream_hash]
            existing_attr = {field.name: getattr(obj, field.name) for field in Stream._meta.fields if field != 'channel_group_id'}
            changed = any(existing_attr[key] != value for key, value in stream_props.items() if key != 'channel_group_id')

            if changed:
                for key, value in stream_props.items():
                    setattr(obj, key, value)
                obj.last_seen = timezone.now()
                obj.updated_at = timezone.now()  # Update timestamp only for changed streams
                streams_to_update.append(obj)
                del existing_streams[stream_hash]
            else:
                # Always update last_seen, even if nothing else changed
                obj.last_seen = timezone.now()
                # Don't update updated_at for unchanged streams
                streams_to_update.append(obj)
                existing_streams[stream_hash] = obj
        else:
            stream_props["last_seen"] = timezone.now()
            stream_props["updated_at"] = timezone.now()  # Set initial updated_at for new streams
            streams_to_create.append(Stream(**stream_props))

    try:
        with transaction.atomic():
            if streams_to_create:
                Stream.objects.bulk_create(streams_to_create, ignore_conflicts=True)
            if streams_to_update:
                # We need to split the bulk update to correctly handle updated_at
                # First, get the subset of streams that have content changes
                changed_streams = [s for s in streams_to_update if hasattr(s, 'updated_at') and s.updated_at]
                unchanged_streams = [s for s in streams_to_update if not hasattr(s, 'updated_at') or not s.updated_at]

                # Update changed streams with all fields including updated_at
                if changed_streams:
                    Stream.objects.bulk_update(
                        changed_streams,
                        {key for key in stream_props.keys() if key not in ["m3u_account", "stream_hash"] and key not in hash_keys} | {"last_seen", "updated_at"}
                    )

                # Update unchanged streams with only last_seen
                if unchanged_streams:
                    Stream.objects.bulk_update(unchanged_streams, ["last_seen"])

            if len(existing_streams.keys()) > 0:
                Stream.objects.bulk_update(existing_streams.values(), ["last_seen"])
    except Exception as e:
        logger.error(f"Bulk create failed: {str(e)}")

    retval = f"Batch processed: {len(streams_to_create)} created, {len(streams_to_update)} updated."

    # Aggressive garbage collection
    del streams_to_create, streams_to_update, stream_hashes, existing_streams
    gc.collect()

    return retval

def cleanup_streams(account_id):
    account = M3UAccount.objects.get(id=account_id, is_active=True)
    existing_groups = ChannelGroup.objects.filter(
        m3u_account__m3u_account=account,
        m3u_account__enabled=True,
    ).values_list('id', flat=True)
    logger.info(f"Found {len(existing_groups)} active groups")

    # Calculate cutoff date for stale streams
    stale_cutoff = timezone.now() - timezone.timedelta(days=account.stale_stream_days)
    logger.info(f"Removing streams not seen since {stale_cutoff}")

    # Delete streams that are not in active groups
    streams_to_delete = Stream.objects.filter(
        m3u_account=account
    ).exclude(
        channel_group__in=existing_groups
    )

    # Also delete streams that haven't been seen for longer than stale_stream_days
    stale_streams = Stream.objects.filter(
        m3u_account=account,
        last_seen__lt=stale_cutoff
    )

    deleted_count = streams_to_delete.count()
    stale_count = stale_streams.count()

    streams_to_delete.delete()
    stale_streams.delete()

    logger.info(f"Cleanup complete: {deleted_count} streams removed due to group filter, {stale_count} removed as stale")

@shared_task
def refresh_m3u_groups(account_id, use_cache=False, full_refresh=False):
    if not acquire_task_lock('refresh_m3u_account_groups', account_id):
        return f"Task already running for account_id={account_id}.", None

    try:
        account = M3UAccount.objects.get(id=account_id, is_active=True)
    except M3UAccount.DoesNotExist:
        release_task_lock('refresh_m3u_account_groups', account_id)
        return f"M3UAccount with ID={account_id} not found or inactive.", None

    extinf_data = []
    groups = {"Default Group": {}}

    xc_client = None
    if account.account_type == M3UAccount.Types.XC:
        xc_client = XCClient(account.server_url, account.username, account.password, account.get_user_agent())
        try:
            xc_client.authenticate()
        except Exception as e:
            error_msg = f"Failed to authenticate with XC server: {str(e)}"
            logger.error(error_msg)
            account.status = M3UAccount.Status.ERROR
            account.last_message = error_msg
            account.save(update_fields=['status', 'last_message'])
            send_m3u_update(account_id, "processing_groups", 100, status="error", error=error_msg)
            release_task_lock('refresh_m3u_account_groups', account_id)
            return f"M3UAccount with ID={account_id} failed to authenticate with XC server.", None

        xc_categories = xc_client.get_live_categories()
        for category in xc_categories:
            groups[category["category_name"]] = {
                "xc_id": category["category_id"],
            }
    else:
        # Here's the key change - use the success flag from fetch_m3u_lines
        lines, success = fetch_m3u_lines(account, use_cache)
        if not success:
            # If fetch failed, don't continue processing
            release_task_lock('refresh_m3u_account_groups', account_id)
            return f"Failed to fetch M3U data for account_id={account_id}.", None

        for line in lines:
            line = line.strip()
            if line.startswith("#EXTINF"):
                parsed = parse_extinf_line(line)
                if parsed:
                    if "group-title" in parsed["attributes"]:
                        groups[parsed["attributes"]["group-title"]] = {}

                    extinf_data.append(parsed)
            elif extinf_data and line.startswith("http"):
                # Associate URL with the last EXTINF line
                extinf_data[-1]["url"] = line

        cache_path = os.path.join(m3u_dir, f"{account_id}.json")
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({
                "extinf_data": extinf_data,
                "groups": groups,
            }, f)

    send_m3u_update(account_id, "processing_groups", 0)

    process_groups(account, groups)

    release_task_lock('refresh_m3u_account_groups', account_id)



    if not full_refresh:
        # Use update() instead of save() to avoid triggering signals
        M3UAccount.objects.filter(id=account_id).update(
            status=M3UAccount.Status.PENDING_SETUP,
            last_message="M3U groups loaded. Please select groups or refresh M3U to complete setup."
        )
        send_m3u_update(account_id, "processing_groups", 100, status="pending_setup", message="M3U groups loaded. Please select groups or refresh M3U to complete setup.")
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                "data": {"success": True, "type": "m3u_group_refresh", "account": account_id}
            }
        )

    return extinf_data, groups

@shared_task
def refresh_single_m3u_account(account_id):
    """Splits M3U processing into chunks and dispatches them as parallel tasks."""
    if not acquire_task_lock('refresh_single_m3u_account', account_id):
        return f"Task already running for account_id={account_id}."

    # Record start time
    start_time = time.time()
    streams_created = 0
    streams_updated = 0
    streams_deleted = 0

    try:
        account = M3UAccount.objects.get(id=account_id, is_active=True)
        if not account.is_active:
            logger.info(f"Account {account_id} is not active, skipping.")
            release_task_lock('refresh_single_m3u_account', account_id)
            return

        # Set status to fetching
        account.status = M3UAccount.Status.FETCHING
        account.save(update_fields=['status'])

        filters = list(account.filters.all())
    except M3UAccount.DoesNotExist:
        release_task_lock('refresh_single_m3u_account', account_id)
        return f"M3UAccount with ID={account_id} not found or inactive."

    # Fetch M3U lines and handle potential issues
    extinf_data = []
    groups = None

    cache_path = os.path.join(m3u_dir, f"{account_id}.json")
    if os.path.exists(cache_path):
        with open(cache_path, 'r') as file:
            data = json.load(file)

        extinf_data = data['extinf_data']
        groups = data['groups']

    if not extinf_data:
        try:
            result = refresh_m3u_groups(account_id, full_refresh=True)

            # Check if the result indicates an error (None tuple or tuple with empty values)
            if not result or not result[0] or not result[1]:
                logger.error(f"Failed to refresh M3U groups for account {account_id}")
                # The error already has been recorded by refresh_m3u_groups
# Just release the lock and exit - no need to set parsing status at all
                release_task_lock('refresh_single_m3u_account', account_id)
                return "Failed to update m3u account - download failed or other error"

            extinf_data, groups = result
            if not groups:
                logger.error(f"No groups found for account {account_id}")
                account.status = M3UAccount.Status.ERROR
                account.last_message = "No channel groups found in M3U source"
                account.save(update_fields=['status', 'last_message'])
                send_m3u_update(account_id, "parsing", 100, status="error", error="No channel groups found")
                release_task_lock('refresh_single_m3u_account', account_id)
                return "Failed to update m3u account, no groups found"

        except Exception as e:
            logger.error(f"Exception in refresh_m3u_groups: {str(e)}")
            account.status = M3UAccount.Status.ERROR
            account.last_message = f"Error refreshing M3U groups: {str(e)}"
            account.save(update_fields=['status', 'last_message'])
            send_m3u_update(account_id, "parsing", 100, status="error", error=f"Error refreshing M3U groups: {str(e)}")
            release_task_lock('refresh_single_m3u_account', account_id)
            return "Failed to update m3u account"

# Only proceed with parsing if we actually have data and no errors were encountered
    if not extinf_data or not groups:
        logger.error(f"No data to process for account {account_id}")
        account.status = M3UAccount.Status.ERROR
        account.last_message = "No data available for processing"
        account.save(update_fields=['status', 'last_message'])
        send_m3u_update(account_id, "parsing", 100, status="error", error="No data available for processing")
        release_task_lock('refresh_single_m3u_account', account_id)
        return "Failed to update m3u account, no data available"

    hash_keys = CoreSettings.get_m3u_hash_key().split(",")

    existing_groups = {group.name: group.id for group in ChannelGroup.objects.filter(
        m3u_account__m3u_account=account,  # Filter by the M3UAccount
        m3u_account__enabled=True  # Filter by the enabled flag in the join table
    )}

    try:
        # Set status to parsing
        account.status = M3UAccount.Status.PARSING
        account.save(update_fields=['status'])

        if account.account_type == M3UAccount.Types.STADNARD:
            # Break into batches and process in parallel
            batches = [extinf_data[i:i + BATCH_SIZE] for i in range(0, len(extinf_data), BATCH_SIZE)]
            task_group = group(process_m3u_batch.s(account_id, batch, existing_groups, hash_keys) for batch in batches)
        else:
            filtered_groups = [(k, v) for k, v in groups.items() if k in existing_groups]
            batches = [
                dict(filtered_groups[i:i + 2])
                for i in range(0, len(filtered_groups), 2)
            ]
            task_group = group(process_xc_category.s(account_id, batch, existing_groups, hash_keys) for batch in batches)

        total_batches = len(batches)
        completed_batches = 0
        streams_processed = 0  # Track total streams processed
        logger.debug(f"Dispatched {len(batches)} parallel tasks for account_id={account_id}.")

        # result = task_group.apply_async()
        result = task_group.apply_async()

        # Wait for all tasks to complete and collect their result IDs
        completed_task_ids = set()
        while completed_batches < total_batches:
            for async_result in result:
                if async_result.ready() and async_result.id not in completed_task_ids:  # If the task has completed and we haven't counted it
                    task_result = async_result.result  # The result of the task
                    logger.debug(f"Task completed with result: {task_result}")

                    # Extract stream counts from result string if available
                    if isinstance(task_result, str):
                        try:
                            created_match = re.search(r"(\d+) created", task_result)
                            updated_match = re.search(r"(\d+) updated", task_result)

                            if created_match and updated_match:
                                created_count = int(created_match.group(1))
                                updated_count = int(updated_match.group(1))
                                streams_processed += created_count + updated_count
                                streams_created += created_count
                                streams_updated += updated_count
                        except (AttributeError, ValueError):
                            pass

                    completed_batches += 1
                    completed_task_ids.add(async_result.id)  # Mark this task as processed

                    # Calculate progress
                    progress = int((completed_batches / total_batches) * 100)

                    # Calculate elapsed time and estimated remaining time
                    current_elapsed = time.time() - start_time
                    if progress > 0:
                        estimated_total = (current_elapsed / progress) * 100
                        time_remaining = max(0, estimated_total - current_elapsed)
                    else:
                        time_remaining = 0

                    # Send progress update via Channels
                    # Don't send 100% because we want to clean up after
                    if progress == 100:
                        progress = 99

                    send_m3u_update(
                        account_id,
                        "parsing",
                        progress,
                        elapsed_time=current_elapsed,
                        time_remaining=time_remaining,
                        streams_processed=streams_processed
                    )

                    # Optionally remove completed task from the group to prevent processing it again
                    result.remove(async_result)
                else:
                    logger.debug(f"Task is still running.")

        # Ensure all database transactions are committed before cleanup
        logger.info(f"All {total_batches} tasks completed, ensuring DB transactions are committed before cleanup")
        # Force a simple DB query to ensure connection sync
        Stream.objects.filter(id=-1).exists()  # This will never find anything but ensures DB sync

        # Now run cleanup
        cleanup_streams(account_id)

        # Calculate elapsed time
        elapsed_time = time.time() - start_time

        # Set status to success and update timestamp BEFORE sending the final update
        account.status = M3UAccount.Status.SUCCESS
        account.last_message = (
            f"Processing completed in {elapsed_time:.1f} seconds. "
            f"Streams: {streams_created} created, {streams_updated} updated, {streams_deleted} removed. "
            f"Total processed: {streams_processed}."
        )
        account.updated_at = timezone.now()
        account.save(update_fields=['status', 'last_message', 'updated_at'])

        # Send final update with complete metrics and explicitly include success status
        send_m3u_update(
            account_id,
            "parsing",
            100,
            status="success",  # Explicitly set status to success
            elapsed_time=elapsed_time,
            time_remaining=0,
            streams_processed=streams_processed,
            streams_created=streams_created,
            streams_updated=streams_updated,
            streams_deleted=streams_deleted,
            message=account.last_message
        )

        print(f"Function took {elapsed_time} seconds to execute.")

    except Exception as e:
        logger.error(f"Error processing M3U for account {account_id}: {str(e)}")
        account.status = M3UAccount.Status.ERROR
        account.last_message = f"Error processing M3U: {str(e)}"
        account.save(update_fields=['status', 'last_message'])
        raise  # Re-raise the exception for Celery to handle

    release_task_lock('refresh_single_m3u_account', account_id)

    # Aggressive garbage collection
    del existing_groups, extinf_data, groups, batches
    gc.collect()

    # Clean up cache file since we've fully processed it
    if os.path.exists(cache_path):
        os.remove(cache_path)

    return f"Dispatched jobs complete."

def send_m3u_update(account_id, action, progress, **kwargs):
    # Start with the base data dictionary
    data = {
        "progress": progress,
        "type": "m3u_refresh",
        "account": account_id,
        "action": action,
    }

    # Add the status and message if not already in kwargs
    try:
        account = M3UAccount.objects.get(id=account_id)
        if account:
            if "status" not in kwargs:
                data["status"] = account.status
            if "message" not in kwargs and account.last_message:
                data["message"] = account.last_message
    except:
        pass  # If account can't be retrieved, continue without these fields

    # Add the additional key-value pairs from kwargs
    data.update(kwargs)

    # Now, send the updated data dictionary
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'updates',
        {
            'type': 'update',
            'data': data
        }
    )
