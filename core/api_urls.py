# core/api_urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    UserAgentViewSet,
    StreamProfileViewSet,
    CoreSettingsViewSet,
    environment,
    version,
    rehash_streams_endpoint,
    latest_release,
)

router = DefaultRouter()
router.register(r'useragents', UserAgentViewSet, basename='useragent')
router.register(r'streamprofiles', StreamProfileViewSet, basename='streamprofile')
router.register(r'settings', CoreSettingsViewSet, basename='coresettings')
urlpatterns = [
    path('settings/env/', environment, name='token_refresh'),
    path('version/', version, name='version'),
    path('latest-release/', latest_release, name='latest_release'),
    path('rehash-streams/', rehash_streams_endpoint, name='rehash_streams'),
    path('', include(router.urls)),
]
