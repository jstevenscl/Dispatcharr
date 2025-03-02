import logging
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from django.utils import timezone
from datetime import timedelta
from .models import EPGSource, ProgramData  # Using ProgramData
from .serializers import ProgramDataSerializer, EPGSourceSerializer  # Updated serializer
from .tasks import refresh_epg_data

logger = logging.getLogger(__name__)

# ─────────────────────────────
# 1) EPG Source API (CRUD)
# ─────────────────────────────
class EPGSourceViewSet(viewsets.ModelViewSet):
    """Handles CRUD operations for EPG sources"""
    queryset = EPGSource.objects.all()
    serializer_class = EPGSourceSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        logger.debug("Listing all EPG sources.")
        return super().list(request, *args, **kwargs)

# ─────────────────────────────
# 2) Program API (CRUD)
# ─────────────────────────────
class ProgramViewSet(viewsets.ModelViewSet):
    """Handles CRUD operations for EPG programs"""
    queryset = ProgramData.objects.all()
    serializer_class = ProgramDataSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        logger.debug("Listing all EPG programs.")
        return super().list(request, *args, **kwargs)

# ─────────────────────────────
# 3) EPG Grid View
# ─────────────────────────────
class EPGGridAPIView(APIView):
    """Returns all programs airing in the next 12 hours"""

    @swagger_auto_schema(
        operation_description="Retrieve upcoming EPG programs within the next 12 hours",
        responses={200: ProgramDataSerializer(many=True)}
    )
    def get(self, request, format=None):
        # Get current date and reset time to midnight (00:00)
        now = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        twelve_hours_later = now + timedelta(hours=24)
        logger.debug(f"EPGGridAPIView: Querying programs between {now} and {twelve_hours_later}.")
        # Use select_related to prefetch EPGData (no channel relation now)
        programs = ProgramData.objects.select_related('epg').filter(
            start_time__gte=now, start_time__lte=twelve_hours_later
        )
        count = programs.count()
        logger.debug(f"EPG`Grid`APIView: Found {count} program(s).")
        serializer = ProgramDataSerializer(programs, many=True)
        return Response({'data': serializer.data}, status=status.HTTP_200_OK)

# ─────────────────────────────
# 4) EPG Import View
# ─────────────────────────────
class EPGImportAPIView(APIView):
    """Triggers an EPG data refresh"""

    @swagger_auto_schema(
        operation_description="Triggers an EPG data import",
        responses={202: "EPG data import initiated"}
    )
    def post(self, request, format=None):
        logger.info("EPGImportAPIView: Received request to import EPG data.")
        refresh_epg_data.delay()  # Trigger Celery task
        logger.info("EPGImportAPIView: Task dispatched to refresh EPG data.")
        return Response({'success': True, 'message': 'EPG data import initiated.'}, status=status.HTTP_202_ACCEPTED)
