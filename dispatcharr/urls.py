from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

# Define schema_view for Swagger
schema_view = get_schema_view(
    openapi.Info(
        title="Dispatcharr API",
        default_version='v1',
        description="API documentation for Dispatcharr",
        terms_of_service="https://www.google.com/policies/terms/",
        contact=openapi.Contact(email="contact@dispatcharr.local"),
        license=openapi.License(name="Unlicense"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)



urlpatterns = [
    path('', RedirectView.as_view(pattern_name='dashboard:dashboard'), name='home'),
    path('api/', include(('apps.api.urls', 'api'), namespace='api')),
    path('admin/', admin.site.urls),

    #path('accounts/', include(('apps.accounts.urls', 'accounts'), namespace='accounts')),
    #path('streams/', include(('apps.streams.urls', 'streams'), namespace='streams')),
    #path('hdhr/', include(('apps.hdhr.urls', 'hdhr'), namespace='hdhr')),
    path('m3u/', include(('apps.m3u.urls', 'm3u'), namespace='m3u')),
    path('epg/', include(('apps.epg.urls', 'epg'), namespace='epg')),
    path('channels/', include(('apps.channels.urls', 'channels'), namespace='channels')),
    #path('settings/', include(('apps.settings.urls', 'settings'), namespace='settings')),
    #path('backup/', include(('apps.backup.urls', 'backup'), namespace='backup')),
    path('dashboard/', include(('apps.dashboard.urls', 'dashboard'), namespace='dashboard')),
    path('output/', include('apps.output.urls', namespace='output')),
    path('stream/', include(('apps.ffmpeg.urls', 'ffmpeg'), namespace='ffmpeg')),


    # Swagger UI:
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    
    # ReDoc UI:
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    
    # Optionally, you can also serve the raw JSON:
    path('swagger.json', schema_view.without_ui(cache_timeout=0), name='schema-json'),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )