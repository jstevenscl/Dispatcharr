from django.urls import path, include
from .views import generate_m3u
from core.views import stream_view


app_name = 'output'

urlpatterns = [
    path('m3u/', generate_m3u, name='generate_m3u'),
    path('stream/<int:stream_id>/', stream_view, name='stream'),
]
