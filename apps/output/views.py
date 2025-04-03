from django.http import HttpResponse
from django.urls import reverse
from apps.channels.models import Channel, ChannelProfile
from apps.epg.models import ProgramData
from django.utils import timezone
from datetime import datetime, timedelta

def generate_m3u(request, profile_name=None):
    """
    Dynamically generate an M3U file from channels.
    The stream URL now points to the new stream_view that uses StreamProfile.
    """
    if profile_name is not None:
        channel_profile = ChannelProfile.objects.get(name=profile_name)
        channels = Channel.objects.filter(
            channelprofilemembership__channel_profile=channel_profile,
            channelprofilemembership__enabled=True
        ).order_by('channel_number')
    else:
        channels = Channel.objects.order_by('channel_number')

    m3u_content = "#EXTM3U\n"
    for channel in channels:
        group_title = channel.channel_group.name if channel.channel_group else "Default"
        tvg_id = channel.tvg_id or ""
        tvg_name = channel.tvg_id or channel.name
        tvg_logo = channel.logo.url if channel.logo else ""
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

def generate_epg(request, profile_name=None):
    """
    Dynamically generate an XMLTV (EPG) file using the new EPGData/ProgramData models.
    Since the EPG data is stored independently of Channels, we group programmes
    by their associated EPGData record.
    This version does not filter by time, so it includes the entire EPG saved in the DB.
    """
    xml_lines = []
    xml_lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    xml_lines.append('<tv generator-info-name="Dispatcharr" generator-info-url="https://example.com">')

    if profile_name is not None:
        channel_profile = ChannelProfile.objects.get(name=profile_name)
        channels = Channel.objects.filter(
            channelprofilemembership__channel_profile=channel_profile,
            channelprofilemembership__enabled=True
        )
    else:
        channels = Channel.objects.all()

    # Retrieve all active channels
    for channel in channels:
        channel_id = channel.epg_data.tvg_id if channel.epg_data else f"default-{channel.id}"
        display_name = channel.epg_data.name if channel.epg_data else channel.name
        xml_lines.append(f'  <channel id="{channel_id}">')
        xml_lines.append(f'    <display-name>{display_name}</display-name>')

        # Add channel logo if available
        if channel.logo:
            # Use the full URL for the logo
            base_url = request.build_absolute_uri('/')[:-1]
            logo_url = channel.logo.url

            # Convert to absolute URL if it's relative
            if logo_url.startswith('/'):
                logo_url = f"{base_url}{logo_url}"

            xml_lines.append(f'    <icon src="{logo_url}" />')

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

                # Add subtitle if available
                if prog.sub_title:
                    xml_lines.append(f'    <sub-title>{prog.sub_title}</sub-title>')

                # Add description if available
                if prog.description:
                    xml_lines.append(f'    <desc>{prog.description}</desc>')

                # Process custom properties if available
                if prog.custom_properties:
                    try:
                        import json
                        custom_data = json.loads(prog.custom_properties)

                        # Add categories if available
                        if 'categories' in custom_data and custom_data['categories']:
                            for category in custom_data['categories']:
                                xml_lines.append(f'    <category>{category}</category>')

                        # Handle episode numbering - multiple formats supported
                        # Standard episode number if available
                        if 'episode' in custom_data:
                            xml_lines.append(f'    <episode-num system="onscreen">E{custom_data["episode"]}</episode-num>')

                        # Handle onscreen episode format (like S06E128)
                        if 'onscreen_episode' in custom_data:
                            xml_lines.append(f'    <episode-num system="onscreen">{custom_data["onscreen_episode"]}</episode-num>')

                        # Add season and episode numbers in xmltv_ns format if available
                        if 'season' in custom_data and 'episode' in custom_data:
                            season = int(custom_data['season']) - 1 if str(custom_data['season']).isdigit() else 0
                            episode = int(custom_data['episode']) - 1 if str(custom_data['episode']).isdigit() else 0
                            xml_lines.append(f'    <episode-num system="xmltv_ns">{season}.{episode}.</episode-num>')

                        # Add rating if available
                        if 'rating' in custom_data:
                            rating_system = custom_data.get('rating_system', 'TV Parental Guidelines')
                            xml_lines.append(f'    <rating system="{rating_system}">')
                            xml_lines.append(f'      <value>{custom_data["rating"]}</value>')
                            xml_lines.append(f'    </rating>')

                        # Add actors/directors/writers if available
                        if 'credits' in custom_data:
                            xml_lines.append(f'    <credits>')
                            for role, people in custom_data['credits'].items():
                                if isinstance(people, list):
                                    for person in people:
                                        xml_lines.append(f'      <{role}>{person}</{role}>')
                                else:
                                    xml_lines.append(f'      <{role}>{people}</{role}>')
                            xml_lines.append(f'    </credits>')

                        # Add program date/year if available
                        if 'year' in custom_data:
                            xml_lines.append(f'    <date>{custom_data["year"]}</date>')

                        # Add country if available
                        if 'country' in custom_data:
                            xml_lines.append(f'    <country>{custom_data["country"]}</country>')

                        # Add icon if available
                        if 'icon' in custom_data:
                            xml_lines.append(f'    <icon src="{custom_data["icon"]}" />')

                        # Add special flags as proper tags
                        if custom_data.get('previously_shown', False):
                            xml_lines.append(f'    <previously-shown />')

                        if custom_data.get('premiere', False):
                            xml_lines.append(f'    <premiere />')

                        if custom_data.get('new', False):
                            xml_lines.append(f'    <new />')

                        # Define all properties we specifically handle to avoid adding them as comments
                        skip_keys = [
                            'categories', 'episode', 'season', 'rating', 'rating_system', 'credits',
                            'year', 'country', 'icon', 'previously_shown', 'premiere', 'new',
                            'onscreen_episode'
                        ]

                        # Don't add comments for standard properties - XMLTV clients don't need them
                        # and they just clutter the output
                    except Exception as e:
                        xml_lines.append(f'    <!-- Error parsing custom properties: {str(e)} -->')

                xml_lines.append('  </programme>')

    xml_lines.append('</tv>')
    xml_content = "\n".join(xml_lines)

    response = HttpResponse(xml_content, content_type="application/xml")
    response['Content-Disposition'] = 'attachment; filename="epg.xml"'
    return response
