from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from django.shortcuts import get_object_or_404

from .models import Stream, Channel, ChannelGroup
from .serializers import StreamSerializer, ChannelSerializer, ChannelGroupSerializer

# ─────────────────────────────────────────────────────────
# 1) Stream API (CRUD)
# ─────────────────────────────────────────────────────────
class StreamViewSet(viewsets.ModelViewSet):
    queryset = Stream.objects.all()
    serializer_class = StreamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Exclude streams from inactive M3U accounts
        qs = qs.exclude(m3u_account__is_active=False)
        
        assigned = self.request.query_params.get('assigned')
        if assigned is not None:
            qs = qs.filter(channels__id=assigned)
        
        unassigned = self.request.query_params.get('unassigned')
        if unassigned == '1':
            qs = qs.filter(channels__isnull=True)
        
        return qs

# ─────────────────────────────────────────────────────────
# 2) Channel Group Management (CRUD)
# ─────────────────────────────────────────────────────────
class ChannelGroupViewSet(viewsets.ModelViewSet):
    queryset = ChannelGroup.objects.all()
    serializer_class = ChannelGroupSerializer
    permission_classes = [IsAuthenticated]

# ─────────────────────────────────────────────────────────
# 3) Channel Management (CRUD)
# ─────────────────────────────────────────────────────────
class ChannelViewSet(viewsets.ModelViewSet):
    queryset = Channel.objects.all()
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        method='post',
        operation_description="Auto-assign channel_number in bulk by an ordered list of channel IDs.",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=["channel_order"],
            properties={
                "channel_order": openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Items(type=openapi.TYPE_INTEGER),
                    description="List of channel IDs in the new order"
                )
            }
        ),
        responses={200: "Channels have been auto-assigned!"}
    )
    @action(detail=False, methods=['post'], url_path='assign')
    def assign(self, request):
        channel_order = request.data.get('channel_order', [])
        for order, channel_id in enumerate(channel_order, start=1):
            Channel.objects.filter(id=channel_id).update(channel_number=order)
        return Response({"message": "Channels have been auto-assigned!"}, status=status.HTTP_200_OK)

    @swagger_auto_schema(
        method='post',
        operation_description=(
            "Create a new channel from an existing stream.\n"
            "Request body must contain: 'stream_id', 'channel_number', 'channel_name'."
        ),
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=["stream_id", "channel_number", "channel_name"],
            properties={
                "stream_id": openapi.Schema(
                    type=openapi.TYPE_INTEGER, description="ID of the stream to link"
                ),
                "channel_number": openapi.Schema(
                    type=openapi.TYPE_INTEGER, description="Desired channel_number"
                ),
                "channel_name": openapi.Schema(
                    type=openapi.TYPE_STRING, description="Desired channel name"
                )
            }
        ),
        responses={201: ChannelSerializer()}
    )
    @action(detail=False, methods=['post'], url_path='from-stream')
    def from_stream(self, request):
        stream_id = request.data.get('stream_id')
        if not stream_id:
            return Response({"error": "Missing stream_id"}, status=status.HTTP_400_BAD_REQUEST)
        stream = get_object_or_404(Stream, pk=stream_id)

        # Include the stream's tvg_id in the channel data
        channel_data = {
            'channel_number': request.data.get('channel_number', 0),
            'channel_name': request.data.get('channel_name', f"Channel from {stream.name}"),
            'tvg_id': stream.tvg_id,  # Inherit tvg-id from the stream
        }
        serializer = self.get_serializer(data=channel_data)
        serializer.is_valid(raise_exception=True)
        channel = serializer.save()

        # Optionally attach the stream to the channel
        channel.streams.add(stream)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

# ─────────────────────────────────────────────────────────
# 4) Bulk Delete Streams
# ─────────────────────────────────────────────────────────
class BulkDeleteStreamsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Bulk delete streams by ID",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=["stream_ids"],
            properties={
                "stream_ids": openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Items(type=openapi.TYPE_INTEGER),
                    description="Stream IDs to delete"
                )
            },
        ),
        responses={204: "Streams deleted"}
    )
    def delete(self, request, *args, **kwargs):
        stream_ids = request.data.get('stream_ids', [])
        Stream.objects.filter(id__in=stream_ids).delete()
        return Response({"message": "Streams deleted successfully!"}, status=status.HTTP_204_NO_CONTENT)

# ─────────────────────────────────────────────────────────
# 5) Bulk Delete Channels
# ─────────────────────────────────────────────────────────
class BulkDeleteChannelsViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Bulk delete channels by ID",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=["channel_ids"],
            properties={
                "channel_ids": openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Items(type=openapi.TYPE_INTEGER),
                    description="Channel IDs to delete"
                )
            },
        ),
        responses={204: "Channels deleted"}
    )
    def destroy(self, request):
        channel_ids = request.data.get('channel_ids', [])
        Channel.objects.filter(id__in=channel_ids).delete()
        return Response({"message": "Channels deleted"}, status=status.HTTP_204_NO_CONTENT)
