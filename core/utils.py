import redis
import logging
import time
import os
import threading
from django.conf import settings
from redis.exceptions import ConnectionError, TimeoutError
from django.core.cache import cache
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

# Import the command detector
from .command_utils import is_management_command

class RedisClient:
    _client = None
    _pubsub_client = None

    @classmethod
    def get_client(cls, max_retries=5, retry_interval=1):
        if cls._client is None:
            retry_count = 0
            while retry_count < max_retries:
                try:
                    # Get connection parameters from settings or environment
                    redis_host = os.environ.get("REDIS_HOST", getattr(settings, 'REDIS_HOST', 'localhost'))
                    redis_port = int(os.environ.get("REDIS_PORT", getattr(settings, 'REDIS_PORT', 6379)))
                    redis_db = int(os.environ.get("REDIS_DB", getattr(settings, 'REDIS_DB', 0)))

                    # Use standardized settings
                    socket_timeout = getattr(settings, 'REDIS_SOCKET_TIMEOUT', 5)
                    socket_connect_timeout = getattr(settings, 'REDIS_SOCKET_CONNECT_TIMEOUT', 5)
                    health_check_interval = getattr(settings, 'REDIS_HEALTH_CHECK_INTERVAL', 30)
                    socket_keepalive = getattr(settings, 'REDIS_SOCKET_KEEPALIVE', True)
                    retry_on_timeout = getattr(settings, 'REDIS_RETRY_ON_TIMEOUT', True)

                    # Create Redis client with better defaults
                    client = redis.Redis(
                        host=redis_host,
                        port=redis_port,
                        db=redis_db,
                        socket_timeout=socket_timeout,
                        socket_connect_timeout=socket_connect_timeout,
                        socket_keepalive=socket_keepalive,
                        health_check_interval=health_check_interval,
                        retry_on_timeout=retry_on_timeout
                    )

                    # Validate connection with ping
                    client.ping()
                    client.flushdb()
                    logger.info(f"Connected to Redis at {redis_host}:{redis_port}/{redis_db}")

                    cls._client = client
                    break

                except (ConnectionError, TimeoutError) as e:
                    retry_count += 1
                    if retry_count >= max_retries:
                        logger.error(f"Failed to connect to Redis after {max_retries} attempts: {e}")
                        return None
                    else:
                        # Use exponential backoff for retries
                        wait_time = retry_interval * (2 ** (retry_count - 1))
                        logger.warning(f"Redis connection failed. Retrying in {wait_time}s... ({retry_count}/{max_retries})")
                        time.sleep(wait_time)

                except Exception as e:
                    logger.error(f"Unexpected error connecting to Redis: {e}")
                    return None

        return cls._client

    @classmethod
    def get_pubsub_client(cls, max_retries=5, retry_interval=1):
        """Get Redis client optimized for PubSub operations"""
        if cls._pubsub_client is None:
            retry_count = 0
            while retry_count < max_retries:
                try:
                    # Get connection parameters from settings or environment
                    redis_host = os.environ.get("REDIS_HOST", getattr(settings, 'REDIS_HOST', 'localhost'))
                    redis_port = int(os.environ.get("REDIS_PORT", getattr(settings, 'REDIS_PORT', 6379)))
                    redis_db = int(os.environ.get("REDIS_DB", getattr(settings, 'REDIS_DB', 0)))

                    # Use standardized settings but without socket timeouts for PubSub
                    # Important: socket_timeout is None for PubSub operations
                    socket_connect_timeout = getattr(settings, 'REDIS_SOCKET_CONNECT_TIMEOUT', 5)
                    socket_keepalive = getattr(settings, 'REDIS_SOCKET_KEEPALIVE', True)
                    health_check_interval = getattr(settings, 'REDIS_HEALTH_CHECK_INTERVAL', 30)
                    retry_on_timeout = getattr(settings, 'REDIS_RETRY_ON_TIMEOUT', True)

                    # Create Redis client with PubSub-optimized settings - no timeout
                    client = redis.Redis(
                        host=redis_host,
                        port=redis_port,
                        db=redis_db,
                        socket_timeout=None,  # Critical: No timeout for PubSub operations
                        socket_connect_timeout=socket_connect_timeout,
                        socket_keepalive=socket_keepalive,
                        health_check_interval=health_check_interval,
                        retry_on_timeout=retry_on_timeout
                    )

                    # Validate connection with ping
                    client.ping()
                    logger.info(f"Connected to Redis for PubSub at {redis_host}:{redis_port}/{redis_db}")

                    # We don't need the keepalive thread anymore since we're using proper PubSub handling
                    cls._pubsub_client = client
                    break

                except (ConnectionError, TimeoutError) as e:
                    retry_count += 1
                    if retry_count >= max_retries:
                        logger.error(f"Failed to connect to Redis for PubSub after {max_retries} attempts: {e}")
                        return None
                    else:
                        # Use exponential backoff for retries
                        wait_time = retry_interval * (2 ** (retry_count - 1))
                        logger.warning(f"Redis PubSub connection failed. Retrying in {wait_time}s... ({retry_count}/{max_retries})")
                        time.sleep(wait_time)

                except Exception as e:
                    logger.error(f"Unexpected error connecting to Redis for PubSub: {e}")
                    return None

        return cls._pubsub_client

def acquire_task_lock(task_name, id):
    """Acquire a lock to prevent concurrent task execution."""
    redis_client = RedisClient.get_client()
    lock_id = f"task_lock_{task_name}_{id}"

    # Use the Redis SET command with NX (only set if not exists) and EX (set expiration)
    lock_acquired = redis_client.set(lock_id, "locked", ex=300, nx=True)

    if not lock_acquired:
        logger.warning(f"Lock for {task_name} and id={id} already acquired. Task will not proceed.")

    return lock_acquired

def release_task_lock(task_name, id):
    """Release the lock after task execution."""
    redis_client = RedisClient.get_client()
    lock_id = f"task_lock_{task_name}_{id}"

    # Remove the lock
    redis_client.delete(lock_id)

def send_websocket_event(event, success, data):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'updates',
        {
            'type': 'update',
            "data": {"success": True, "type": "epg_channels"}
        }
    )
