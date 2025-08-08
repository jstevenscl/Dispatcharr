"""
VOD (Video on Demand) proxy views for handling movie and series streaming.
Supports M3U profiles for authentication and URL transformation.
"""

import time
import random
import logging
import requests
from django.http import StreamingHttpResponse, JsonResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
from apps.vod.models import Movie, Series, Episode
from apps.m3u.models import M3UAccount, M3UAccountProfile
from apps.proxy.vod_proxy.connection_manager import VODConnectionManager
from .utils import get_client_info, create_vod_response

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class VODStreamView(View):
    """Handle VOD streaming requests with M3U profile support"""

    def get(self, request, content_type, content_id, profile_id=None):
        """
        Stream VOD content (movies or series episodes)

        Args:
            content_type: 'movie', 'series', or 'episode'
            content_id: ID of the content
            profile_id: Optional M3U profile ID for authentication
        """
        logger.info(f"[VOD-REQUEST] Starting VOD stream request: {content_type}/{content_id}, profile: {profile_id}")
        logger.info(f"[VOD-REQUEST] Full request path: {request.get_full_path()}")
        logger.info(f"[VOD-REQUEST] Request method: {request.method}")

        try:
            client_ip, user_agent = get_client_info(request)
            logger.info(f"[VOD-CLIENT] Client info - IP: {client_ip}, User-Agent: {user_agent[:100]}...")

            # Get the content object and its relation
            content_obj, relation = self._get_content_and_relation(content_type, content_id)
            if not content_obj or not relation:
                logger.error(f"[VOD-ERROR] Content or relation not found: {content_type} {content_id}")
                raise Http404(f"Content not found: {content_type} {content_id}")

            logger.info(f"[VOD-CONTENT] Found content: {getattr(content_obj, 'name', 'Unknown')}")

            # Get M3U account from relation
            m3u_account = relation.m3u_account
            logger.info(f"[VOD-ACCOUNT] Using M3U account: {m3u_account.name}")

            # Get stream URL from relation
            stream_url = self._get_stream_url_from_relation(relation)
            logger.info(f"[VOD-CONTENT] Content URL: {stream_url or 'No URL found'}")

            if not stream_url:
                logger.error(f"[VOD-ERROR] No stream URL available for {content_type} {content_id}")
                return HttpResponse("No stream URL available", status=503)

            # Get M3U profile
            m3u_profile = self._get_m3u_profile(m3u_account, profile_id, user_agent)

            if not m3u_profile:
                logger.error(f"[VOD-ERROR] No suitable M3U profile found for {content_type} {content_id}")
                return HttpResponse("No available stream", status=503)

            logger.info(f"[VOD-PROFILE] Using M3U profile: {m3u_profile.id} (max_streams: {m3u_profile.max_streams}, current: {m3u_profile.current_viewers})")

            # Track connection start in Redis
            try:
                from core.utils import RedisClient
                redis_client = RedisClient.get_client()
                profile_connections_key = f"profile_connections:{m3u_profile.id}"
                current_count = redis_client.incr(profile_connections_key)
                logger.debug(f"Incremented VOD profile {m3u_profile.id} connections to {current_count}")
            except Exception as e:
                logger.error(f"Error tracking connection in Redis: {e}")

            # Transform URL based on profile
            final_stream_url = self._transform_url(stream_url, m3u_profile)
            logger.info(f"[VOD-URL] Final stream URL: {final_stream_url}")

            # Validate stream URL
            if not final_stream_url or not final_stream_url.startswith(('http://', 'https://')):
                logger.error(f"[VOD-ERROR] Invalid stream URL: {final_stream_url}")
                return HttpResponse("Invalid stream URL", status=500)

            # Get connection manager
            connection_manager = VODConnectionManager.get_instance()

            # Stream the content
            logger.info("[VOD-STREAM] Calling connection manager to stream content")
            response = connection_manager.stream_content(
                content_obj=content_obj,
                stream_url=final_stream_url,
                m3u_profile=m3u_profile,
                client_ip=client_ip,
                user_agent=user_agent,
                request=request
            )

            logger.info(f"[VOD-SUCCESS] Stream response created successfully, type: {type(response)}")
            return response

        except Exception as e:
            logger.error(f"[VOD-EXCEPTION] Error streaming {content_type} {content_id}: {e}", exc_info=True)
            return HttpResponse(f"Streaming error: {str(e)}", status=500)

    def _get_content_and_relation(self, content_type, content_id):
        """Get the content object and its M3U relation"""
        try:
            logger.info(f"[CONTENT-LOOKUP] Looking up {content_type} with UUID {content_id}")

            if content_type == 'movie':
                content_obj = get_object_or_404(Movie, uuid=content_id)
                logger.info(f"[CONTENT-FOUND] Movie: {content_obj.name} (ID: {content_obj.id})")

                # Get the first active relation
                relation = content_obj.m3u_relations.filter(m3u_account__is_active=True).first()
                return content_obj, relation

            elif content_type == 'episode':
                content_obj = get_object_or_404(Episode, uuid=content_id)
                logger.info(f"[CONTENT-FOUND] Episode: {content_obj.name} (ID: {content_obj.id}, Series: {content_obj.series.name})")

                # Get the first active relation
                relation = content_obj.m3u_relations.filter(m3u_account__is_active=True).first()
                return content_obj, relation

            elif content_type == 'series':
                # For series, get the first episode
                series = get_object_or_404(Series, uuid=content_id)
                logger.info(f"[CONTENT-FOUND] Series: {series.name} (ID: {series.id})")
                episode = series.episodes.first()
                if not episode:
                    logger.error(f"[CONTENT-ERROR] No episodes found for series {series.name}")
                    return None, None

                logger.info(f"[CONTENT-FOUND] First episode: {episode.name} (ID: {episode.id})")
                relation = episode.m3u_relations.filter(m3u_account__is_active=True).first()
                return episode, relation
            else:
                logger.error(f"[CONTENT-ERROR] Invalid content type: {content_type}")
                return None, None

        except Exception as e:
            logger.error(f"Error getting content object: {e}")
            return None, None

    def _get_stream_url_from_relation(self, relation):
        """Get stream URL from the M3U relation"""
        try:
            if hasattr(relation, 'url') and relation.url:
                return relation.url
            elif hasattr(relation, 'get_stream_url'):
                return relation.get_stream_url()
            else:
                logger.error("Relation has no URL or get_stream_url method")
                return None
        except Exception as e:
            logger.error(f"Error getting stream URL from relation: {e}")
            return None

    def _get_m3u_profile(self, m3u_account, profile_id, user_agent):
        """Get appropriate M3U profile for streaming"""
        try:
            # If specific profile requested, try to use it
            if profile_id:
                try:
                    profile = M3UAccountProfile.objects.get(
                        id=profile_id,
                        m3u_account=m3u_account,
                        is_active=True
                    )
                    if profile.current_viewers < profile.max_streams or profile.max_streams == 0:
                        return profile
                except M3UAccountProfile.DoesNotExist:
                    pass

            # Find available profile based on user agent matching
            profiles = M3UAccountProfile.objects.filter(
                m3u_account=m3u_account,
                is_active=True
            ).order_by('current_viewers')

            for profile in profiles:
                # Check if profile matches user agent pattern
                if self._matches_user_agent_pattern(profile, user_agent):
                    if profile.current_viewers < profile.max_streams or profile.max_streams == 0:
                        return profile

            # Fallback to default profile
            return profiles.filter(is_default=True).first()

        except Exception as e:
            logger.error(f"Error getting M3U profile: {e}")
            return None

    def _matches_user_agent_pattern(self, profile, user_agent):
        """Check if user agent matches profile pattern"""
        try:
            import re
            pattern = profile.search_pattern
            if pattern and user_agent:
                return bool(re.search(pattern, user_agent, re.IGNORECASE))
            return True  # If no pattern, match all
        except Exception:
            return True

    def _transform_url(self, original_url, m3u_profile):
        """Transform URL based on M3U profile settings"""
        try:
            import re

            if not original_url:
                return None

            search_pattern = m3u_profile.search_pattern
            replace_pattern = m3u_profile.replace_pattern
            safe_replace_pattern = re.sub(r'\$(\d+)', r'\\\1', replace_pattern)

            if search_pattern and replace_pattern:
                transformed_url = re.sub(search_pattern, safe_replace_pattern, original_url)
                logger.debug(f"URL transformed from {original_url} to {transformed_url}")
                return transformed_url

            return original_url

        except Exception as e:
            logger.error(f"Error transforming URL: {e}")
            return original_url

