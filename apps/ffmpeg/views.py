import os
import redis
import subprocess

from django.conf import settings
from django.http import (
    StreamingHttpResponse,
    HttpResponseServerError,
    FileResponse,
    Http404,
)
from django.db.models import F
from apps.channels.models import Channel, Stream

# Configure Redis
redis_host = os.environ.get("REDIS_HOST", "redis")
redis_port = int(os.environ.get("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)

def serve_hls_segment(request, stream_id, filename):
    # Remove any trailing slashes from the filename. / caused problems.
    filename = filename.rstrip('/')
    
    # Construct the file path (e.g., /tmp/hls_4/segment_001.ts)
    file_path = os.path.join('/tmp', f'hls_{stream_id}', filename)
    
    if os.path.exists(file_path):
        return FileResponse(open(file_path, 'rb'), content_type='video/MP2T')
    else:
        raise Http404("Segment not found")


def stream_view(request, stream_id):
    try:
        channel = Channel.objects.get(id=stream_id)
        if not channel.streams.exists():
            return HttpResponseServerError("No stream found for this channel.")
        # Pick the first available stream and get its actual model instance.
        stream = channel.streams.first()
        # Use the custom URL if available; otherwise, the regular URL.
        input_url = stream.custom_url or stream.url

        # Increment the viewer count atomically.
        Stream.objects.filter(id=stream.id).update(current_viewers=F('current_viewers') + 1)

        ffmpeg_cmd = [
            "ffmpeg",
            "-i", input_url,
            "-c:v", "copy",
            "-c:a", "copy",
            "-f", "mpegts",
            "-"  # output to stdout
        ]
        process = subprocess.Popen(
            ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except Exception as e:
        return HttpResponseServerError(f"Error starting stream: {e}")

    def stream_generator(process, stream):
        try:
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            # Decrement the viewer count when the stream finishes or the connection closes.
            Stream.objects.filter(id=stream.id).update(current_viewers=F('current_viewers') - 1)

    return StreamingHttpResponse(
        stream_generator(process, stream),
        content_type="video/MP2T"
    )
