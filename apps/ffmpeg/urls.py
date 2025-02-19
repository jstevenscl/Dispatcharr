from django.urls import path
from .views import stream_view, serve_hls_segment

app_name = 'ffmpeg'

urlpatterns = [
    path('<int:stream_id>/', stream_view, name='stream'),
    path('<int:stream_id>/<str:filename>/', serve_hls_segment, name='serve_hls_segment'),
]
