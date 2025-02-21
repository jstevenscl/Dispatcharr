from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import M3UAccountViewSet, M3UFilterViewSet, ServerGroupViewSet, RefreshM3UAPIView, RefreshSingleM3UAPIView, UserAgentViewSet

app_name = 'm3u'

router = DefaultRouter()
router.register(r'accounts', M3UAccountViewSet, basename='m3u-account')
router.register(r'filters', M3UFilterViewSet, basename='m3u-filter')
router.register(r'server-groups', ServerGroupViewSet, basename='server-group')

urlpatterns = [
    path('refresh/', RefreshM3UAPIView.as_view(), name='m3u_refresh'),
    path('refresh/<int:account_id>/', RefreshSingleM3UAPIView.as_view(), name='m3u_refresh_single'),
]

urlpatterns += router.urls
