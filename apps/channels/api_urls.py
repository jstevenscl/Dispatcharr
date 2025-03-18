from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    StreamViewSet,
    ChannelViewSet,
    ChannelGroupViewSet,
    BulkDeleteStreamsAPIView,
    BulkDeleteChannelsAPIView,
)

app_name = 'channels'  # for DRF routing

router = DefaultRouter()
router.register(r'streams', StreamViewSet, basename='stream')
router.register(r'groups', ChannelGroupViewSet, basename='channel-group')
router.register(r'channels', ChannelViewSet, basename='channel')

urlpatterns = [
    # Bulk delete is a single APIView, not a ViewSet
    path('streams/bulk-delete/', BulkDeleteStreamsAPIView.as_view(), name='bulk_delete_streams'),
    path('channels/bulk-delete/', BulkDeleteChannelsAPIView.as_view(), name='bulk_delete_channels'),
]

urlpatterns += router.urls
