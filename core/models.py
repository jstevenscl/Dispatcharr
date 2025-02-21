# core/models.py
from django.db import models

class UserAgent(models.Model):
    user_agent_name = models.CharField(
        max_length=512,
        unique=True,
        help_text="The User-Agent name."
    )
    user_agent = models.CharField(
        max_length=512,
        unique=True,
        help_text="The complete User-Agent string sent by the client."
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="An optional description of the client or device type."
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this user agent is currently allowed/recognized."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user_agent_name

class StreamProfile(models.Model):
    profile_name = models.CharField(max_length=255, help_text="Name of the stream profile")
    command = models.CharField(
        max_length=255,
        help_text="Command to execute (e.g., 'yt.sh', 'streamlink', or 'vlc')"
    )
    parameters = models.TextField(
        help_text="Command-line parameters. Use {userAgent} and {streamUrl} as placeholders."
    )
    is_active = models.BooleanField(default=True, help_text="Whether this profile is active")
    user_agent = models.CharField(
        max_length=512,
        blank=True,
        null=True,
        help_text="Optional user agent to use. If not set, you can fall back to a default."
    )

    def __str__(self):
        return self.profile_name


class CoreSettings(models.Model):
    default_user_agent = models.CharField(
        max_length=512,
        default="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36",
        help_text="The default User-Agent string to use if none is provided."
    )
    default_stream_profile = models.CharField(
        max_length=255,
        default="default_profile",
        help_text="Name or identifier for the default stream profile."
    )
    stream_command_timeout = models.PositiveIntegerField(
        default=300,
        help_text="Timeout in seconds for running stream commands."
    )
    enable_stream_logging = models.BooleanField(
        default=True,
        help_text="Toggle verbose logging for stream commands."
    )
    useragent_cache_timeout = models.PositiveIntegerField(
        default=300,
        help_text="Cache timeout in seconds for user agent data."
    )
    streamprofile_cache_timeout = models.PositiveIntegerField(
        default=300,
        help_text="Cache timeout in seconds for stream profile data."
    )
    streamlink_path = models.CharField(
        max_length=255,
        default="/usr/bin/streamlink",
        help_text="Override path for the streamlink command."
    )
    vlc_path = models.CharField(
        max_length=255,
        default="/usr/bin/vlc",
        help_text="Override path for the VLC command."
    )

    def __str__(self):
        return "Core Settings"

    class Meta:
        verbose_name = "Core Setting"
        verbose_name_plural = "Core Settings"
