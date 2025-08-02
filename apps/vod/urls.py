from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import VODViewSet, SeriesViewSet, VODCategoryViewSet, VODConnectionViewSet

app_name = 'vod'

router = DefaultRouter()
router.register(r'vods', VODViewSet)
router.register(r'series', SeriesViewSet)
router.register(r'categories', VODCategoryViewSet)
router.register(r'connections', VODConnectionViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]
