from django.contrib import admin
from .models import Stream, Channel, ChannelGroup

@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'name', 'group_name', 'custom_url',
        'current_viewers', 'is_transcoded', 'updated_at',
    )
    list_filter = ('group_name', 'is_transcoded')
    search_fields = ('name', 'custom_url', 'group_name')
    ordering = ('-updated_at',)

@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = (
        'channel_number', 'channel_name', 'channel_group', 'tvg_name'
    )
    list_filter = ('channel_group',)
    search_fields = ('channel_name', 'channel_group__name', 'tvg_name')
    ordering = ('channel_number',)

@admin.register(ChannelGroup)
class ChannelGroupAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)
