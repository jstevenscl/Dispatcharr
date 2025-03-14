import redis
from django.conf import settings

# Global Redis connection (Singleton)
redis_client = redis.Redis(
    host=getattr(settings, "REDIS_HOST", "localhost"),
    port=6379,
    db=int(getattr(settings, "REDIS_DB", "0"))
)
