from django.db import models
from django.utils import timezone
from apps.m3u.models import M3UAccount
from apps.channels.models import Logo
import uuid


class VODCategory(models.Model):
    """Categories for organizing VODs (e.g., Action, Comedy, Drama)"""
    name = models.CharField(max_length=255, unique=True)
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

    def __str__(self):
        return self.name


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

    class Meta:
        verbose_name = "Series"
        verbose_name_plural = "Series"
        ordering = ['name']
        unique_together = ['series_id', 'm3u_account']

    def __str__(self):
        return f"{self.name} ({self.year or 'Unknown'})"


class VOD(models.Model):
    """Video on Demand content (Movies and Episodes)"""
    TYPE_CHOICES = [
        ('movie', 'Movie'),
        ('episode', 'Episode'),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    rating = models.CharField(max_length=10, blank=True, null=True)
    genre = models.CharField(max_length=255, blank=True, null=True)
    duration = models.IntegerField(blank=True, null=True, help_text="Duration in minutes")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='movie')

    # Episode specific fields
    series = models.ForeignKey(Series, on_delete=models.CASCADE, null=True, blank=True, related_name='episodes')
    season_number = models.IntegerField(blank=True, null=True)
    episode_number = models.IntegerField(blank=True, null=True)

    # Streaming information
    url = models.URLField(max_length=2048)
    logo = models.ForeignKey(Logo, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey(VODCategory, on_delete=models.SET_NULL, null=True, blank=True)

    # M3U relationship
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        related_name='vods'
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
        verbose_name = "VOD"
        verbose_name_plural = "VODs"
        ordering = ['name', 'season_number', 'episode_number']
        unique_together = ['stream_id', 'm3u_account']

    def __str__(self):
        if self.type == 'episode' and self.series:
            season_ep = f"S{self.season_number:02d}E{self.episode_number:02d}" if self.season_number and self.episode_number else ""
            return f"{self.series.name} {season_ep} - {self.name}"
        return f"{self.name} ({self.year or 'Unknown'})"

    def get_stream_url(self):
        """Generate the proxied stream URL for this VOD"""
        return f"/proxy/vod/stream/{self.uuid}"


class VODConnection(models.Model):
    """Track active VOD connections for connection limit management"""
    vod = models.ForeignKey(VOD, on_delete=models.CASCADE, related_name='connections')
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
        unique_together = ['vod', 'client_id']

    def __str__(self):
        return f"{self.vod.name} - {self.client_ip} ({self.client_id})"

    def update_activity(self, bytes_sent=0, position=0):
        """Update connection activity"""
        self.last_activity = timezone.now()
        if bytes_sent:
            self.bytes_sent += bytes_sent
        if position:
            self.position_seconds = position
        self.save(update_fields=['last_activity', 'bytes_sent', 'position_seconds'])
