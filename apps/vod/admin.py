from django.contrib import admin
from .models import Series, VODCategory, VODConnection, Movie, Episode


@admin.register(VODCategory)
class VODCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category_type', 'm3u_account', 'created_at']
    list_filter = ['category_type', 'm3u_account', 'created_at']
    search_fields = ['name']


@admin.register(Series)
class SeriesAdmin(admin.ModelAdmin):
    list_display = ['name', 'year', 'genre', 'm3u_account', 'created_at']
    list_filter = ['m3u_account', 'category', 'year', 'created_at']
    search_fields = ['name', 'description', 'series_id']
    readonly_fields = ['uuid', 'created_at', 'updated_at']


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ['name', 'year', 'genre', 'duration', 'm3u_account', 'created_at']
    list_filter = ['m3u_account', 'category', 'year', 'created_at']
    search_fields = ['name', 'description', 'stream_id']
    readonly_fields = ['uuid', 'created_at', 'updated_at']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('category', 'logo', 'm3u_account')


@admin.register(Episode)
class EpisodeAdmin(admin.ModelAdmin):
    list_display = ['name', 'series', 'season_number', 'episode_number', 'duration', 'm3u_account', 'created_at']
    list_filter = ['m3u_account', 'series', 'season_number', 'created_at']
    search_fields = ['name', 'description', 'stream_id', 'series__name']
    readonly_fields = ['uuid', 'created_at', 'updated_at']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('series', 'm3u_account')


@admin.register(VODConnection)
class VODConnectionAdmin(admin.ModelAdmin):
    list_display = ['get_content_name', 'client_ip', 'client_id', 'connected_at', 'last_activity', 'position_seconds']
    list_filter = ['connected_at', 'last_activity']
    search_fields = ['client_ip', 'client_id']
    readonly_fields = ['connected_at']

    def get_content_name(self, obj):
        if obj.content_object:
            return obj.content_object.name
        elif obj.vod:
            return obj.vod.name
        return "Unknown"
    get_content_name.short_description = "Content"

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('content_object', 'm3u_profile')
