import redis
from django.conf import settings

# Global Redis connection (Singleton)
redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=6379,
    db=settings.REDIS_DB
)
