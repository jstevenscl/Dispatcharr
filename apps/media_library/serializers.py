from django.db import transaction
from rest_framework import serializers

from apps.media_library import models


class LibraryLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LibraryLocation
        fields = [
            "id",
            "path",
            "include_subdirectories",
            "is_primary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LibrarySerializer(serializers.ModelSerializer):
    locations = LibraryLocationSerializer(many=True, required=False)

    class Meta:
        model = models.Library
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "library_type",
            "auto_scan_enabled",
            "scan_interval_minutes",
            "metadata_language",
            "metadata_country",
            "metadata_options",
            "last_scan_at",
            "last_successful_scan_at",
            "created_at",
            "updated_at",
            "locations",
        ]
        read_only_fields = [
            "id",
            "slug",
            "last_scan_at",
            "last_successful_scan_at",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        locations_data = validated_data.pop("locations", [])
        with transaction.atomic():
            library = super().create(validated_data)
            self._sync_locations(library, locations_data)
        return library

    def update(self, instance, validated_data):
        locations_data = validated_data.pop("locations", None)
        with transaction.atomic():
            library = super().update(instance, validated_data)
            if locations_data is not None:
                self._sync_locations(library, locations_data)
        return library

    def _sync_locations(self, library: models.Library, locations_data):
        seen_location_ids = set()
        primary_set = False

        for entry in locations_data:
            location_id = entry.get("id")
            entry_data = {
                "path": entry["path"],
                "include_subdirectories": entry.get("include_subdirectories", True),
                "is_primary": entry.get("is_primary", False),
            }

            if entry_data["is_primary"]:
                primary_set = True
            if location_id:
                models.LibraryLocation.objects.filter(pk=location_id, library=library).update(**entry_data)
                seen_location_ids.add(location_id)
            else:
                location = models.LibraryLocation.objects.create(library=library, **entry_data)
                seen_location_ids.add(location.id)

        # Remove locations not present in payload
        models.LibraryLocation.objects.filter(library=library).exclude(id__in=seen_location_ids).delete()

        # Ensure a primary location exists
        if not primary_set:
            first_location = models.LibraryLocation.objects.filter(library=library).order_by("id").first()
            if first_location:
                first_location.is_primary = True
                first_location.save(update_fields=["is_primary", "updated_at"])


class LibraryScanSerializer(serializers.ModelSerializer):
    library_name = serializers.CharField(source="library.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = models.LibraryScan
        fields = [
            "id",
            "library",
            "library_name",
            "created_by",
            "created_by_name",
            "status",
            "started_at",
            "finished_at",
            "total_files",
            "new_files",
            "updated_files",
            "removed_files",
            "matched_items",
            "unmatched_files",
            "task_id",
            "summary",
            "log",
            "extra",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "library_name",
            "created_by_name",
            "status",
            "started_at",
            "finished_at",
            "total_files",
            "new_files",
            "updated_files",
            "removed_files",
            "matched_items",
            "unmatched_files",
            "task_id",
            "summary",
            "log",
            "extra",
            "created_at",
            "updated_at",
        ]


class ArtworkAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ArtworkAsset
        fields = [
            "id",
            "asset_type",
            "external_url",
            "local_path",
            "width",
            "height",
            "language",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class MediaFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MediaFile
        fields = [
            "id",
            "library",
            "media_item",
            "location",
            "absolute_path",
            "relative_path",
            "file_name",
            "size_bytes",
            "duration_ms",
            "video_codec",
            "audio_codec",
            "audio_channels",
            "width",
            "height",
            "frame_rate",
            "bit_rate",
            "container",
            "has_subtitles",
            "subtitle_languages",
            "extra_streams",
            "checksum",
            "fingerprint",
            "last_modified_at",
            "last_seen_at",
            "missing_since",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "last_modified_at",
            "last_seen_at",
            "missing_since",
            "created_at",
            "updated_at",
        ]


class MediaItemSerializer(serializers.ModelSerializer):
    files = MediaFileSerializer(many=True, read_only=True)
    artwork = ArtworkAssetSerializer(many=True, read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(source="parent", read_only=True)
    watch_progress = serializers.SerializerMethodField()

    class Meta:
        model = models.MediaItem
        fields = [
            "id",
            "library",
            "parent_id",
            "item_type",
            "status",
            "title",
            "sort_title",
            "normalized_title",
            "release_year",
            "season_number",
            "episode_number",
            "runtime_ms",
            "synopsis",
            "tagline",
            "rating",
            "genres",
            "studios",
            "cast",
            "crew",
            "tags",
            "poster_url",
            "backdrop_url",
            "tmdb_id",
            "imdb_id",
            "tvdb_id",
            "vod_movie",
            "vod_series",
            "vod_episode",
            "metadata",
            "metadata_last_synced_at",
            "metadata_source",
            "first_imported_at",
            "updated_at",
            "files",
            "artwork",
            "watch_progress",
        ]
        read_only_fields = [
            "id",
            "library",
            "parent_id",
            "item_type",
            "normalized_title",
            "metadata_last_synced_at",
            "first_imported_at",
            "updated_at",
            "files",
            "artwork",
            "vod_movie",
            "vod_series",
            "vod_episode",
            "watch_progress",
        ]
        extra_kwargs = {
            "genres": {"required": False, "allow_null": True},
            "studios": {"required": False, "allow_null": True},
            "cast": {"required": False, "allow_null": True},
            "crew": {"required": False, "allow_null": True},
            "tags": {"required": False, "allow_null": True},
            "metadata": {"required": False, "allow_null": True},
        }

    def get_watch_progress(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return None
        progress = obj.watch_progress.filter(user=user).first()
        if not progress:
            return None
        duration = progress.duration_ms or obj.runtime_ms
        return {
            "id": progress.id,
            "position_ms": progress.position_ms,
            "duration_ms": duration,
            "completed": progress.completed,
            "percentage": (progress.position_ms / duration) if duration else 0,
        }


class WatchProgressSerializer(serializers.ModelSerializer):
    user_display = serializers.CharField(source="user.username", read_only=True)
    media_title = serializers.CharField(source="media_item.title", read_only=True)

    class Meta:
        model = models.WatchProgress
        fields = [
            "id",
            "user",
            "user_display",
            "media_item",
            "media_title",
            "position_ms",
            "duration_ms",
            "completed",
            "last_watched_at",
        ]
        read_only_fields = ["id", "user_display", "media_title", "last_watched_at"]

    def create(self, validated_data):
        progress, _ = models.WatchProgress.objects.update_or_create(
            user=validated_data["user"],
            media_item=validated_data["media_item"],
            defaults={
                "position_ms": validated_data.get("position_ms", 0),
                "duration_ms": validated_data.get("duration_ms", 0),
                "completed": validated_data.get("completed", False),
            },
        )
        return progress

    def update(self, instance, validated_data):
        instance.position_ms = validated_data.get("position_ms", instance.position_ms)
        instance.duration_ms = max(
            instance.duration_ms, validated_data.get("duration_ms", instance.duration_ms)
        )
        instance.completed = validated_data.get("completed", instance.completed)
        instance.save()
        return instance
