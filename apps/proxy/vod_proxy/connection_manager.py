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


class PersistentVODConnection:
    """Handles a single persistent connection to a VOD provider for a session"""

    def __init__(self, session_id: str, stream_url: str, headers: dict):
        self.session_id = session_id
        self.stream_url = stream_url
        self.base_headers = headers
        self.session = None
        self.current_response = None
        self.content_length = None
        self.content_type = 'video/mp4'
        self.final_url = None
        self.lock = threading.Lock()
        self.request_count = 0  # Track number of requests on this connection
        self.last_activity = time.time()  # Track last activity for cleanup
        self.cleanup_timer = None  # Timer for delayed cleanup

    def _establish_connection(self, range_header=None):
        """Establish or re-establish connection to provider"""
        try:
            if not self.session:
                self.session = requests.Session()

            headers = self.base_headers.copy()

            # Validate range header against content length
            if range_header and self.content_length:
                logger.info(f"[{self.session_id}] Validating range {range_header} against content length {self.content_length}")
                validated_range = self._validate_range_header(range_header, int(self.content_length))
                if validated_range is None:
                    # Range is not satisfiable, but don't raise error - return empty response
                    logger.warning(f"[{self.session_id}] Range not satisfiable: {range_header} for content length {self.content_length}")
                    return None
                elif validated_range != range_header:
                    range_header = validated_range
                    logger.info(f"[{self.session_id}] Adjusted range header: {range_header}")
                else:
                    logger.info(f"[{self.session_id}] Range header validated successfully: {range_header}")
            elif range_header:
                logger.info(f"[{self.session_id}] Range header provided but no content length available yet: {range_header}")

            if range_header:
                headers['Range'] = range_header
                logger.info(f"[{self.session_id}] Setting Range header: {range_header}")

            # Track request count for better logging
            self.request_count += 1
            if self.request_count == 1:
                logger.info(f"[{self.session_id}] Making initial request to provider")
                target_url = self.stream_url
                allow_redirects = True
            else:
                logger.info(f"[{self.session_id}] Making range request #{self.request_count} on SAME session (using final URL)")
                # Use the final URL from first request to avoid redirect chain
                target_url = self.final_url if self.final_url else self.stream_url
                allow_redirects = False  # No need to follow redirects again
                logger.info(f"[{self.session_id}] Using cached final URL: {target_url}")

            response = self.session.get(
                target_url,
                headers=headers,
                stream=True,
                timeout=(10, 30),
                allow_redirects=allow_redirects
            )
            response.raise_for_status()

            # Log successful response
            if self.request_count == 1:
                logger.info(f"[{self.session_id}] Request #{self.request_count} successful: {response.status_code} (followed redirects)")
            else:
                logger.info(f"[{self.session_id}] Request #{self.request_count} successful: {response.status_code} (direct to final URL)")

            # Capture headers from final URL
            if not self.content_length:
                self.content_length = response.headers.get('content-length')
                self.content_type = response.headers.get('content-type', 'video/mp4')
                self.final_url = response.url
                logger.info(f"[{self.session_id}] *** PERSISTENT CONNECTION - Final URL: {self.final_url} ***")
                logger.info(f"[{self.session_id}] *** PERSISTENT CONNECTION - Content-Length: {self.content_length} ***")

            self.current_response = response
            return response

        except Exception as e:
            logger.error(f"[{self.session_id}] Error establishing connection: {e}")
            self.cleanup()
            raise

    def _validate_range_header(self, range_header, content_length):
        """Validate and potentially adjust range header against content length"""
        try:
            if not range_header or not range_header.startswith('bytes='):
                return range_header

            range_part = range_header.replace('bytes=', '')
            if '-' not in range_part:
                return range_header

            start_str, end_str = range_part.split('-', 1)

            # Parse start byte
            if start_str:
                start_byte = int(start_str)
                if start_byte >= content_length:
                    # Start is beyond file end - not satisfiable
                    logger.warning(f"[{self.session_id}] Range start {start_byte} >= content length {content_length} - not satisfiable")
                    return None
            else:
                start_byte = 0

            # Parse end byte
            if end_str:
                end_byte = int(end_str)
                if end_byte >= content_length:
                    # Adjust end to file end
                    end_byte = content_length - 1
                    logger.info(f"[{self.session_id}] Adjusted range end to {end_byte}")
            else:
                end_byte = content_length - 1

            # Ensure start <= end
            if start_byte > end_byte:
                logger.warning(f"[{self.session_id}] Range start {start_byte} > end {end_byte} - not satisfiable")
                return None

            validated_range = f"bytes={start_byte}-{end_byte}"
            return validated_range

        except (ValueError, IndexError) as e:
            logger.warning(f"[{self.session_id}] Could not validate range header {range_header}: {e}")
            return range_header

    def get_stream(self, range_header=None):
        """Get stream with optional range header - reuses connection for range requests"""
        with self.lock:
            # Update activity timestamp
            self.last_activity = time.time()

            # Cancel any pending cleanup since connection is being reused
            self.cancel_cleanup()

            # For range requests, we don't need to close the connection
            # We can make a new request on the same session
            if range_header:
                logger.info(f"[{self.session_id}] Range request on existing connection: {range_header}")
                # Close only the response stream, keep the session alive
                if self.current_response:
                    logger.info(f"[{self.session_id}] Closing previous response stream (keeping connection alive)")
                    self.current_response.close()
                    self.current_response = None

            # Make new request (reuses connection if session exists)
            response = self._establish_connection(range_header)
            if response is None:
                # Range not satisfiable - return None to indicate this
                return None

            return self.current_response

    def schedule_delayed_cleanup(self, delay_seconds=5):
        """Schedule cleanup after a delay to allow for rapid successive requests"""
        # Cancel any existing cleanup timer
        if self.cleanup_timer:
            self.cleanup_timer.cancel()
            logger.debug(f"[{self.session_id}] Cancelled previous cleanup timer")

        # Schedule new cleanup
        def delayed_cleanup():
            logger.info(f"[{self.session_id}] Delayed cleanup triggered - checking if connection is still needed")
            # Use the VODConnectionManager instance to avoid circular imports
            manager = VODConnectionManager()
            manager.cleanup_persistent_connection(self.session_id)

        self.cleanup_timer = threading.Timer(delay_seconds, delayed_cleanup)
        self.cleanup_timer.start()
        logger.info(f"[{self.session_id}] Scheduled cleanup in {delay_seconds} seconds (allows for rapid seeks)")

    def cancel_cleanup(self):
        """Cancel any pending cleanup - called when connection is reused"""
        if self.cleanup_timer:
            self.cleanup_timer.cancel()
            self.cleanup_timer = None
            logger.info(f"[{self.session_id}] Cancelled pending cleanup - connection being reused for new request")

    def get_headers(self):
        """Get headers for response"""
        return {
            'content_length': self.content_length,
            'content_type': self.content_type,
            'final_url': self.final_url
        }

    def cleanup(self):
        """Clean up connection resources"""
        with self.lock:
            # Cancel any pending cleanup timer
            if self.cleanup_timer:
                self.cleanup_timer.cancel()
                self.cleanup_timer = None
                logger.debug(f"[{self.session_id}] Cancelled cleanup timer during manual cleanup")

            if self.current_response:
                self.current_response.close()
                self.current_response = None
            if self.session:
                self.session.close()
                self.session = None
        logger.info(f"[{self.session_id}] Persistent connection cleaned up")


