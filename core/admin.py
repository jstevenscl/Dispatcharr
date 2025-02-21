# core/admin.py

from django.contrib import admin
from .models import UserAgent, StreamProfile, CoreSettings

@admin.register(UserAgent)
class UserAgentAdmin(admin.ModelAdmin):
    list_display = (
        "user_agent_name",
        "user_agent",
        "description",
        "is_active",
        "created_at",
        "updated_at",
    )
    search_fields = ("user_agent_name", "user_agent", "description")
    list_filter = ("is_active",)
    readonly_fields = ("created_at", "updated_at")

@admin.register(StreamProfile)
class StreamProfileAdmin(admin.ModelAdmin):
    list_display = (
        "profile_name",
        "command",
        "is_active",
        "user_agent",
    )
    search_fields = ("profile_name", "command", "user_agent")
    list_filter = ("is_active",)

@admin.register(CoreSettings)
class CoreSettingsAdmin(admin.ModelAdmin):
    """
    Because CoreSettings is typically a single 'singleton' row,
    you can either allow multiple or restrict it. For now, we
    just list and allow editing of any instance.
    """
    list_display = (
        "default_user_agent",
        "default_stream_profile",
        "stream_command_timeout",
        "enable_stream_logging",
        "useragent_cache_timeout",
        "streamprofile_cache_timeout",
        "streamlink_path",
        "vlc_path",
    )
    fieldsets = (
        (None, {
            "fields": (
                "default_user_agent",
                "default_stream_profile",
                "stream_command_timeout",
                "enable_stream_logging",
            )
        }),
        ("Caching", {
            "fields": (
                "useragent_cache_timeout",
                "streamprofile_cache_timeout",
            )
        }),
        ("Paths", {
            "fields": (
                "streamlink_path",
                "vlc_path",
            )
        }),
    )
