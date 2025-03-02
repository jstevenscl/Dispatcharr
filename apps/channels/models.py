from django.db import models
from django.core.exceptions import ValidationError
from core.models import StreamProfile

# If you have an M3UAccount model in apps.m3u, you can still import it:
from apps.m3u.models import M3UAccount

class Stream(models.Model):
    """
    Represents a single stream (e.g. from an M3U source or custom URL).
    """
    name = models.CharField(max_length=255, default="Default Stream")
    url = models.URLField()
    custom_url = models.URLField(max_length=2000, blank=True, null=True)
    m3u_account = models.ForeignKey(
        M3UAccount,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="streams"
    )
    logo_url = models.URLField(max_length=2000, blank=True, null=True)
    tvg_id = models.CharField(max_length=255, blank=True, null=True)
    local_file = models.FileField(upload_to='uploads/', blank=True, null=True)
    current_viewers = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    group_name = models.CharField(max_length=255, blank=True, null=True)
    stream_profile = models.ForeignKey(
        StreamProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='streams'
    )
    class Meta:
        # If you use m3u_account, you might do unique_together = ('name','custom_url','m3u_account')
        verbose_name = "Stream"
        verbose_name_plural = "Streams"
        ordering = ['-updated_at']

    def __str__(self):
        return self.name or self.custom_url or f"Stream ID {self.id}"


class ChannelManager(models.Manager):
    def active(self):
        return self.all()


class Channel(models.Model):
    channel_number = models.IntegerField()
    channel_name = models.CharField(max_length=255)
    logo_url = models.URLField(max_length=2000, blank=True, null=True)
    logo_file = models.ImageField(
        upload_to='logos/',  # Will store in MEDIA_ROOT/logos
        blank=True,
        null=True
    )

    # M2M to Stream now in the same file
    streams = models.ManyToManyField(
        Stream,
        blank=True,
        through='ChannelStream',
        related_name='channels'
    )

    channel_group = models.ForeignKey(
        'ChannelGroup',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='channels',
        help_text="Channel group this channel belongs to."
    )
    tvg_id = models.CharField(max_length=255, blank=True, null=True)
    tvg_name = models.CharField(max_length=255, blank=True, null=True)
    objects = ChannelManager()

    stream_profile = models.ForeignKey(
        StreamProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='channels'
    )


    def clean(self):
        # Enforce unique channel_number within a given group
        existing = Channel.objects.filter(
            channel_number=self.channel_number,
            channel_group=self.channel_group
        ).exclude(id=self.id)
        if existing.exists():
            raise ValidationError(
                f"Channel number {self.channel_number} already exists in group {self.channel_group}."
            )

    def __str__(self):
        return f"{self.channel_number} - {self.channel_name}"


class ChannelGroup(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def related_channels(self):
        # local import if needed to avoid cyc. Usually fine in a single file though
        return Channel.objects.filter(channel_group=self)

    def __str__(self):
        return self.name

class ChannelStream(models.Model):
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE)
    stream = models.ForeignKey(Stream, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)  # Ordering field

    class Meta:
        ordering = ['order']  # Ensure streams are retrieved in order
