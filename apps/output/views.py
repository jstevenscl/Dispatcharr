from django.http import HttpResponse
from django.urls import reverse
from apps.channels.models import Channel
from apps.epg.models import ProgramData
from django.utils import timezone
from datetime import datetime, timedelta

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
        tvg_name = channel.tvg_id or channel.name
        tvg_logo = channel.logo_url or ""
        channel_number = channel.channel_number

        extinf_line = (
            f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{tvg_name}" tvg-logo="{tvg_logo}" '
            f'tvg-chno="{channel_number}" group-title="{group_title}",{channel.name}\n'
        )

        base_url = request.build_absolute_uri('/')[:-1]
        stream_url = f"{base_url}/proxy/ts/stream/{channel.uuid}"

        #stream_url = request.build_absolute_uri(reverse('output:stream', args=[channel.id]))
        m3u_content += extinf_line + stream_url + "\n"

    response = HttpResponse(m3u_content, content_type="application/x-mpegURL")
    response['Content-Disposition'] = 'attachment; filename="channels.m3u"'
    return response

def generate_dummy_epg(name, channel_id, num_days=7, interval_hours=4):
    xml_lines = []

    # Loop through the number of days
    for day_offset in range(num_days):
        current_day = datetime.now() + timedelta(days=day_offset)

        # Loop through each 4-hour interval in the day
        for hour in range(0, 24, interval_hours):
            start_time = current_day.replace(hour=hour, minute=0, second=0, microsecond=0)
            stop_time = start_time + timedelta(hours=interval_hours)

            # Format the times as per the requested format
            start_str = start_time.strftime("%Y%m%d%H%M%S") + " 0000"
            stop_str = stop_time.strftime("%Y%m%d%H%M%S") + " 0000"

            # Create the XML-like programme entry
            xml_lines.append(f'<programme start="{start_str}" stop="{stop_str}" channel="{channel_id}">')
            xml_lines.append(f'    <title lang="en">{name}</title>')
            xml_lines.append(f'</programme>')

    return xml_lines

def generate_epg(request):
    """
    Dynamically generate an XMLTV (EPG) file using the new EPGData/ProgramData models.
    Since the EPG data is stored independently of Channels, we group programmes
    by their associated EPGData record.
    This version does not filter by time, so it includes the entire EPG saved in the DB.
    """
    xml_lines = []
    xml_lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    xml_lines.append('<tv generator-info-name="Dispatcharr" generator-info-url="https://example.com">')

    # Retrieve all active channels
    channels = Channel.objects.all()
    for channel in channels:
        channel_id = channel.epg_data.tvg_id if channel.epg_data else f"default-{channel.id}"
        display_name = channel.epg_data.name if channel.epg_data else channel.name
        xml_lines.append(f'  <channel id="{channel_id}">')
        xml_lines.append(f'    <display-name>{display_name}</display-name>')
        xml_lines.append('  </channel>')

    for channel in channels:
        channel_id = channel.epg_data.tvg_id if channel.epg_data else f"default-{channel.id}"
        display_name = channel.epg_data.name if channel.epg_data else channel.name
        if not channel.epg_data:
            xml_lines = xml_lines + generate_dummy_epg(display_name, channel_id)
        else:
            programs = channel.epg_data.programs.all()
            for prog in programs:
                start_str = prog.start_time.strftime("%Y%m%d%H%M%S %z")
                stop_str = prog.end_time.strftime("%Y%m%d%H%M%S %z")
                xml_lines.append(f'  <programme start="{start_str}" stop="{stop_str}" channel="{channel_id}">')
                xml_lines.append(f'    <title>{prog.title}</title>')
                xml_lines.append(f'    <desc>{prog.description}</desc>')
                xml_lines.append('  </programme>')

    xml_lines.append('</tv>')
    xml_content = "\n".join(xml_lines)

    response = HttpResponse(xml_content, content_type="application/xml")
    response['Content-Disposition'] = 'attachment; filename="epg.xml"'
    return response
