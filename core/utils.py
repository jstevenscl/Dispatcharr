import redis
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

def get_redis_client():
    """Get Redis client with connection validation"""
    try:
        # Create Redis client
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=getattr(settings, 'REDIS_PORT', 6379),
            db=settings.REDIS_DB,
            socket_timeout=5,
            socket_connect_timeout=5
        )
        
        # Validate connection with ping
        client.ping()
        logger.info(f"Connected to Redis at {settings.REDIS_HOST}:6379/{settings.REDIS_DB}")
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        return None

# Initialize the global client
redis_client = get_redis_client()