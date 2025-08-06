"""
VOD Connection Manager - Redis-based connection tracking for VOD streams
"""

import time
import json
import logging
import threading
from typing import Optional, Dict, Any
from core.utils import RedisClient
from apps.vod.models import Movie, Episode
from apps.m3u.models import M3UAccountProfile

logger = logging.getLogger("vod_proxy")


class VODConnectionManager:
    """Manages VOD connections using Redis for tracking"""

    def __init__(self):
        self.redis_client = RedisClient.get_client()
        self.connection_ttl = 3600  # 1 hour TTL for connections

    def _get_connection_key(self, content_type: str, content_uuid: str, client_id: str) -> str:
        """Get Redis key for a specific connection"""
        return f"vod_proxy:connection:{content_type}:{content_uuid}:{client_id}"

    def _get_profile_connections_key(self, profile_id: int) -> str:
        """Get Redis key for tracking connections per profile"""
        return f"vod_proxy:profile:{profile_id}:connections"

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
            # Check profile connection limits
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

            # Add to profile connections set
            pipe.sadd(profile_connections_key, client_id)
            pipe.expire(profile_connections_key, self.connection_ttl)

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
            current_connections = self.redis_client.scard(profile_connections_key) or 0

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

            # Remove from profile connections set
            if profile_id:
                profile_connections_key = self._get_profile_connections_key(profile_id)
                pipe.srem(profile_connections_key, client_id)

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
        """Get current connection count for a profile"""
        if not self.redis_client:
            return 0

        try:
            profile_connections_key = self._get_profile_connections_key(profile_id)
            return self.redis_client.scard(profile_connections_key) or 0

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


# Global instance
_connection_manager = None

def get_connection_manager() -> VODConnectionManager:
    """Get the global VOD connection manager instance"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = VODConnectionManager()
    return _connection_manager
