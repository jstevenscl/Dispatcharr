import os
import sys
import subprocess
import logging

from django.conf import settings
from django.http import StreamingHttpResponse, HttpResponseServerError
from django.db.models import F
from django.shortcuts import render

from apps.channels.models import Channel, Stream
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
        channel = Channel.objects.get(id=stream_id)
        logger.debug("Channel retrieved: ID=%s, Name=%s", channel.id, channel.channel_name)

        # Ensure the channel has at least one stream.
        if not channel.streams.exists():
            logger.error("No streams found for channel ID=%s", channel.id)
            return HttpResponseServerError("No stream found for this channel.")

        # Get the first available stream.
        stream = channel.streams.first()
        logger.debug("Using stream: ID=%s, Name=%s", stream.id, stream.name)

        # Use the custom URL if available; otherwise, use the standard URL.
        input_url = stream.custom_url or stream.url
        logger.debug("Input URL: %s", input_url)

        # Get the stream profile set on the channel.
        # (Ensure your Channel model has a 'stream_profile' field.)
        profile = channel.stream_profile
        if not profile:
            logger.error("No stream profile set for channel ID=%s", channel.id)
            return HttpResponseServerError("No stream profile set for this channel.")
        logger.debug("Stream profile used: %s", profile.profile_name)

        # Determine the user agent to use.
        user_agent = profile.user_agent or getattr(settings, "DEFAULT_USER_AGENT", "Mozilla/5.0")
        logger.debug("User agent: %s", user_agent)

        # Substitute placeholders in the parameters template.
        parameters = profile.parameters.format(userAgent=user_agent, streamUrl=input_url)
        logger.debug("Formatted parameters: %s", parameters)

        # Build the final command.
        cmd = [profile.command] + parameters.split()
        logger.debug("Executing command: %s", cmd)

        # Increment the viewer count.
        Stream.objects.filter(id=stream.id).update(current_viewers=F('current_viewers') + 1)
        logger.debug("Viewer count incremented for stream ID=%s", stream.id)

        # Start the streaming process.
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        logger.exception("Error starting stream for channel ID=%s", stream_id)
        return HttpResponseServerError(f"Error starting stream: {e}")

    def stream_generator(proc, s):
        try:
            while True:
                chunk = proc.stdout.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            # Decrement the viewer count once streaming ends.
            Stream.objects.filter(id=s.id).update(current_viewers=F('current_viewers') - 1)
            logger.debug("Viewer count decremented for stream ID=%s", s.id)

    return StreamingHttpResponse(stream_generator(process, stream), content_type="video/MP2T")
