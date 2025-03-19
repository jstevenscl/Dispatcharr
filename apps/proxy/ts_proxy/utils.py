import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger("ts_proxy")

def detect_stream_type(url):
    """
    Detect if stream URL is HLS or TS format.

    Args:
        url (str): The stream URL to analyze

    Returns:
        str: 'hls' or 'ts' depending on detected format
    """
    if not url:
        return 'unknown'

    url_lower = url.lower()

    # Look for common HLS indicators
    if (url_lower.endswith('.m3u8') or
        '.m3u8?' in url_lower or
        '/playlist.m3u' in url_lower):
        return 'hls'

    # Additional HLS patterns
    parsed = urlparse(url)
    path = parsed.path.lower()
    if ('playlist' in path and ('.m3u' in path or '.m3u8' in path)) or \
       ('manifest' in path and ('.m3u' in path or '.m3u8' in path)) or \
       ('master' in path and ('.m3u' in path or '.m3u8' in path)):
        return 'hls'

    # Default to TS
    return 'ts'

def get_client_ip(request):
    """
    Extract client IP address from request.
    Handles cases where request is behind a proxy by checking X-Forwarded-For.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip