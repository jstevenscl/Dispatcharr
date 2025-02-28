import os
import sys
import subprocess
import logging
import re
from django.conf import settings
from django.http import StreamingHttpResponse, HttpResponseServerError
from django.db import transaction
from django.shortcuts import render
from apps.channels.models import Channel, Stream
from apps.m3u.models import M3UAccountProfile
from core.models import StreamProfile

# Configure logging to output to the console.
logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)
logger = logging.getLogger(__name__)

def settings_view(request):
    """
    Renders the settings page.
    """
    return render(request, 'settings.html')


def stream_view(request, stream_id):
    """
    Streams the first available stream for the given channel.
    It uses the channel’s assigned StreamProfile.
    """
    try:
        # Retrieve the channel by the provided stream_id.
        channel = Channel.objects.get(channel_number=stream_id)
        logger.debug("Channel retrieved: ID=%s, Name=%s", channel.id, channel.channel_name)

        # Ensure the channel has at least one stream.
        if not channel.streams.exists():
            logger.error("No streams found for channel ID=%s", channel.id)
            return HttpResponseServerError("No stream found for this channel.")

        # Get the first available stream.
        stream = channel.streams.first()
        logger.debug("Using stream: ID=%s, Name=%s", stream.id, stream.name)

        # Retrieve m3u account to determine number of streams and profiles
        m3u_account = stream.m3u_account
        logger.debug(f"Using M3U account ID={m3u_account.id}, Name={m3u_account.name}")

        # Use the custom URL if available; otherwise, use the standard URL.
        input_url = stream.custom_url or stream.url
        logger.debug("Input URL: %s", input_url)

        # Determine which profile we can use
        m3u_profiles = m3u_account.profiles.all()
        default_profile = next((obj for obj in m3u_profiles if obj.is_default), None)

        # Get the remaining objects
        profiles = [obj for obj in m3u_profiles if not obj.is_default]

        active_profile = None
        for profile in [default_profile] + profiles:
            if not profile.is_active:
                continue
            if profile.current_viewers < profile.max_streams:
                logger.debug(f"Using M3U profile ID={profile.id}")
                active_profile = M3UAccountProfile.objects.get(id=profile.id)
                logger.debug("Executing the following pattern replacement:")
                logger.debug(f"  search: {profile.search_pattern}")
                # Convert $1 to \1 for Python regex
                safe_replace_pattern = re.sub(r'\$(\d+)', r'\\\1', profile.replace_pattern)
                logger.debug(f"  replace: {profile.replace_pattern}")
                logger.debug(f"  safe replace: {safe_replace_pattern}")
                stream_url = re.sub(profile.search_pattern, safe_replace_pattern, input_url)
                logger.debug(f"Generated stream url: {stream_url}")
                break

        if active_profile is None:
            logger.exception("No available profiles for the stream")
            return HttpResponseServerError("No available profiles for the stream")

        # Get the stream profile set on the channel.
        stream_profile = channel.stream_profile
        if not stream_profile:
            logger.error("No stream profile set for channel ID=%s", channel.id)
            return HttpResponseServerError("No stream profile set for this channel.")
        logger.debug("Stream profile used: %s", stream_profile.profile_name)

        # Determine the user agent to use.
        user_agent = stream_profile.user_agent or getattr(settings, "DEFAULT_USER_AGENT", "Mozilla/5.0")
        logger.debug("User agent: %s", user_agent)

        # Substitute placeholders in the parameters template.
        parameters = stream_profile.parameters.format(userAgent=user_agent, streamUrl=stream_url)
        logger.debug("Formatted parameters: %s", parameters)

        # Build the final command.
        cmd = [stream_profile.command] + parameters.split()
        logger.debug("Executing command: %s", cmd)

        # Transactional block to ensure atomic viewer count updates.
        with transaction.atomic():
            # Increment the viewer count.
            active_profile.current_viewers += 1
            active_profile.save()
            logger.debug("Viewer count incremented for stream ID=%s", stream.id)

            # Start the streaming process.
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        def stream_generator(proc, s):
            try:
                while True:
                    chunk = proc.stdout.read(8192)
                    if not chunk:
                        break
                    yield chunk
            finally:
                # Decrement the viewer count once streaming ends.
                try:
                    with transaction.atomic():
                        active_profile.current_viewers -= 1
                        active_profile.save()
                        logger.debug("Viewer count decremented for stream ID=%s", s.id)
                except Exception as e:
                    logger.error(f"Error updating viewer count for stream {s.id}: {e}")

        return StreamingHttpResponse(stream_generator(process, stream), content_type="video/MP2T")
    except Exception as e:
        logger.exception("Error starting stream for channel ID=%s", stream_id)
        return HttpResponseServerError(f"Error starting stream: {e}")
