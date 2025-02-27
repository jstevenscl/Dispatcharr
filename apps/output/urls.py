from django.urls import path, re_path, include
from .views import generate_m3u, generate_epg
from core.views import stream_view

app_name = 'output'

urlpatterns = [
    # Allow both `/m3u` and `/m3u/`
    re_path(r'^m3u/?$', generate_m3u, name='generate_m3u'),
    
    # Allow both `/epg` and `/epg/`
    re_path(r'^epg/?$', generate_epg, name='generate_epg'),
    
    # Allow both `/stream/<int:stream_id>` and `/stream/<int:stream_id>/`
    re_path(r'^stream/(?P<stream_id>\d+)/?$', stream_view, name='stream'),
]
