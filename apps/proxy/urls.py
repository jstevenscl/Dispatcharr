from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'proxy', views.ProxyViewSet, basename='proxy')

app_name = 'proxy'

urlpatterns = [
    path('api/', include(router.urls)),
    path('hls/', include('apps.proxy.hls_proxy.urls')),
    path('ts/', include('apps.proxy.ts_proxy.urls')),
]