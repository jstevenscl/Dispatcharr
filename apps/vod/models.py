from django.db import models
from django.utils import timezone
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from apps.m3u.models import M3UAccount
from apps.channels.models import Logo
import uuid


class VODCategory(models.Model):
    """Categories for organizing VODs (e.g., Action, Comedy, Drama)"""

    CATEGORY_TYPE_CHOICES = [
        ('movie', 'Movie'),
        ('series', 'Series'),
    ]

    name = models.CharField(max_length=255)
    category_type = models.CharField(
        max_length=10,
        choices=CATEGORY_TYPE_CHOICES,
        default='movie',
        help_text="Type of content this category contains"
    )
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        related_name='vod_categories',
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "VOD Category"
        verbose_name_plural = "VOD Categories"
        ordering = ['name']
        unique_together = ['name', 'm3u_account', 'category_type']

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"


class Series(models.Model):
    """Series information for TV shows"""
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    rating = models.CharField(max_length=10, blank=True, null=True)
    genre = models.CharField(max_length=255, blank=True, null=True)
    logo = models.ForeignKey(Logo, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey(VODCategory, on_delete=models.SET_NULL, null=True, blank=True)
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        related_name='series'
    )
    series_id = models.CharField(max_length=255, help_text="External series ID from M3U provider")
    tmdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="TMDB ID for metadata")
    imdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="IMDB ID for metadata")
    custom_properties = models.JSONField(blank=True, null=True, help_text="JSON data for additional properties")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_episode_refresh = models.DateTimeField(blank=True, null=True, help_text="Last time episodes were refreshed")

    class Meta:
        verbose_name = "Series"
        verbose_name_plural = "Series"
        ordering = ['name']
        unique_together = ['series_id', 'm3u_account']

    def __str__(self):
        return f"{self.name} ({self.year or 'Unknown'})"


class Movie(models.Model):
    """Movie content"""
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    rating = models.CharField(max_length=10, blank=True, null=True)
    genre = models.CharField(max_length=255, blank=True, null=True)
    duration = models.IntegerField(blank=True, null=True, help_text="Duration in minutes")

    # Streaming information
    url = models.URLField(max_length=2048)
    logo = models.ForeignKey(Logo, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey(VODCategory, on_delete=models.SET_NULL, null=True, blank=True)

    # M3U relationship
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        related_name='movies'
    )
    stream_id = models.CharField(max_length=255, help_text="External stream ID from M3U provider")
    container_extension = models.CharField(max_length=10, blank=True, null=True)

    # Metadata IDs
    tmdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="TMDB ID for metadata")
    imdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="IMDB ID for metadata")

    # Additional properties
    custom_properties = models.JSONField(blank=True, null=True, help_text="JSON data for additional properties")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Movie"
        verbose_name_plural = "Movies"
        ordering = ['name']
        unique_together = ['stream_id', 'm3u_account']

    def __str__(self):
        return f"{self.name} ({self.year or 'Unknown'})"

    def get_stream_url(self):
        """Generate the proxied stream URL for this movie"""
        return f"/proxy/vod/movie/{self.uuid}"


class Episode(models.Model):
    """Episode content for TV series"""
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    release_date = models.DateField(blank=True, null=True)
    rating = models.CharField(max_length=10, blank=True, null=True)
    duration = models.IntegerField(blank=True, null=True, help_text="Duration in minutes")

    # Episode specific fields
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name='episodes')
    season_number = models.IntegerField(blank=True, null=True)
    episode_number = models.IntegerField(blank=True, null=True)

    # Streaming information
    url = models.URLField(max_length=2048)

    # M3U relationship
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        related_name='episodes'
    )
    stream_id = models.CharField(max_length=255, help_text="External stream ID from M3U provider")
    container_extension = models.CharField(max_length=10, blank=True, null=True)

    # Metadata IDs
    tmdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="TMDB ID for metadata")
    imdb_id = models.CharField(max_length=50, blank=True, null=True, help_text="IMDB ID for metadata")

    # Additional properties
    custom_properties = models.JSONField(blank=True, null=True, help_text="JSON data for additional properties")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Episode"
        verbose_name_plural = "Episodes"
        ordering = ['series__name', 'season_number', 'episode_number']
        unique_together = ['stream_id', 'm3u_account']

    def __str__(self):
        season_ep = f"S{self.season_number:02d}E{self.episode_number:02d}" if self.season_number and self.episode_number else ""
        return f"{self.series.name} {season_ep} - {self.name}"

    def get_stream_url(self):
        """Generate the proxied stream URL for this episode"""
        return f"/proxy/vod/episode/{self.uuid}"

class VODConnection(models.Model):
    """Track active VOD connections for connection limit management"""
    # Use generic foreign key to support both Movie and Episode
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')

    m3u_profile = models.ForeignKey(
        'm3u.M3UAccountProfile',
        on_delete=models.CASCADE,
        related_name='vod_connections'
    )
    client_id = models.CharField(max_length=255)
    client_ip = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, null=True)
    connected_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    bytes_sent = models.BigIntegerField(default=0)
    position_seconds = models.IntegerField(default=0, help_text="Current playback position")

    class Meta:
        verbose_name = "VOD Connection"
        verbose_name_plural = "VOD Connections"

    def __str__(self):
        content_name = getattr(self.content_object, 'name', 'Unknown') if self.content_object else 'Unknown'
        return f"{content_name} - {self.client_ip} ({self.client_id})"

    def update_activity(self, bytes_sent=0, position=0):
        """Update connection activity"""
        self.last_activity = timezone.now()
        if bytes_sent:
            self.bytes_sent += bytes_sent
        if position:
            self.position_seconds = position
        self.save(update_fields=['last_activity', 'bytes_sent', 'position_seconds'])
