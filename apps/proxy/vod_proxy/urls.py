from django.urls import path
from . import views

app_name = 'vod_proxy'

urlpatterns = [
    path('stream/<uuid:vod_uuid>', views.stream_vod, name='stream_vod'),
    path('stream/<uuid:vod_uuid>/position', views.update_position, name='update_position'),
]
