import time
import random
import logging
import requests
from django.http import StreamingHttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.contrib.contenttypes.models import ContentType
from rest_framework.decorators import api_view

from apps.vod.models import Movie, Episode, VODConnection
from apps.m3u.models import M3UAccountProfile
from dispatcharr.utils import network_access_allowed, get_client_ip
from core.models import UserAgent, CoreSettings

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(["GET"])
def stream_movie(request, movie_uuid):
    """Stream movie content with connection tracking and range support"""
    return _stream_content(request, Movie, movie_uuid, "movie")


@csrf_exempt
@api_view(["GET"])
def stream_episode(request, episode_uuid):
    """Stream episode content with connection tracking and range support"""
    return _stream_content(request, Episode, episode_uuid, "episode")


def _stream_content(request, model_class, content_uuid, content_type_name):
    """Generic function to stream VOD content"""

    if not network_access_allowed(request, "STREAMS"):
        return JsonResponse({"error": "Forbidden"}, status=403)

    # Get content object
    content = get_object_or_404(model_class, uuid=content_uuid)

    # Generate client ID and get client info
    client_id = f"vod_client_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    client_ip = get_client_ip(request)
    client_user_agent = request.META.get('HTTP_USER_AGENT', '')

    logger.info(f"[{client_id}] VOD stream request for: {content.name}")

    try:
        # Get available M3U profile for connection management
        m3u_account = content.m3u_account
        available_profile = None

        for profile in m3u_account.profiles.filter(is_active=True):
            current_connections = VODConnection.objects.filter(m3u_profile=profile).count()
            if profile.max_streams == 0 or current_connections < profile.max_streams:
                available_profile = profile
                break

        if not available_profile:
            return JsonResponse(
                {"error": "No available connections for this VOD"},
                status=503
            )

        # Create connection tracking record using generic foreign key
        content_type = ContentType.objects.get_for_model(content)
        connection = VODConnection.objects.create(
            content_type=content_type,
            object_id=content.id,
            m3u_profile=available_profile,
            client_id=client_id,
            client_ip=client_ip,
            user_agent=client_user_agent
        )

        # Get user agent for upstream request
        try:
            user_agent_obj = m3u_account.get_user_agent()
            upstream_user_agent = user_agent_obj.user_agent
        except:
            default_ua_id = CoreSettings.get_default_user_agent_id()
            user_agent_obj = UserAgent.objects.get(id=default_ua_id)
            upstream_user_agent = user_agent_obj.user_agent

        # Handle range requests for seeking
        range_header = request.META.get('HTTP_RANGE')
        headers = {
            'User-Agent': upstream_user_agent,
            'Connection': 'keep-alive'
        }

        if range_header:
            headers['Range'] = range_header
            logger.debug(f"[{client_id}] Range request: {range_header}")

        # Stream the VOD content
        try:
            response = requests.get(
                content.url,
                headers=headers,
                stream=True,
                timeout=(10, 60)
            )

            if response.status_code not in [200, 206]:
                logger.error(f"[{client_id}] Upstream error: {response.status_code}")
                connection.delete()
                return JsonResponse(
                    {"error": f"Upstream server error: {response.status_code}"},
                    status=response.status_code
                )

            # Determine content type
            content_type_header = response.headers.get('Content-Type', 'video/mp4')
            content_length = response.headers.get('Content-Length')
            content_range = response.headers.get('Content-Range')

            # Create streaming response
            def stream_generator():
                bytes_sent = 0
                try:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            bytes_sent += len(chunk)
                            yield chunk

                            # Update connection activity periodically
                            if bytes_sent % (8192 * 10) == 0:  # Every ~80KB
                                try:
                                    connection.update_activity(bytes_sent=len(chunk))
                                except VODConnection.DoesNotExist:
                                    # Connection was cleaned up, stop streaming
                                    break

                except Exception as e:
                    logger.error(f"[{client_id}] Streaming error: {e}")
                finally:
                    # Clean up connection when streaming ends
                    try:
                        connection.delete()
                        logger.info(f"[{client_id}] Connection cleaned up")
                    except VODConnection.DoesNotExist:
                        pass

            # Build response with appropriate headers
            streaming_response = StreamingHttpResponse(
                stream_generator(),
                content_type=content_type_header,
                status=response.status_code
            )

            # Copy important headers
            if content_length:
                streaming_response['Content-Length'] = content_length
            if content_range:
                streaming_response['Content-Range'] = content_range

            # Add CORS and caching headers
            streaming_response['Accept-Ranges'] = 'bytes'
            streaming_response['Access-Control-Allow-Origin'] = '*'
            streaming_response['Cache-Control'] = 'no-cache'

            logger.info(f"[{client_id}] Started streaming {content_type_name}: {content.name}")
            return streaming_response

        except requests.RequestException as e:
            logger.error(f"[{client_id}] Request error: {e}")
            connection.delete()
            return JsonResponse(
                {"error": "Failed to connect to upstream server"},
                status=502
            )

    except Exception as e:
        logger.error(f"[{client_id}] Unexpected error: {e}")
        return JsonResponse(
            {"error": "Internal server error"},
            status=500
        )


@csrf_exempt
@api_view(["POST"])
def update_movie_position(request, movie_uuid):
    """Update playback position for a movie"""
    return _update_position(request, Movie, movie_uuid)


@csrf_exempt
@api_view(["POST"])
def update_episode_position(request, episode_uuid):
    """Update playback position for an episode"""
    return _update_position(request, Episode, episode_uuid)


def _update_position(request, model_class, content_uuid):
    """Generic function to update playback position"""

    if not network_access_allowed(request, "STREAMS"):
        return JsonResponse({"error": "Forbidden"}, status=403)

    client_id = request.data.get('client_id')
    position = request.data.get('position', 0)

    if not client_id:
        return JsonResponse({"error": "Client ID required"}, status=400)

    try:
        content = get_object_or_404(model_class, uuid=content_uuid)
        content_type = ContentType.objects.get_for_model(content)
        connection = VODConnection.objects.get(
            content_type=content_type,
            object_id=content.id,
            client_id=client_id
        )
        connection.update_activity(position=position)

        return JsonResponse({"status": "success"})

    except VODConnection.DoesNotExist:
        return JsonResponse({"error": "Connection not found"}, status=404)
    except Exception as e:
        logger.error(f"Position update error: {e}")
        return JsonResponse({"error": "Internal server error"}, status=500)
