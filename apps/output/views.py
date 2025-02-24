# apps/output/views.py
from django.http import HttpResponse
from django.urls import reverse
from apps.channels.models import Channel
from datetime import timedelta
from apps.epg.models import ProgramData
from apps.channels.models import Channel
from django.utils import timezone

def generate_m3u(request):
    """
    Dynamically generate an M3U file from channels.
    The stream URL now points to the new stream_view that uses StreamProfile.
    """
    m3u_content = "#EXTM3U\n"
    channels = Channel.objects.order_by('channel_number')
    for channel in channels:
        group_title = channel.channel_group.name if channel.channel_group else "Default"
        tvg_id = channel.tvg_id or ""
        tvg_name = channel.tvg_name or channel.channel_name
        tvg_logo = channel.logo_url or ""
        channel_number = channel.channel_number

        extinf_line = (
            f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{tvg_name}" tvg-logo="{tvg_logo}" '
            f'tvg-chno="{channel_number}" group-title="{group_title}",{channel.channel_name}\n'
        )
        # Use the new stream view from outputs app
        stream_url = request.build_absolute_uri(reverse('output:stream', args=[channel.id]))
        m3u_content += extinf_line + stream_url + "\n"

    response = HttpResponse(m3u_content, content_type="application/x-mpegURL")
    response['Content-Disposition'] = 'attachment; filename="channels.m3u"'
    return response

def generate_epg(request):
    """
    Dynamically generate an XMLTV (EPG) file using the new EPGData/ProgramData models.
    Only channels that have EPG programmes (via EPGData) are included.
    """
    now = timezone.now()
    end_time = now + timedelta(hours=24)
    
    # Query ProgramData objects in the next 24 hours
    programs = ProgramData.objects.select_related('epg__channel').filter(
        start_time__gte=now, start_time__lte=end_time
    ).order_by('start_time')

    # Group programmes by their channel (via EPGData)
    channels_programs = {}
    for prog in programs:
        if prog.epg and prog.epg.channel:
            channel = prog.epg.channel
            channels_programs.setdefault(channel, []).append(prog)

    xml_lines = []
    xml_lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    xml_lines.append('<tv generator-info-name="Dispatcharr" generator-info-url="https://example.com">')
    
    # Output channel definitions for channels that have programmes
    for channel in channels_programs.keys():
        xml_lines.append(f'  <channel id="{channel.id}">')
        xml_lines.append(f'    <display-name>{channel.channel_name}</display-name>')
        if channel.logo_url:
            xml_lines.append(f'    <icon src="{channel.logo_url}" />')
        xml_lines.append('  </channel>')
    
    # Output programme entries
    for channel, progs in channels_programs.items():
        for prog in progs:
            start_str = prog.start_time.strftime("%Y%m%d%H%M%S %z")
            stop_str = prog.end_time.strftime("%Y%m%d%H%M%S %z")
            xml_lines.append(f'  <programme start="{start_str}" stop="{stop_str}" channel="{channel.id}">')
            xml_lines.append(f'    <title>{prog.title}</title>')
            xml_lines.append(f'    <desc>{prog.description}</desc>')
            xml_lines.append('  </programme>')
    
    xml_lines.append('</tv>')
    xml_content = "\n".join(xml_lines)

    response = HttpResponse(xml_content, content_type="application/xml")
    response['Content-Disposition'] = 'attachment; filename="epg.xml"'
    return response

