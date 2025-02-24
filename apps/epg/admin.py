from django.contrib import admin
from .models import EPGSource, ProgramData

@admin.register(EPGSource)
class EPGSourceAdmin(admin.ModelAdmin):
    list_display = ['name', 'source_type', 'is_active']
    list_filter = ['source_type', 'is_active']
    search_fields = ['name']

@admin.register(ProgramData)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ['title', 'get_channel_tvg_id', 'start_time', 'end_time']
    list_filter = ['epg__channel']  # updated here
    search_fields = ['title', 'epg__channel__channel_name']  # updated here

    def get_channel_tvg_id(self, obj):
        return obj.epg.channel.tvg_id if obj.epg and obj.epg.channel else ''
    get_channel_tvg_id.short_description = 'Channel TVG ID'
    get_channel_tvg_id.admin_order_field = 'epg__channel__tvg_id'
