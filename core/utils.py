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
import gc

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

                    # Disable persistence on first connection - improves performance
                    # Only try to disable if not in a read-only environment
                    try:
                        client.config_set('save', '')  # Disable RDB snapshots
                        client.config_set('appendonly', 'no')  # Disable AOF logging

                        # Set optimal memory settings with environment variable support
                        # Get max memory from environment or use a larger default (512MB instead of 256MB)
                        #max_memory = os.environ.get('REDIS_MAX_MEMORY', '512mb')
                        #eviction_policy = os.environ.get('REDIS_EVICTION_POLICY', 'allkeys-lru')

                        # Apply memory settings
                        #client.config_set('maxmemory-policy', eviction_policy)
                        #client.config_set('maxmemory', max_memory)

                        #logger.info(f"Redis configured with maxmemory={max_memory}, policy={eviction_policy}")

                        # Disable protected mode when in debug mode
                        if os.environ.get('DISPATCHARR_DEBUG', '').lower() == 'true':
                            client.config_set('protected-mode', 'no')  # Disable protected mode in debug
                            logger.warning("Redis protected mode disabled for debug environment")

                        logger.trace("Redis persistence disabled for better performance")
                    except redis.exceptions.ResponseError as e:
                        # Improve error handling for Redis configuration errors
                        if "OOM" in str(e):
                            logger.error(f"Redis OOM during configuration: {e}")
                            # Try to increase maxmemory as an emergency measure
                            try:
                                client.config_set('maxmemory', '768mb')
                                logger.warning("Applied emergency Redis memory increase to 768MB")
                            except:
                                pass
                        else:
                            logger.error(f"Redis configuration error: {e}")

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

def send_websocket_update(group_name, event_type, data, collect_garbage=False):
    """
    Standardized function to send WebSocket updates with proper memory management.

    Args:
        group_name: The WebSocket group to send to (e.g. 'updates')
        event_type: The type of message (e.g. 'update')
        data: The data to send
        collect_garbage: Whether to force garbage collection after sending
    """
    channel_layer = get_channel_layer()
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': event_type,
                'data': data
            }
        )
    except Exception as e:
        logger.warning(f"Failed to send WebSocket update: {e}")
    finally:
        # Explicitly release references to help garbage collection
        channel_layer = None

        # Force garbage collection if requested
        if collect_garbage:
            gc.collect()

def send_websocket_event(event, success, data):
    """Acquire a lock to prevent concurrent task execution."""
    data_payload = {"success": success, "type": event}
    if data:
        # Make a copy to avoid modifying the original
        data_payload.update(data)

    # Use the standardized function
    send_websocket_update('updates', 'update', data_payload)

    # Help garbage collection by clearing references
    data_payload = None

# Add memory monitoring utilities
def get_memory_usage():
    """Returns current memory usage in MB"""
    import psutil
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

def monitor_memory_usage(func):
    """Decorator to monitor memory usage before and after function execution"""
    def wrapper(*args, **kwargs):
        import gc
        # Force garbage collection before measuring
        gc.collect()

        # Get initial memory usage
        start_mem = get_memory_usage()
        logger.debug(f"Memory usage before {func.__name__}: {start_mem:.2f} MB")

        # Call the original function
        result = func(*args, **kwargs)

        # Force garbage collection before measuring again
        gc.collect()

        # Get final memory usage
        end_mem = get_memory_usage()
        logger.debug(f"Memory usage after {func.__name__}: {end_mem:.2f} MB (Change: {end_mem - start_mem:.2f} MB)")

        return result
    return wrapper

def cleanup_memory(log_usage=False, force_collection=True):
    """
    Comprehensive memory cleanup function to reduce memory footprint

    Args:
        log_usage: Whether to log memory usage before and after cleanup
        force_collection: Whether to force garbage collection
    """
    logger.trace("Starting memory cleanup django memory cleanup")
    # Skip logging if log level is not set to debug or more verbose (like trace)
    current_log_level = logger.getEffectiveLevel()
    if not current_log_level <= logging.DEBUG:
        log_usage = False
    if log_usage:
        try:
            import psutil
            process = psutil.Process()
            before_mem = process.memory_info().rss / (1024 * 1024)
            logger.debug(f"Memory before cleanup: {before_mem:.2f} MB")
        except (ImportError, Exception) as e:
            logger.debug(f"Error getting memory usage: {e}")

    # Clear any object caches from Django ORM
    from django.db import connection, reset_queries
    reset_queries()

    # Force garbage collection
    if force_collection:
        # Run full collection
        gc.collect(generation=2)
        # Clear cyclic references
        gc.collect(generation=0)

    if log_usage:
        try:
            import psutil
            process = psutil.Process()
            after_mem = process.memory_info().rss / (1024 * 1024)
            logger.debug(f"Memory after cleanup: {after_mem:.2f} MB (change: {after_mem-before_mem:.2f} MB)")
        except (ImportError, Exception):
            pass
    logger.trace("Memory cleanup complete for django")
