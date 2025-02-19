from django.http import HttpResponse
from django.urls import reverse
from apps.channels.models import Channel

def generate_m3u(request):
    """
    Dynamically generate an M3U file from channels with extended metadata,
    and have the stream URL point to the ffmpeg relay.
    """
    m3u_content = "#EXTM3U\n"

    channels = Channel.objects.order_by('channel_number')

    for channel in channels:
        group_title = channel.channel_group.name if channel.channel_group else "Default"
        tvg_id = channel.tvg_id or ""
        tvg_name = channel.tvg_name or channel.channel_name
        tvg_logo = channel.logo_url or ""  # Adjust if you have a fallback
        channel_number = channel.channel_number

        extinf_line = (
            f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{tvg_name}" tvg-logo="{tvg_logo}" '
            f'tvg-chno="{channel_number}" group-title="{group_title}",{channel.channel_name}\n'
        )

        ffmpeg_url = request.build_absolute_uri(reverse('ffmpeg:stream', args=[channel.id]))
        m3u_content += extinf_line + ffmpeg_url + "\n"

    # Return the generated content with the appropriate MIME type.
    response = HttpResponse(m3u_content, content_type="application/x-mpegURL")
    response['Content-Disposition'] = 'attachment; filename="channels.m3u"'
    return response
