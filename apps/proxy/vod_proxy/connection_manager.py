"""
VOD Connection Manager - Redis-based connection tracking for VOD streams
"""

import time
import json
import logging
import threading
import random
import requests
from typing import Optional, Dict, Any
from django.http import StreamingHttpResponse, HttpResponse
from core.utils import RedisClient
from apps.vod.models import Movie, Episode
from apps.m3u.models import M3UAccountProfile

logger = logging.getLogger("vod_proxy")


class VODConnectionManager:
    """Manages VOD connections using Redis for tracking"""

    _instance = None

    @classmethod
    def get_instance(cls):
        """Get the singleton instance of VODConnectionManager"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.redis_client = RedisClient.get_client()
        self.connection_ttl = 3600  # 1 hour TTL for connections

    def _get_connection_key(self, content_type: str, content_uuid: str, client_id: str) -> str:
        """Get Redis key for a specific connection"""
        return f"vod_proxy:connection:{content_type}:{content_uuid}:{client_id}"

    def _get_profile_connections_key(self, profile_id: int) -> str:
        """Get Redis key for tracking connections per profile - STANDARDIZED with TS proxy"""
        return f"profile_connections:{profile_id}"

    def _get_content_connections_key(self, content_type: str, content_uuid: str) -> str:
        """Get Redis key for tracking connections per content"""
        return f"vod_proxy:content:{content_type}:{content_uuid}:connections"

    def create_connection(self, content_type: str, content_uuid: str, content_name: str,
                         client_id: str, client_ip: str, user_agent: str,
                         m3u_profile: M3UAccountProfile) -> bool:
        """
        Create a new VOD connection with profile limit checking

        Returns:
            bool: True if connection was created, False if profile limit exceeded
        """
        if not self.redis_client:
            logger.error("Redis client not available for VOD connection tracking")
            return False

        try:
            # Check profile connection limits using standardized key
            if not self._check_profile_limits(m3u_profile):
                logger.warning(f"Profile {m3u_profile.name} connection limit exceeded")
                return False

            connection_key = self._get_connection_key(content_type, content_uuid, client_id)
            profile_connections_key = self._get_profile_connections_key(m3u_profile.id)
            content_connections_key = self._get_content_connections_key(content_type, content_uuid)

            # Connection data
            connection_data = {
                "content_type": content_type,
                "content_uuid": content_uuid,
                "content_name": content_name,
                "client_id": client_id,
                "client_ip": client_ip,
                "user_agent": user_agent,
                "m3u_profile_id": m3u_profile.id,
                "m3u_profile_name": m3u_profile.name,
                "connected_at": str(time.time()),
                "last_activity": str(time.time()),
                "bytes_sent": "0",
                "position_seconds": "0"
            }

            # Use pipeline for atomic operations
            pipe = self.redis_client.pipeline()

            # Store connection data
            pipe.hset(connection_key, mapping=connection_data)
            pipe.expire(connection_key, self.connection_ttl)

            # Increment profile connections using standardized method
            pipe.incr(profile_connections_key)

            # Add to content connections set
            pipe.sadd(content_connections_key, client_id)
            pipe.expire(content_connections_key, self.connection_ttl)

            # Execute all operations
            pipe.execute()

            logger.info(f"Created VOD connection: {client_id} for {content_type} {content_name}")
            return True

        except Exception as e:
            logger.error(f"Error creating VOD connection: {e}")
            return False

    def _check_profile_limits(self, m3u_profile: M3UAccountProfile) -> bool:
        """Check if profile has available connection slots"""
        if m3u_profile.max_streams == 0:  # Unlimited
            return True

        try:
            profile_connections_key = self._get_profile_connections_key(m3u_profile.id)
            current_connections = int(self.redis_client.get(profile_connections_key) or 0)

            return current_connections < m3u_profile.max_streams

        except Exception as e:
            logger.error(f"Error checking profile limits: {e}")
            return False

    def update_connection_activity(self, content_type: str, content_uuid: str,
                                 client_id: str, bytes_sent: int = 0,
                                 position_seconds: int = 0) -> bool:
        """Update connection activity"""
        if not self.redis_client:
            return False

        try:
            connection_key = self._get_connection_key(content_type, content_uuid, client_id)

            update_data = {
                "last_activity": str(time.time())
            }

            if bytes_sent > 0:
                # Get current bytes and add to it
                current_bytes = self.redis_client.hget(connection_key, "bytes_sent")
                if current_bytes:
                    total_bytes = int(current_bytes.decode('utf-8')) + bytes_sent
                else:
                    total_bytes = bytes_sent
                update_data["bytes_sent"] = str(total_bytes)

            if position_seconds > 0:
                update_data["position_seconds"] = str(position_seconds)

            # Update connection data
            self.redis_client.hset(connection_key, mapping=update_data)
            self.redis_client.expire(connection_key, self.connection_ttl)

            return True

        except Exception as e:
            logger.error(f"Error updating connection activity: {e}")
            return False

    def remove_connection(self, content_type: str, content_uuid: str, client_id: str) -> bool:
        """Remove a VOD connection"""
        if not self.redis_client:
            return False

        try:
            connection_key = self._get_connection_key(content_type, content_uuid, client_id)

            # Get connection data before removing
            connection_data = self.redis_client.hgetall(connection_key)
            if not connection_data:
                return True  # Already removed

            # Get profile ID for cleanup
            profile_id = None
            if b"m3u_profile_id" in connection_data:
                try:
                    profile_id = int(connection_data[b"m3u_profile_id"].decode('utf-8'))
                except ValueError:
                    pass

            # Use pipeline for atomic cleanup
            pipe = self.redis_client.pipeline()

            # Remove connection data
            pipe.delete(connection_key)

            # Decrement profile connections using standardized key
            if profile_id:
                profile_connections_key = self._get_profile_connections_key(profile_id)
                current_count = int(self.redis_client.get(profile_connections_key) or 0)
                if current_count > 0:
                    pipe.decr(profile_connections_key)

            # Remove from content connections set
            content_connections_key = self._get_content_connections_key(content_type, content_uuid)
            pipe.srem(content_connections_key, client_id)

            # Execute cleanup
            pipe.execute()

            logger.info(f"Removed VOD connection: {client_id}")
            return True

        except Exception as e:
            logger.error(f"Error removing connection: {e}")
            return False

    def get_connection_info(self, content_type: str, content_uuid: str, client_id: str) -> Optional[Dict[str, Any]]:
        """Get connection information"""
        if not self.redis_client:
            return None

        try:
            connection_key = self._get_connection_key(content_type, content_uuid, client_id)
            connection_data = self.redis_client.hgetall(connection_key)

            if not connection_data:
                return None

            # Convert bytes to strings and parse numbers
            info = {}
            for key, value in connection_data.items():
                key_str = key.decode('utf-8')
                value_str = value.decode('utf-8')

                # Parse numeric fields
                if key_str in ['connected_at', 'last_activity']:
                    info[key_str] = float(value_str)
                elif key_str in ['bytes_sent', 'position_seconds', 'm3u_profile_id']:
                    info[key_str] = int(value_str)
                else:
                    info[key_str] = value_str

            return info

        except Exception as e:
            logger.error(f"Error getting connection info: {e}")
            return None

    def get_profile_connections(self, profile_id: int) -> int:
        """Get current connection count for a profile using standardized key"""
        if not self.redis_client:
            return 0

        try:
            profile_connections_key = self._get_profile_connections_key(profile_id)
            return int(self.redis_client.get(profile_connections_key) or 0)

        except Exception as e:
            logger.error(f"Error getting profile connections: {e}")
            return 0

    def get_content_connections(self, content_type: str, content_uuid: str) -> int:
        """Get current connection count for content"""
        if not self.redis_client:
            return 0

        try:
            content_connections_key = self._get_content_connections_key(content_type, content_uuid)
            return self.redis_client.scard(content_connections_key) or 0

        except Exception as e:
            logger.error(f"Error getting content connections: {e}")
            return 0

    def cleanup_stale_connections(self, max_age_seconds: int = 3600):
        """Clean up stale connections that haven't been active recently"""
        if not self.redis_client:
            return

        try:
            pattern = "vod_proxy:connection:*"
            cursor = 0
            cleaned = 0
            current_time = time.time()

            while True:
                cursor, keys = self.redis_client.scan(cursor, match=pattern, count=100)

                for key in keys:
                    try:
                        key_str = key.decode('utf-8')
                        last_activity = self.redis_client.hget(key, "last_activity")

                        if last_activity:
                            last_activity_time = float(last_activity.decode('utf-8'))
                            if current_time - last_activity_time > max_age_seconds:
                                # Extract info for cleanup
                                parts = key_str.split(':')
                                if len(parts) >= 5:
                                    content_type = parts[2]
                                    content_uuid = parts[3]
                                    client_id = parts[4]
                                    self.remove_connection(content_type, content_uuid, client_id)
                                    cleaned += 1
                    except Exception as e:
                        logger.error(f"Error processing key {key}: {e}")

                if cursor == 0:
                    break

            if cleaned > 0:
                logger.info(f"Cleaned up {cleaned} stale VOD connections")

        except Exception as e:
            logger.error(f"Error during connection cleanup: {e}")

    def stream_content(self, content_obj, stream_url, m3u_profile, client_ip, user_agent, request,
                      utc_start=None, utc_end=None, offset=None, range_header=None):
        """
        Stream VOD content with connection tracking and timeshift support

        Args:
            content_obj: Movie or Episode object
            stream_url: Final stream URL to proxy
            m3u_profile: M3UAccountProfile instance
            client_ip: Client IP address
            user_agent: Client user agent
            request: Django request object
            utc_start: UTC start time for timeshift (e.g., '2023-01-01T12:00:00')
            utc_end: UTC end time for timeshift
            offset: Offset in seconds for seeking
            range_header: HTTP Range header for partial content requests

        Returns:
            StreamingHttpResponse or HttpResponse with error
        """

        try:
            # Generate unique client ID
            client_id = f"vod_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

            # Determine content type and get content info
            if hasattr(content_obj, 'episodes'):  # Series
                content_type = 'series'
            elif hasattr(content_obj, 'series'):  # Episode
                content_type = 'episode'
            else:  # Movie
                content_type = 'movie'

            content_uuid = str(content_obj.uuid)
            content_name = getattr(content_obj, 'name', getattr(content_obj, 'title', 'Unknown'))

            # Create connection tracking
            connection_created = self.create_connection(
                content_type=content_type,
                content_uuid=content_uuid,
                content_name=content_name,
                client_id=client_id,
                client_ip=client_ip,
                user_agent=user_agent,
                m3u_profile=m3u_profile
            )

            if not connection_created:
                logger.error(f"Failed to create connection tracking for {content_type} {content_uuid}")
                return HttpResponse("Connection limit exceeded", status=503)

            # Modify stream URL for timeshift functionality
            modified_stream_url = self._apply_timeshift_parameters(
                stream_url, utc_start, utc_end, offset
            )

            logger.info(f"[{client_id}] Modified stream URL for timeshift: {modified_stream_url}")

            # Create streaming generator with simplified header handling
            upstream_response = None

            def stream_generator():
                nonlocal upstream_response
                try:
                    logger.info(f"[{client_id}] Starting VOD stream for {content_type} {content_name}")

                    # Prepare request headers
                    headers = {}
                    if user_agent:
                        headers['User-Agent'] = user_agent

                    # Forward important headers
                    important_headers = [
                        'authorization', 'x-forwarded-for', 'x-real-ip',
                        'referer', 'origin', 'accept'
                    ]

                    for header_name in important_headers:
                        django_header = f'HTTP_{header_name.upper().replace("-", "_")}'
                        if hasattr(request, 'META') and django_header in request.META:
                            headers[header_name] = request.META[django_header]
                            logger.debug(f"[{client_id}] Forwarded header {header_name}")

                    # Add client IP
                    if client_ip:
                        headers['X-Forwarded-For'] = client_ip
                        headers['X-Real-IP'] = client_ip

                    # Add Range header if provided for seeking support
                    if range_header:
                        headers['Range'] = range_header
                        logger.info(f"[{client_id}] Added Range header: {range_header}")

                    # Make request to upstream server with automatic redirect following
                    upstream_response = requests.get(modified_stream_url, headers=headers, stream=True, timeout=(10, 30), allow_redirects=True)
                    upstream_response.raise_for_status()

                    # Log upstream response info
                    logger.info(f"[{client_id}] Upstream response status: {upstream_response.status_code}")
                    logger.info(f"[{client_id}] Upstream content-type: {upstream_response.headers.get('content-type', 'unknown')}")
                    if 'content-length' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-length: {upstream_response.headers['content-length']}")
                    if 'content-range' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-range: {upstream_response.headers['content-range']}")

                    bytes_sent = 0
                    chunk_count = 0

                    for chunk in upstream_response.iter_content(chunk_size=8192):
                        if chunk:
                            yield chunk
                            bytes_sent += len(chunk)
                            chunk_count += 1

                            # Update connection activity every 100 chunks
                            if chunk_count % 100 == 0:
                                self.update_connection_activity(
                                    content_type=content_type,
                                    content_uuid=content_uuid,
                                    client_id=client_id,
                                    bytes_sent=len(chunk)
                                )

                    logger.info(f"[{client_id}] VOD stream completed: {bytes_sent} bytes sent")

                except requests.RequestException as e:
                    logger.error(f"[{client_id}] Error streaming from source: {e}")
                    yield b"Error: Unable to stream content"
                except Exception as e:
                    logger.error(f"[{client_id}] Error in stream generator: {e}")
                finally:
                    # Clean up connection tracking
                    self.remove_connection(content_type, content_uuid, client_id)
                    if upstream_response:
                        upstream_response.close()

            def stream_generator():
                nonlocal upstream_response
                try:
                    logger.info(f"[{client_id}] Starting VOD stream for {content_type} {content_name}")

                    # Prepare request headers
                    headers = {}
                    if user_agent:
                        headers['User-Agent'] = user_agent

                    # Forward important headers
                    important_headers = [
                        'authorization', 'x-forwarded-for', 'x-real-ip',
                        'referer', 'origin', 'accept'
                    ]

                    for header_name in important_headers:
                        django_header = f'HTTP_{header_name.upper().replace("-", "_")}'
                        if hasattr(request, 'META') and django_header in request.META:
                            headers[header_name] = request.META[django_header]
                            logger.debug(f"[{client_id}] Forwarded header {header_name}")

                    # Add client IP
                    if client_ip:
                        headers['X-Forwarded-For'] = client_ip
                        headers['X-Real-IP'] = client_ip

                    # Add Range header if provided for seeking support
                    if range_header:
                        headers['Range'] = range_header
                        logger.info(f"[{client_id}] Added Range header: {range_header}")

                    # Make single request to upstream server with automatic redirect following
                    upstream_response = requests.get(modified_stream_url, headers=headers, stream=True, timeout=(10, 30), allow_redirects=True)
                    upstream_response.raise_for_status()

                    # Log upstream response info
                    logger.info(f"[{client_id}] Upstream response status: {upstream_response.status_code}")
                    logger.info(f"[{client_id}] Final URL after redirects: {upstream_response.url}")
                    logger.info(f"[{client_id}] Upstream content-type: {upstream_response.headers.get('content-type', 'unknown')}")
                    if 'content-length' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-length: {upstream_response.headers['content-length']}")
                    if 'content-range' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-range: {upstream_response.headers['content-range']}")

                    bytes_sent = 0
                    chunk_count = 0

                    for chunk in upstream_response.iter_content(chunk_size=8192):
                        if chunk:
                            yield chunk
                            bytes_sent += len(chunk)
                            chunk_count += 1

                            # Update connection activity every 100 chunks
                            if chunk_count % 100 == 0:
                                self.update_connection_activity(
                                    content_type=content_type,
                                    content_uuid=content_uuid,
                                    client_id=client_id,
                                    bytes_sent=len(chunk)
                                )

                    logger.info(f"[{client_id}] VOD stream completed: {bytes_sent} bytes sent")

                except requests.RequestException as e:
                    logger.error(f"[{client_id}] Error streaming from source: {e}")
                    yield b"Error: Unable to stream content"
                except Exception as e:
                    logger.error(f"[{client_id}] Error in stream generator: {e}")
                finally:
                    # Clean up connection tracking
                    self.remove_connection(content_type, content_uuid, client_id)
                    if upstream_response:
                        upstream_response.close()

            # Create streaming response with sensible defaults
            response = StreamingHttpResponse(
                streaming_content=stream_generator(),
                content_type='video/mp4'
            )

            # Set status code based on request type
            if range_header:
                response.status_code = 206
                logger.info(f"[{client_id}] Set response status to 206 for range request")
            else:
                response.status_code = 200
                logger.info(f"[{client_id}] Set response status to 200 for full request")

            # Set headers that VLC and other players expect
            response['Cache-Control'] = 'no-cache'
            response['Pragma'] = 'no-cache'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Connection'] = 'keep-alive'
            response['Accept-Ranges'] = 'bytes'

            # Log the critical headers we're sending to the client
            logger.info(f"[{client_id}] Response headers to client - Status: {response.status_code}, Accept-Ranges: {response.get('Accept-Ranges', 'MISSING')}")
            if 'Content-Length' in response:
                logger.info(f"[{client_id}] Content-Length: {response['Content-Length']}")
            if 'Content-Range' in response:
                logger.info(f"[{client_id}] Content-Range: {response['Content-Range']}")
            if 'Content-Type' in response:
                logger.info(f"[{client_id}] Content-Type: {response['Content-Type']}")

            # Critical: Log what VLC needs to see for seeking to work
            if response.status_code == 200:
                logger.info(f"[{client_id}] VLC SEEKING INFO: Full content response (200). VLC should see Accept-Ranges and Content-Length to enable seeking.")
            elif response.status_code == 206:
                logger.info(f"[{client_id}] VLC SEEKING INFO: Partial content response (206). This confirms seeking is working if VLC requested a range.")

            return response

        except Exception as e:
            logger.error(f"Error in stream_content: {e}", exc_info=True)
            return HttpResponse(f"Streaming error: {str(e)}", status=500)

    def stream_content_with_session(self, session_id, content_obj, stream_url, m3u_profile, client_ip, user_agent, request,
                                  utc_start=None, utc_end=None, offset=None, range_header=None):
        """
        Stream VOD content with session-based connection reuse for timeshift operations

        This method reuses existing upstream connections when the same session makes
        timeshift requests, reducing provider connection usage to 1 per client session.
        """

        try:
            # Use session_id as client_id for connection tracking
            client_id = session_id

            # Determine content type and get content info
            if hasattr(content_obj, 'episodes'):  # Series
                content_type = 'series'
            elif hasattr(content_obj, 'series'):  # Episode
                content_type = 'episode'
            else:  # Movie
                content_type = 'movie'

            content_uuid = str(content_obj.uuid)
            content_name = getattr(content_obj, 'name', getattr(content_obj, 'title', 'Unknown'))

            # Check if we have an existing session connection
            session_key = f"vod_session:{session_id}"
            session_info = None

            if self.redis_client:
                try:
                    session_data = self.redis_client.get(session_key)
                    if session_data:
                        session_info = json.loads(session_data.decode('utf-8'))
                        logger.info(f"[{client_id}] Found existing session: {session_info}")
                except Exception as e:
                    logger.warning(f"[{client_id}] Error reading session data: {e}")

            # If no existing session or session expired, create new connection tracking
            # But only increment the profile counter ONCE per session
            if not session_info:
                connection_created = self.create_connection(
                    content_type=content_type,
                    content_uuid=content_uuid,
                    content_name=content_name,
                    client_id=client_id,
                    client_ip=client_ip,
                    user_agent=user_agent,
                    m3u_profile=m3u_profile
                )

                if not connection_created:
                    logger.error(f"Failed to create connection tracking for {content_type} {content_uuid}")
                    return HttpResponse("Connection limit exceeded", status=503)

                # Store session info in Redis
                session_info = {
                    'content_type': content_type,
                    'content_uuid': content_uuid,
                    'content_name': content_name,
                    'created_at': time.time(),
                    'profile_id': m3u_profile.id,
                    'connection_counted': True  # Mark that we've counted this connection
                }

                if self.redis_client:
                    try:
                        self.redis_client.setex(
                            session_key,
                            self.connection_ttl,
                            json.dumps(session_info)
                        )
                        logger.info(f"[{client_id}] Created new session: {session_info}")
                    except Exception as e:
                        logger.error(f"[{client_id}] Error storing session data: {e}")
            else:
                # Session exists - don't create new connection tracking
                # This prevents double-counting connections for the same session
                logger.info(f"[{client_id}] Reusing existing session - no new connection created")            # Apply timeshift parameters to URL
            modified_stream_url = self._apply_timeshift_parameters(
                stream_url, utc_start, utc_end, offset
            )

            logger.info(f"[{client_id}] Modified stream URL for timeshift: {modified_stream_url}")

            # Prepare headers - preserve ALL client headers for proper authentication
            def prepare_headers():
                headers = {}

                # Copy all relevant headers from the original request
                header_mapping = {
                    'HTTP_USER_AGENT': 'User-Agent',
                    'HTTP_AUTHORIZATION': 'Authorization',
                    'HTTP_X_FORWARDED_FOR': 'X-Forwarded-For',
                    'HTTP_X_REAL_IP': 'X-Real-IP',
                    'HTTP_REFERER': 'Referer',
                    'HTTP_ORIGIN': 'Origin',
                    'HTTP_ACCEPT': 'Accept',
                    'HTTP_ACCEPT_LANGUAGE': 'Accept-Language',
                    'HTTP_ACCEPT_ENCODING': 'Accept-Encoding',
                    'HTTP_CONNECTION': 'Connection',
                    'HTTP_CACHE_CONTROL': 'Cache-Control',
                    'HTTP_COOKIE': 'Cookie',
                    'HTTP_DNT': 'DNT',
                    'HTTP_X_FORWARDED_PROTO': 'X-Forwarded-Proto',
                    'HTTP_X_FORWARDED_PORT': 'X-Forwarded-Port',
                }

                # Log all headers for debugging
                logger.debug(f"[{client_id}] All available headers:")
                for django_header, http_header in header_mapping.items():
                    if hasattr(request, 'META') and django_header in request.META:
                        header_value = request.META[django_header]
                        headers[http_header] = header_value
                        logger.debug(f"[{client_id}] {http_header}: {header_value}")

                # Check for any timeshift-related headers VLC might send
                timeshift_headers = ['HTTP_TIME', 'HTTP_TIMESTAMP', 'HTTP_SEEK', 'HTTP_POSITION']
                for header in timeshift_headers:
                    if hasattr(request, 'META') and header in request.META:
                        value = request.META[header]
                        logger.info(f"[{client_id}] Found timeshift header {header}: {value}")
                        # Forward these as custom headers
                        headers[header.replace('HTTP_', '').replace('_', '-')] = value                # Ensure we have a User-Agent
                if 'User-Agent' not in headers and user_agent:
                    headers['User-Agent'] = user_agent

                # Add client IP headers
                if client_ip:
                    headers['X-Forwarded-For'] = client_ip
                    headers['X-Real-IP'] = client_ip

                # Add Range header for seeking support
                if range_header:
                    headers['Range'] = range_header
                    logger.info(f"[{client_id}] Added Range header: {range_header}")

                return headers

            # STEP 1: Make a small Range request to get headers from the final URL after redirects
            logger.info(f"[{client_id}] Making small Range request to get headers from final URL")
            try:
                probe_headers = prepare_headers()
                # Add a small range request to get headers without downloading much data
                probe_headers['Range'] = 'bytes=0-1024'
                
                probe_response = requests.get(
                    modified_stream_url,
                    headers=probe_headers,
                    timeout=(10, 30),
                    allow_redirects=True,
                    stream=True
                )
                probe_response.raise_for_status()
                
                # Extract critical headers from the final URL response
                upstream_content_length = None
                upstream_content_range = probe_response.headers.get('content-range')
                
                # Parse Content-Range to get total file size: "bytes 0-1024/1559626615"
                if upstream_content_range:
                    try:
                        parts = upstream_content_range.split('/')
                        if len(parts) == 2:
                            upstream_content_length = parts[1]
                            logger.info(f"[{client_id}] Extracted Content-Length from Content-Range: {upstream_content_length}")
                    except Exception as e:
                        logger.warning(f"[{client_id}] Could not parse Content-Range: {e}")
                
                # Fallback to Content-Length header if available
                if not upstream_content_length:
                    upstream_content_length = probe_response.headers.get('content-length')
                
                upstream_content_type = probe_response.headers.get('content-type', 'video/mp4')
                upstream_accept_ranges = probe_response.headers.get('accept-ranges', 'bytes')
                upstream_last_modified = probe_response.headers.get('last-modified')
                upstream_etag = probe_response.headers.get('etag')
                
                logger.info(f"[{client_id}] Final URL after redirects: {probe_response.url}")
                logger.info(f"[{client_id}] Headers from final URL - Content-Length: {upstream_content_length}, Content-Type: {upstream_content_type}")
                
                # Close the probe response
                probe_response.close()
                
            except Exception as e:
                logger.warning(f"[{client_id}] Probe request failed, proceeding without upstream headers: {e}")
                upstream_content_length = None
                upstream_content_type = 'video/mp4'
                upstream_accept_ranges = 'bytes'
                upstream_last_modified = None
                upstream_etag = None

            # STEP 2: Create streaming generator for actual content
            def stream_generator():
                upstream_response = None
                try:
                    logger.info(f"[{client_id}] Starting session-based VOD stream for {content_type} {content_name}")

                    headers = prepare_headers()

                    # Make request to upstream server
                    upstream_response = requests.get(
                        modified_stream_url,
                        headers=headers,
                        stream=True,
                        timeout=(10, 30),
                        allow_redirects=True
                    )
                    upstream_response.raise_for_status()

                    # Log upstream response info
                    logger.info(f"[{client_id}] Upstream response status: {upstream_response.status_code}")
                    logger.info(f"[{client_id}] Final URL after redirects: {upstream_response.url}")
                    if 'content-type' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-type: {upstream_response.headers['content-type']}")
                    if 'content-length' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-length: {upstream_response.headers['content-length']}")
                    if 'content-range' in upstream_response.headers:
                        logger.info(f"[{client_id}] Upstream content-range: {upstream_response.headers['content-range']}")

                    bytes_sent = 0
                    chunk_count = 0

                    for chunk in upstream_response.iter_content(chunk_size=8192):
                        if chunk:
                            yield chunk
                            bytes_sent += len(chunk)
                            chunk_count += 1

                            # Update connection activity every 100 chunks
                            if chunk_count % 100 == 0:
                                self.update_connection_activity(
                                    content_type=content_type,
                                    content_uuid=content_uuid,
                                    client_id=client_id,
                                    bytes_sent=len(chunk)
                                )

                    logger.info(f"[{client_id}] Session-based VOD stream completed: {bytes_sent} bytes sent")

                except requests.RequestException as e:
                    logger.error(f"[{client_id}] Error streaming from source: {e}")
                    yield b"Error: Unable to stream content"
                except Exception as e:
                    logger.error(f"[{client_id}] Error in session stream generator: {e}")
                finally:
                    # Don't remove connection tracking for sessions - let it expire naturally
                    # This allows timeshift operations to reuse the connection slot
                    if upstream_response:
                        upstream_response.close()

            # STEP 3: Create streaming response with headers from final URL
            response = StreamingHttpResponse(
                streaming_content=stream_generator(),
                content_type=upstream_content_type
            )

            # Set status code based on request type
            if range_header:
                response.status_code = 206
                logger.info(f"[{client_id}] Set response status to 206 for range request")
            else:
                response.status_code = 200
                logger.info(f"[{client_id}] Set response status to 200 for full request")

            # Set headers that VLC and other players expect
            response['Cache-Control'] = 'no-cache'
            response['Pragma'] = 'no-cache'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Connection'] = 'keep-alive'
            response['Accept-Ranges'] = upstream_accept_ranges

            # CRITICAL: Forward Content-Length from final URL to enable VLC seeking
            if upstream_content_length:
                response['Content-Length'] = upstream_content_length
                logger.info(f"[{client_id}] *** FORWARDED Content-Length from final URL: {upstream_content_length} *** (VLC seeking enabled)")
            else:
                logger.warning(f"[{client_id}] *** NO Content-Length from final URL *** (VLC seeking may not work)")

            # Forward other useful headers from final URL
            if upstream_last_modified:
                response['Last-Modified'] = upstream_last_modified
            if upstream_etag:
                response['ETag'] = upstream_etag

            # Handle range requests - set Content-Range if this is a partial request
            if range_header and upstream_content_length:
                # Parse range header to set proper Content-Range
                try:
                    if 'bytes=' in range_header:
                        range_part = range_header.replace('bytes=', '')
                        if '-' in range_part:
                            start_byte, end_byte = range_part.split('-', 1)
                            start = int(start_byte) if start_byte else 0
                            end = int(end_byte) if end_byte else int(upstream_content_length) - 1
                            total_size = int(upstream_content_length)

                            content_range = f"bytes {start}-{end}/{total_size}"
                            response['Content-Range'] = content_range
                            logger.info(f"[{client_id}] Set Content-Range: {content_range}")
                except Exception as e:
                    logger.warning(f"[{client_id}] Could not parse range for Content-Range header: {e}")

            # Log the critical headers we're sending to the client
            logger.info(f"[{client_id}] SESSION Response headers to client - Status: {response.status_code}, Accept-Ranges: {response.get('Accept-Ranges', 'MISSING')}")
            if 'Content-Length' in response:
                logger.info(f"[{client_id}] SESSION Content-Length: {response['Content-Length']}")
            if 'Content-Range' in response:
                logger.info(f"[{client_id}] SESSION Content-Range: {response['Content-Range']}")
            if 'Content-Type' in response:
                logger.info(f"[{client_id}] SESSION Content-Type: {response['Content-Type']}")

            # Critical: Log what VLC needs to see for seeking to work
            if response.status_code == 200:
                if upstream_content_length:
                    logger.info(f"[{client_id}] SESSION VLC SEEKING INFO: ✅ Full content response (200) with Content-Length from final URL. VLC seeking should work!")
                else:
                    logger.info(f"[{client_id}] SESSION VLC SEEKING INFO: ❌ Full content response (200) but NO Content-Length from final URL. VLC seeking will NOT work!")
            elif response.status_code == 206:
                logger.info(f"[{client_id}] SESSION VLC SEEKING INFO: ✅ Partial content response (206). This confirms seeking is working if VLC requested a range.")

            return response

        except Exception as e:
            logger.error(f"Error in stream_content_with_session: {e}", exc_info=True)
            return HttpResponse(f"Streaming error: {str(e)}", status=500)

    def _apply_timeshift_parameters(self, original_url, utc_start=None, utc_end=None, offset=None):
        """
        Apply timeshift parameters to the stream URL

        Args:
            original_url: Original stream URL
            utc_start: UTC start time (ISO format string)
            utc_end: UTC end time (ISO format string)
            offset: Offset in seconds

        Returns:
            Modified URL with timeshift parameters
        """
        try:
            from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
            import re

            parsed_url = urlparse(original_url)
            query_params = parse_qs(parsed_url.query)

            logger.debug(f"Original URL: {original_url}")
            logger.debug(f"Original query params: {query_params}")

            # Add timeshift parameters if provided
            if utc_start:
                # Support both utc_start and start parameter names
                query_params['utc_start'] = [utc_start]
                query_params['start'] = [utc_start]  # Some providers use 'start'
                logger.info(f"Added utc_start/start parameter: {utc_start}")

            if utc_end:
                # Support both utc_end and end parameter names
                query_params['utc_end'] = [utc_end]
                query_params['end'] = [utc_end]  # Some providers use 'end'
                logger.info(f"Added utc_end/end parameter: {utc_end}")

            if offset:
                try:
                    # Ensure offset is a valid number
                    offset_seconds = int(offset)
                    # Support multiple offset parameter names
                    query_params['offset'] = [str(offset_seconds)]
                    query_params['seek'] = [str(offset_seconds)]  # Some providers use 'seek'
                    query_params['t'] = [str(offset_seconds)]     # Some providers use 't'
                    logger.info(f"Added offset/seek/t parameter: {offset_seconds} seconds")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid offset value: {offset}, skipping")

            # Handle special URL patterns for VOD providers
            # Some providers embed timeshift info in the path rather than query params
            path = parsed_url.path

            # Check if this looks like an IPTV catchup URL pattern
            catchup_pattern = r'/(\d{4}-\d{2}-\d{2})/(\d{2}-\d{2}-\d{2})'
            if utc_start and re.search(catchup_pattern, path):
                # Convert ISO format to provider-specific format if needed
                try:
                    from datetime import datetime
                    start_dt = datetime.fromisoformat(utc_start.replace('Z', '+00:00'))
                    date_part = start_dt.strftime('%Y-%m-%d')
                    time_part = start_dt.strftime('%H-%M-%S')

                    # Replace existing date/time in path
                    path = re.sub(catchup_pattern, f'/{date_part}/{time_part}', path)
                    logger.info(f"Modified path for catchup: {path}")
                except Exception as e:
                    logger.warning(f"Could not parse timeshift date: {e}")

            # Reconstruct URL with new parameters
            new_query = urlencode(query_params, doseq=True)
            modified_url = urlunparse((
                parsed_url.scheme,
                parsed_url.netloc,
                path,  # Use potentially modified path
                parsed_url.params,
                new_query,
                parsed_url.fragment
            ))

            logger.info(f"Modified URL: {modified_url}")
            return modified_url

        except Exception as e:
            logger.error(f"Error applying timeshift parameters: {e}")
            return original_url# Global instance
_connection_manager = None

def get_connection_manager() -> VODConnectionManager:
    """Get the global VOD connection manager instance"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = VODConnectionManager()
    return _connection_manager
