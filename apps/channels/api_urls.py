from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    StreamViewSet,
    ChannelViewSet,
    ChannelGroupViewSet,
    BulkDeleteStreamsAPIView,
    BulkDeleteChannelsAPIView,
    LogoViewSet,
    ChannelProfileViewSet,
    UpdateChannelMembershipAPIView,
    BulkUpdateChannelMembershipAPIView,
)

app_name = 'channels'  # for DRF routing

router = DefaultRouter()
router.register(r'streams', StreamViewSet, basename='stream')
router.register(r'groups', ChannelGroupViewSet, basename='channel-group')
router.register(r'channels', ChannelViewSet, basename='channel')
router.register(r'logos', LogoViewSet, basename='logo')
router.register(r'profiles', ChannelProfileViewSet, basename='profile')

urlpatterns = [
    # Bulk delete is a single APIView, not a ViewSet
    path('streams/bulk-delete/', BulkDeleteStreamsAPIView.as_view(), name='bulk_delete_streams'),
    path('channels/bulk-delete/', BulkDeleteChannelsAPIView.as_view(), name='bulk_delete_channels'),
    path('profiles/<int:profile_id>/channels/<int:channel_id>/', UpdateChannelMembershipAPIView.as_view(), name='update_channel_membership'),
    path('profiles/<int:profile_id>/channels/bulk-update/', BulkUpdateChannelMembershipAPIView.as_view(), name='bulk_update_channel_membership'),
]

urlpatterns += router.urls
