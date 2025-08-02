from django.contrib import admin
from .models import VOD, Series, VODCategory, VODConnection


@admin.register(VODCategory)
class VODCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'm3u_account', 'created_at']
    list_filter = ['m3u_account', 'created_at']
    search_fields = ['name']


@admin.register(Series)
class SeriesAdmin(admin.ModelAdmin):
    list_display = ['name', 'year', 'genre', 'm3u_account', 'created_at']
    list_filter = ['m3u_account', 'category', 'year', 'created_at']
    search_fields = ['name', 'description', 'series_id']
    readonly_fields = ['uuid', 'created_at', 'updated_at']


@admin.register(VOD)
class VODAdmin(admin.ModelAdmin):
    list_display = ['name', 'type', 'series', 'season_number', 'episode_number', 'year', 'm3u_account']
    list_filter = ['type', 'm3u_account', 'category', 'year', 'created_at']
    search_fields = ['name', 'description', 'stream_id']
    readonly_fields = ['uuid', 'created_at', 'updated_at']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('series', 'm3u_account', 'category')


@admin.register(VODConnection)
class VODConnectionAdmin(admin.ModelAdmin):
    list_display = ['vod', 'client_ip', 'client_id', 'connected_at', 'last_activity', 'position_seconds']
    list_filter = ['connected_at', 'last_activity']
    search_fields = ['client_ip', 'client_id', 'vod__name']
    readonly_fields = ['connected_at']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('vod', 'm3u_profile')
