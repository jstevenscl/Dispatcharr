from django.contrib import admin
from .models import Stream, Channel, ChannelGroup

@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = (
        'id',  # Primary Key
        'name', 
        'group_name', 
        'custom_url',
        'current_viewers', 
        'updated_at',
    )
    list_filter = ('group_name',)
    search_fields = ('id', 'name', 'custom_url', 'group_name')  # Added 'id' for searching by ID
    ordering = ('-updated_at',)

@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = (
        'id',  # Primary Key
        'channel_number', 
        'channel_name', 
        'channel_group', 
        'tvg_name'
    )
    list_filter = ('channel_group',)
    search_fields = ('id', 'channel_name', 'channel_group__name', 'tvg_name')  # Added 'id'
    ordering = ('channel_number',)

@admin.register(ChannelGroup)
class ChannelGroupAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')  # Added 'id'
    search_fields = ('id', 'name')  # Added 'id'
