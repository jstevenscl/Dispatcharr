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

    def build_command(self, stream_url):
        cmd = []
        if self.command == "ffmpeg":
            cmd = ["ffmpeg", "-i", stream_url] + self.parameters.split() + ["pipe:1"]
        elif self.command == "streamlink":
            cmd = ["streamlink", stream_url] + self.parameters.split()

        return cmd

class CoreSettings(models.Model):
    key = models.CharField(
        max_length=255,
        unique=True,
    )
    name = models.CharField(
        max_length=255,
    )
    value = models.CharField(
        max_length=255,
    )

    def __str__(self):
        return "Core Settings"
