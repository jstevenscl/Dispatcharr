from django.urls import path
from . import views

app_name = 'vod_proxy'

urlpatterns = [
    # Movie streaming
    path('movie/<uuid:movie_uuid>', views.stream_movie, name='stream_movie'),
    path('movie/<uuid:movie_uuid>/position', views.update_movie_position, name='update_movie_position'),

    # Episode streaming
    path('episode/<uuid:episode_uuid>', views.stream_episode, name='stream_episode'),
    path('episode/<uuid:episode_uuid>/position', views.update_episode_position, name='update_episode_position'),
]
