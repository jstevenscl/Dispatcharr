# core/api_views.py

from rest_framework import viewsets, status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import UserAgent, StreamProfile, CoreSettings
from .serializers import UserAgentSerializer, StreamProfileSerializer, CoreSettingsSerializer
from rest_framework.permissions import IsAuthenticated

class UserAgentViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows user agents to be viewed, created, edited, or deleted.
    """
    queryset = UserAgent.objects.all()
    serializer_class = UserAgentSerializer

class StreamProfileViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows stream profiles to be viewed, created, edited, or deleted.
    """
    queryset = StreamProfile.objects.all()
    serializer_class = StreamProfileSerializer

class CoreSettingsViewSet(viewsets.ModelViewSet):
    """
    API endpoint for editing core settings.
    This is treated as a singleton: only one instance should exist.
    """
    queryset = CoreSettings.objects.all()
    serializer_class = CoreSettingsSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if CoreSettings.objects.exists():
            return Response(
                {"detail": "Core settings already exist. Use PUT to update."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().create(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        # Always return the singleton instance (creating it if needed)
        settings_instance, created = CoreSettings.objects.get_or_create(pk=1)
        serializer = self.get_serializer(settings_instance)
        return Response([serializer.data])  # Return as a list for DRF router compatibility

    def retrieve(self, request, *args, **kwargs):
        # Retrieve the singleton instance
        settings_instance = get_object_or_404(CoreSettings, pk=1)
        serializer = self.get_serializer(settings_instance)
        return Response(serializer.data)



