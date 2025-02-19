from django.urls import path, include
from .views import generate_m3u

app_name = 'output'

urlpatterns = [
    path('m3u/', generate_m3u, name='generate_m3u'),
    path('stream/', include(('apps.ffmpeg.urls', 'ffmpeg'), namespace='ffmpeg')),
]
