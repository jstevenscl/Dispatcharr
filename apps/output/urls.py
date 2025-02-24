from django.urls import path, include
from .views import generate_m3u, generate_epg
from core.views import stream_view


app_name = 'output'

urlpatterns = [
    path('m3u/', generate_m3u, name='generate_m3u'),
    path('epg/', generate_epg, name='generate_epg'),
    path('stream/<int:stream_id>/', stream_view, name='stream'),
]
