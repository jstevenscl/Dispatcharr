from django.urls import path
from . import views

app_name = 'vod_proxy'

urlpatterns = [
    # Generic VOD streaming (supports movies, episodes, series)
    path('<str:content_type>/<uuid:content_id>', views.VODStreamView.as_view(), name='vod_stream'),
    path('<str:content_type>/<uuid:content_id>/<int:profile_id>/', views.VODStreamView.as_view(), name='vod_stream_with_profile'),

    # VOD playlist generation
    path('playlist/', views.VODPlaylistView.as_view(), name='vod_playlist'),
    path('playlist/<int:profile_id>/', views.VODPlaylistView.as_view(), name='vod_playlist_with_profile'),

    # Position tracking
    path('position/<uuid:content_id>/', views.VODPositionView.as_view(), name='vod_position'),
]
