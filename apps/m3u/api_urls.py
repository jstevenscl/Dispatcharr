from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import M3UAccountViewSet, M3UFilterViewSet, ServerGroupViewSet, RefreshM3UAPIView, RefreshSingleM3UAPIView, UserAgentViewSet, M3UAccountProfileViewSet

app_name = 'm3u'

router = DefaultRouter()
router.register(r'accounts', M3UAccountViewSet, basename='m3u-account')
router.register(r'filters', M3UFilterViewSet, basename='m3u-filter')
router.register(r'server-groups', ServerGroupViewSet, basename='server-group')
router.register(r'profiles', M3UAccountViewSet, basename='m3u-account-profiles')

urlpatterns = [
    path('refresh/', RefreshM3UAPIView.as_view(), name='m3u_refresh'),
    path('refresh/<int:account_id>/', RefreshSingleM3UAPIView.as_view(), name='m3u_refresh_single'),
    path('accounts/<int:m3u_account_id>/profiles/', M3UAccountProfileViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('accounts/<int:m3u_account_id>/profiles/<int:pk>/', M3UAccountProfileViewSet.as_view({'put': 'update', 'delete': 'destroy'})),
]

urlpatterns += router.urls