@method_decorator(csrf_exempt, name='dispatch')
class VODPlaylistView(View):
    """Generate M3U playlists for VOD content"""

    def get(self, request, profile_id=None):
        """Generate VOD playlist"""
        try:
            # Get profile if specified
            m3u_profile = None
            if profile_id:
                try:
                    m3u_profile = M3UAccountProfile.objects.get(
                        id=profile_id,
                        is_active=True
                    )
                except M3UAccountProfile.DoesNotExist:
                    return HttpResponse("Profile not found", status=404)

            # Generate playlist content
            playlist_content = self._generate_playlist(m3u_profile)

            response = HttpResponse(playlist_content, content_type='application/vnd.apple.mpegurl')
            response['Content-Disposition'] = 'attachment; filename="vod_playlist.m3u8"'
            return response

        except Exception as e:
            logger.error(f"Error generating VOD playlist: {e}")
            return HttpResponse("Playlist generation error", status=500)

    def _generate_playlist(self, m3u_profile=None):
        """Generate M3U playlist content for VOD"""
        lines = ["#EXTM3U"]

        # Add movies
        movies = Movie.objects.filter(is_active=True)
        if m3u_profile:
            movies = movies.filter(m3u_account=m3u_profile.m3u_account)

        for movie in movies:
            profile_param = f"?profile={m3u_profile.id}" if m3u_profile else ""
            lines.append(f'#EXTINF:-1 tvg-id="{movie.tmdb_id}" group-title="Movies",{movie.title}')
            lines.append(f'/proxy/vod/movie/{movie.uuid}/{profile_param}')

        # Add series
        series_list = Series.objects.filter(is_active=True)
        if m3u_profile:
            series_list = series_list.filter(m3u_account=m3u_profile.m3u_account)

        for series in series_list:
            for episode in series.episodes.all():
                profile_param = f"?profile={m3u_profile.id}" if m3u_profile else ""
                episode_title = f"{series.title} - S{episode.season_number:02d}E{episode.episode_number:02d}"
                lines.append(f'#EXTINF:-1 tvg-id="{series.tmdb_id}" group-title="Series",{episode_title}')
                lines.append(f'/proxy/vod/episode/{episode.uuid}/{profile_param}')

        return '\n'.join(lines)


@method_decorator(csrf_exempt, name='dispatch')
class VODPositionView(View):
    """Handle VOD position updates"""

    def post(self, request, content_id):
        """Update playback position for VOD content"""
        try:
            import json
            data = json.loads(request.body)
            client_id = data.get('client_id')
            position = data.get('position', 0)

            # Find the content object
            content_obj = None
            try:
                content_obj = Movie.objects.get(uuid=content_id)
            except Movie.DoesNotExist:
                try:
                    content_obj = Episode.objects.get(uuid=content_id)
                except Episode.DoesNotExist:
                    return JsonResponse({'error': 'Content not found'}, status=404)

            # Here you could store the position in a model or cache
            # For now, just return success
            logger.info(f"Position update for {content_obj.__class__.__name__} {content_id}: {position}s")

            return JsonResponse({
                'success': True,
                'content_id': str(content_id),
                'position': position
            })

        except Exception as e:
            logger.error(f"Error updating VOD position: {e}")
            return JsonResponse({'error': str(e)}, status=500)
