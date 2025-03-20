"""
Utilities for handling stream URLs and transformations.
"""

import logging
import re
from typing import Optional, Tuple
from django.shortcuts import get_object_or_404
from apps.channels.models import Channel, Stream
from apps.m3u.models import M3UAccount, M3UAccountProfile
from core.models import UserAgent, CoreSettings

logger = logging.getLogger("ts_proxy")

def generate_stream_url(channel_id: str) -> Tuple[str, str, bool]:
    """
    Generate the appropriate stream URL for a channel based on its profile settings.

    Args:
        channel_id: The UUID of the channel

    Returns:
        Tuple[str, str, bool]: (stream_url, user_agent, transcode_flag)
    """
    # Get channel and related objects
    channel = get_object_or_404(Channel, uuid=channel_id)
    stream_id, profile_id = channel.get_stream()

    if stream_id is None or profile_id is None:
        logger.error(f"No stream assigned to channel {channel_id}")
        return None, None, False

    # Get the M3U account profile for URL pattern
    stream = get_object_or_404(Stream, pk=stream_id)
    profile = get_object_or_404(M3UAccountProfile, pk=profile_id)

    # Get the appropriate user agent
    m3u_account = M3UAccount.objects.get(id=profile.m3u_account.id)
    stream_user_agent = UserAgent.objects.get(id=m3u_account.user_agent.id).user_agent

    if stream_user_agent is None:
        stream_user_agent = UserAgent.objects.get(id=CoreSettings.get_default_user_agent_id())
        logger.debug(f"No user agent found for account, using default: {stream_user_agent}")

    # Generate stream URL based on the selected profile
    input_url = stream.url
    stream_url = transform_url(input_url, profile.search_pattern, profile.replace_pattern)

    # Check if transcoding is needed
    stream_profile = channel.get_stream_profile()
    if stream_profile.is_proxy() or stream_profile is None:
        transcode = False
    else:
        transcode = True

    # Get profile name as string
    profile_value = str(stream_profile)

    return stream_url, stream_user_agent, transcode, profile_value

def transform_url(input_url: str, search_pattern: str, replace_pattern: str) -> str:
    """
    Transform a URL using regex pattern replacement.

    Args:
        input_url: The base URL to transform
        search_pattern: The regex search pattern
        replace_pattern: The replacement pattern

    Returns:
        str: The transformed URL
    """
    try:
        logger.debug("Executing URL pattern replacement:")
        logger.debug(f"  base URL: {input_url}")
        logger.debug(f"  search: {search_pattern}")

        # Handle backreferences in the replacement pattern
        safe_replace_pattern = re.sub(r'\$(\d+)', r'\\\1', replace_pattern)
        logger.debug(f"  replace: {replace_pattern}")
        logger.debug(f"  safe replace: {safe_replace_pattern}")

        # Apply the transformation
        stream_url = re.sub(search_pattern, safe_replace_pattern, input_url)
        logger.debug(f"Generated stream url: {stream_url}")

        return stream_url
    except Exception as e:
        logger.error(f"Error transforming URL: {e}")
        return input_url  # Return original URL on error

def get_stream_info_for_switch(channel_id: str, target_stream_id: Optional[int] = None) -> dict:
    """
    Get stream information for a channel switch, optionally to a specific stream ID.

    Args:
        channel_id: The UUID of the channel
        target_stream_id: Optional specific stream ID to switch to

    Returns:
        dict: Stream information including URL, user agent and transcode flag
    """
    channel = get_object_or_404(Channel, uuid=channel_id)

    # Use the target stream if specified, otherwise use current stream
    if target_stream_id:
        stream_id = target_stream_id
        # Find a compatible profile for this stream
        profiles = M3UAccountProfile.objects.filter(stream=stream_id)
        if not profiles.exists():
            logger.error(f"No profile found for stream {stream_id}")
            return {'error': 'No profile found for stream'}
        profile_id = profiles.first().id
    else:
        stream_id, profile_id = channel.get_stream()
        if stream_id is None or profile_id is None:
            return {'error': 'No stream assigned to channel'}

    # Generate the URL using our utility
    stream_url, user_agent, transcode, profile_value = generate_stream_url(channel_id)

    return {
        'url': stream_url,
        'user_agent': user_agent,
        'transcode': transcode,
        'profile': profile_value,
        'stream_id': stream_id,
        'profile_id': profile_id
    }