class VODConnectionManager:
    """Manages VOD connections using Redis for tracking"""

    _instance = None
    _persistent_connections = {}  # session_id -> PersistentVODConnection

    @classmethod
    def get_instance(cls):
        """Get the singleton instance of VODConnectionManager"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.redis_client = RedisClient.get_client()
        self.connection_ttl = 3600  # 1 hour TTL for connections
        self.session_ttl = 1800  # 30 minutes TTL for sessions

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
        Stream VOD content with persistent connection per session

        Maintains 1 open connection to provider per session that handles all range requests
        dynamically based on client Range headers for seeking functionality.
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

            # Check for existing connection or create new one
            persistent_conn = self._persistent_connections.get(session_id)

            if not persistent_conn:
                logger.info(f"[{client_id}] Creating NEW persistent connection for {content_type} {content_name}")

                # Create session in Redis for tracking
                session_info = {
                    "content_type": content_type,
                    "content_uuid": content_uuid,
                    "content_name": content_name,
                    "created_at": str(time.time()),
                    "profile_id": str(m3u_profile.id),
                    "connection_counted": "True"
                }

                session_key = f"vod_session:{session_id}"
                if self.redis_client:
                    self.redis_client.hset(session_key, mapping=session_info)
                    self.redis_client.expire(session_key, self.session_ttl)

                logger.info(f"[{client_id}] Created new session: {session_info}")

                # Apply timeshift parameters to URL
                modified_stream_url = self._apply_timeshift_parameters(stream_url, utc_start, utc_end, offset)
                logger.info(f"[{client_id}] Modified stream URL for timeshift: {modified_stream_url}")

                # Prepare headers
                headers = {
                    'User-Agent': user_agent or 'VLC/3.0.21 LibVLC/3.0.21',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
                }

                # Add any authentication headers from profile
                if hasattr(m3u_profile, 'auth_headers') and m3u_profile.auth_headers:
                    headers.update(m3u_profile.auth_headers)

                # Create persistent connection
                persistent_conn = PersistentVODConnection(session_id, modified_stream_url, headers)
                self._persistent_connections[session_id] = persistent_conn

                # Track connection in profile
                self.create_connection(content_type, content_uuid, content_name, client_id, client_ip, user_agent, m3u_profile)
            else:
                logger.info(f"[{client_id}] Using EXISTING persistent connection for {content_type} {content_name}")

                # Update session activity
                session_key = f"vod_session:{session_id}"
                if self.redis_client:
                    self.redis_client.hset(session_key, "last_activity", str(time.time()))
                    self.redis_client.expire(session_key, self.session_ttl)

                logger.info(f"[{client_id}] Reusing existing session - no new connection created")

            # Log the incoming Range header for debugging
            if range_header:
                logger.info(f"[{client_id}] *** CLIENT RANGE REQUEST: {range_header} ***")

                # Parse range for logging
                try:
                    if 'bytes=' in range_header:
                        range_part = range_header.replace('bytes=', '')
                        if '-' in range_part:
                            start_byte, end_byte = range_part.split('-', 1)
                            if start_byte and int(start_byte) > 0:
                                start_pos_mb = int(start_byte) / (1024 * 1024)
                                logger.info(f"[{client_id}] *** VLC SEEKING TO: {start_pos_mb:.1f} MB ***")
                            else:
                                logger.info(f"[{client_id}] Range request from start")
                except Exception as e:
                    logger.warning(f"[{client_id}] Could not parse range header: {e}")
            else:
                logger.info(f"[{client_id}] Full content request (no Range header)")

            # Get stream from persistent connection with current range
            upstream_response = persistent_conn.get_stream(range_header)

            # Handle range not satisfiable
            if upstream_response is None:
                logger.warning(f"[{client_id}] Range not satisfiable - returning 416 error")
                return HttpResponse(
                    "Requested Range Not Satisfiable",
                    status=416,
                    headers={
                        'Content-Range': f'bytes */{persistent_conn.content_length}' if persistent_conn.content_length else 'bytes */*'
                    }
                )

            connection_headers = persistent_conn.get_headers()

            # Create streaming generator
            def stream_generator():
                try:
                    logger.info(f"[{client_id}] Starting stream from persistent connection")

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

                    logger.info(f"[{client_id}] Persistent stream completed normally: {bytes_sent} bytes sent")
                    # Stream completed normally - don't cleanup connection as it may be reused

                except GeneratorExit:
                    # Client disconnected (most common case) - use delayed cleanup for seeks
                    logger.info(f"[{client_id}] Client disconnected - scheduling delayed cleanup (allowing for seeks)")
                    persistent_conn.schedule_delayed_cleanup(delay_seconds=5)

                except Exception as e:
                    logger.error(f"[{client_id}] Error in persistent stream: {e}")
                    # On error, also cleanup the connection as it may be corrupted
                    logger.info(f"[{client_id}] Cleaning up persistent connection due to error")
                    self.cleanup_persistent_connection(session_id)
                    yield b"Error: Stream interrupted"

                finally:
                    # This runs regardless of how the generator exits
                    logger.debug(f"[{client_id}] Stream generator finished")

            # Create streaming response
            response = StreamingHttpResponse(
                streaming_content=stream_generator(),
                content_type=connection_headers['content_type']
            )

            # Set status code based on range request
            if range_header:
                response.status_code = 206
                logger.info(f"[{client_id}] Set response status to 206 for range request")
            else:
                response.status_code = 200
                logger.info(f"[{client_id}] Set response status to 200 for full request")

            # Set headers that VLC expects
            response['Cache-Control'] = 'no-cache'
            response['Pragma'] = 'no-cache'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Connection'] = 'keep-alive'
            response['Accept-Ranges'] = 'bytes'

            # CRITICAL: Forward Content-Length from persistent connection
            if connection_headers['content_length']:
                response['Content-Length'] = connection_headers['content_length']
                logger.info(f"[{client_id}] *** FORWARDED Content-Length: {connection_headers['content_length']} *** (VLC seeking enabled)")
            else:
                logger.warning(f"[{client_id}] *** NO Content-Length available *** (VLC seeking may not work)")

            # Handle range requests - set Content-Range for partial responses
            if range_header and connection_headers['content_length']:
                try:
                    if 'bytes=' in range_header:
                        range_part = range_header.replace('bytes=', '')
                        if '-' in range_part:
                            start_byte, end_byte = range_part.split('-', 1)
                            start = int(start_byte) if start_byte else 0
                            end = int(end_byte) if end_byte else int(connection_headers['content_length']) - 1
                            total_size = int(connection_headers['content_length'])

                            content_range = f"bytes {start}-{end}/{total_size}"
                            response['Content-Range'] = content_range
                            logger.info(f"[{client_id}] Set Content-Range: {content_range}")
                except Exception as e:
                    logger.warning(f"[{client_id}] Could not set Content-Range: {e}")

            # Log response headers
            logger.info(f"[{client_id}] PERSISTENT Response - Status: {response.status_code}, Content-Length: {response.get('Content-Length', 'MISSING')}")
            if 'Content-Range' in response:
                logger.info(f"[{client_id}] PERSISTENT Content-Range: {response['Content-Range']}")

            # Log VLC seeking status
            if response.status_code == 200:
                if connection_headers['content_length']:
                    logger.info(f"[{client_id}] ✅ PERSISTENT VLC SEEKING: Full response with Content-Length - seeking should work!")
                else:
                    logger.info(f"[{client_id}] ❌ PERSISTENT VLC SEEKING: Full response but no Content-Length - seeking won't work!")
            elif response.status_code == 206:
                logger.info(f"[{client_id}] ✅ PERSISTENT VLC SEEKING: Partial response - seeking is working!")

            return response

        except Exception as e:
            logger.error(f"Error in persistent stream_content_with_session: {e}", exc_info=True)
            # Cleanup persistent connection on error
            if session_id in self._persistent_connections:
                self._persistent_connections[session_id].cleanup()
                del self._persistent_connections[session_id]
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
            return original_url

    def cleanup_persistent_connection(self, session_id: str):
        """Clean up a specific persistent connection"""
        if session_id in self._persistent_connections:
            logger.info(f"[{session_id}] Cleaning up persistent connection")
            self._persistent_connections[session_id].cleanup()
            del self._persistent_connections[session_id]

            # Clean up ALL Redis keys associated with this session
            session_key = f"vod_session:{session_id}"
            if self.redis_client:
                try:
                    session_data = self.redis_client.hgetall(session_key)
                    if session_data:
                        # Get session details for connection cleanup
                        content_type = session_data.get(b'content_type', b'').decode('utf-8')
                        content_uuid = session_data.get(b'content_uuid', b'').decode('utf-8')
                        profile_id = session_data.get(b'profile_id')

                        # Generate client_id from session_id (matches what's used during streaming)
                        client_id = session_id

                        # Remove individual connection tracking keys created during streaming
                        if content_type and content_uuid:
                            logger.info(f"[{session_id}] Cleaning up connection tracking keys")
                            self.remove_connection(content_type, content_uuid, client_id)

                        # Remove from profile connections if counted (additional safety check)
                        if session_data.get(b'connection_counted') == b'True' and profile_id:
                            profile_key = self._get_profile_connections_key(int(profile_id.decode('utf-8')))
                            current_count = int(self.redis_client.get(profile_key) or 0)
                            if current_count > 0:
                                self.redis_client.decr(profile_key)
                                logger.info(f"[{session_id}] Decremented profile {profile_id.decode('utf-8')} connections")

                    # Remove session tracking key
                    self.redis_client.delete(session_key)
                    logger.info(f"[{session_id}] Removed session tracking")

                    # Clean up any additional session-related keys (pattern cleanup)
                    try:
                        # Look for any other keys that might be related to this session
                        pattern = f"*{session_id}*"
                        cursor = 0
                        session_related_keys = []
                        while True:
                            cursor, keys = self.redis_client.scan(cursor, match=pattern, count=100)
                            session_related_keys.extend(keys)
                            if cursor == 0:
                                break

                        if session_related_keys:
                            # Filter out keys we already deleted
                            remaining_keys = [k for k in session_related_keys if k.decode('utf-8') != session_key]
                            if remaining_keys:
                                self.redis_client.delete(*remaining_keys)
                                logger.info(f"[{session_id}] Cleaned up {len(remaining_keys)} additional session-related keys")
                    except Exception as scan_error:
                        logger.warning(f"[{session_id}] Error during pattern cleanup: {scan_error}")

                except Exception as e:
                    logger.error(f"[{session_id}] Error cleaning up session: {e}")

    def cleanup_stale_persistent_connections(self, max_age_seconds: int = 1800):
        """Clean up stale persistent connections that haven't been used recently"""
        current_time = time.time()
        stale_sessions = []

        for session_id, conn in self._persistent_connections.items():
            try:
                # Check connection's last activity time first
                if hasattr(conn, 'last_activity'):
                    time_since_last_activity = current_time - conn.last_activity
                    if time_since_last_activity > max_age_seconds:
                        logger.info(f"[{session_id}] Connection inactive for {time_since_last_activity:.1f}s (max: {max_age_seconds}s)")
                        stale_sessions.append(session_id)
                        continue

                # Fallback to Redis session data if connection doesn't have last_activity
                session_key = f"vod_session:{session_id}"
                if self.redis_client:
                    session_data = self.redis_client.hgetall(session_key)
                    if session_data:
                        created_at = float(session_data.get(b'created_at', b'0').decode('utf-8'))
                        if current_time - created_at > max_age_seconds:
                            logger.info(f"[{session_id}] Session older than {max_age_seconds}s")
                            stale_sessions.append(session_id)
                    else:
                        # Session data missing, connection is stale
                        logger.info(f"[{session_id}] Session data missing from Redis")
                        stale_sessions.append(session_id)

            except Exception as e:
                logger.error(f"[{session_id}] Error checking session age: {e}")
                stale_sessions.append(session_id)

        # Clean up stale connections
        for session_id in stale_sessions:
            logger.info(f"[{session_id}] Cleaning up stale persistent connection")
            self.cleanup_persistent_connection(session_id)

        if stale_sessions:
            logger.info(f"Cleaned up {len(stale_sessions)} stale persistent connections")
        else:
            logger.debug(f"No stale persistent connections found (checked {len(self._persistent_connections)} connections)")


# Global instance
_connection_manager = None

def get_connection_manager() -> VODConnectionManager:
    """Get the global VOD connection manager instance"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = VODConnectionManager()
    return _connection_manager
