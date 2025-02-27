from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
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
    # API Routes
    path('api/', include(('apps.api.urls', 'api'), namespace='api')),
    path('output/', include('apps.output.urls', namespace='output')),

    # Admin
    path('admin/', admin.site.urls),

    # Swagger UI
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),

    # ReDoc UI
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),

    # Optionally, serve the raw Swagger JSON
    path('swagger.json', schema_view.without_ui(cache_timeout=0), name='schema-json'),

    # Catch-all route to serve React's index.html for non-API, non-admin paths
    path('', TemplateView.as_view(template_name='index.html')),  # React entry point

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve static files for development (React's JS, CSS, etc.)
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [path('<path:unused_path>', TemplateView.as_view(template_name='index.html'))]
