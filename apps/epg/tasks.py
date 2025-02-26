import logging
from celery import shared_task
from .models import EPGSource, EPGData, ProgramData
from apps.channels.models import Channel
from django.utils import timezone
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone as dt_timezone
from django.db import transaction

logger = logging.getLogger(__name__)

@shared_task
def refresh_epg_data():
    logger.info("Starting refresh_epg_data task.")
    active_sources = EPGSource.objects.filter(is_active=True)
    logger.debug(f"Found {active_sources.count()} active EPGSource(s).")
    for source in active_sources:
        logger.info(f"Processing EPGSource: {source.name} (type: {source.source_type})")
        if source.source_type == 'xmltv':
            fetch_xmltv(source)
        elif source.source_type == 'schedules_direct':
            fetch_schedules_direct(source)
    logger.info("Finished refresh_epg_data task.")
    return "EPG data refreshed."

def fetch_xmltv(source):
    logger.info(f"Fetching XMLTV data from source: {source.name}")
    try:
        response = requests.get(source.url, timeout=30)
        response.raise_for_status()
        logger.debug("XMLTV data fetched successfully.")
        root = ET.fromstring(response.content)
        logger.debug("Parsed XMLTV XML content.")

        # Group programmes by channel tvg_id
        programmes_by_channel = {}
        for programme in root.findall('programme'):
            start_time = parse_xmltv_time(programme.get('start'))
            stop_time = parse_xmltv_time(programme.get('stop'))
            channel_tvg_id = programme.get('channel')
            title = programme.findtext('title', default='No Title')
            desc = programme.findtext('desc', default='')

            programmes_by_channel.setdefault(channel_tvg_id, []).append({
                'start_time': start_time,
                'end_time': stop_time,
                'title': title,
                'description': desc,
                'tvg_id': channel_tvg_id,
            })

        # Process each channel group
        for tvg_id, programmes in programmes_by_channel.items():
            try:
                channel = Channel.objects.get(tvg_id=tvg_id)
                logger.debug(f"Found Channel: {channel}")
            except Channel.DoesNotExist:
                logger.warning(f"No channel found for tvg_id '{tvg_id}'. Skipping programmes.")
                continue

            # Get or create the EPGData record for the channel
            epg_data, created = EPGData.objects.get_or_create(
                channel=channel,
                defaults={'channel_name': channel.channel_name}
            )
            if not created and epg_data.channel_name != channel.channel_name:
                epg_data.channel_name = channel.channel_name
                epg_data.save(update_fields=['channel_name'])

            logger.info(f"Processing {len(programmes)} programme(s) for channel '{channel.channel_name}'.")
            # For each programme, update or create a ProgramData record
            with transaction.atomic():
                for prog in programmes:
                    obj, created = ProgramData.objects.update_or_create(
                        epg=epg_data,
                        start_time=prog['start_time'],
                        title=prog['title'],
                        defaults={
                            'end_time': prog['end_time'],
                            'description': prog['description'],
                            'sub_title': '',
                            'tvg_id': tvg_id,
                        }
                    )
                    if created:
                        logger.info(f"Created ProgramData '{prog['title']}' for channel '{channel.channel_name}'.")
                    else:
                        logger.info(f"Updated ProgramData '{prog['title']}' for channel '{channel.channel_name}'.")
    except Exception as e:
        logger.error(f"Error fetching XMLTV from {source.name}: {e}", exc_info=True)

def fetch_schedules_direct(source):
    logger.info(f"Fetching Schedules Direct data from source: {source.name}")
    try:
        # NOTE: You need to provide the correct api_url for Schedules Direct.
        api_url = ''
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {source.api_key}',
        }
        logger.debug(f"Requesting subscriptions from Schedules Direct using URL: {api_url}")
        response = requests.get(api_url, headers=headers, timeout=30)
        response.raise_for_status()
        subscriptions = response.json()
        logger.debug(f"Fetched subscriptions: {subscriptions}")

        for sub in subscriptions:
            channel_tvg_id = sub.get('stationID')
            logger.debug(f"Processing subscription for tvg_id: {channel_tvg_id}")
            schedules_url = f"/schedules/{channel_tvg_id}"
            logger.debug(f"Requesting schedules from URL: {schedules_url}")
            sched_response = requests.get(schedules_url, headers=headers, timeout=30)
            sched_response.raise_for_status()
            schedules = sched_response.json()
            logger.debug(f"Fetched schedules: {schedules}")

            try:
                channel = Channel.objects.get(tvg_id=channel_tvg_id)
                logger.debug(f"Found Channel: {channel}")
            except Channel.DoesNotExist:
                logger.warning(f"No channel found for tvg_id '{channel_tvg_id}'. Skipping subscription.")
                continue

            # Get or create the EPGData record for the channel
            epg_data, created = EPGData.objects.get_or_create(
                channel=channel,
                defaults={'channel_name': channel.channel_name}
            )
            if not created and epg_data.channel_name != channel.channel_name:
                epg_data.channel_name = channel.channel_name
                epg_data.save(update_fields=['channel_name'])

            for sched in schedules.get('schedules', []):
                title = sched.get('title', 'No Title')
                desc = sched.get('description', '')
                start_time = parse_schedules_direct_time(sched.get('startTime'))
                end_time = parse_schedules_direct_time(sched.get('endTime'))
                obj, created = ProgramData.objects.update_or_create(
                    epg=epg_data,
                    start_time=start_time,
                    title=title,
                    defaults={
                        'end_time': end_time,
                        'description': desc,
                        'sub_title': ''
                    }
                )
                if created:
                    logger.info(f"Created ProgramData '{title}' for channel '{channel.channel_name}'.")
                else:
                    logger.info(f"Updated ProgramData '{title}' for channel '{channel.channel_name}'.")
    except Exception as e:
        logger.error(f"Error fetching Schedules Direct data from {source.name}: {e}", exc_info=True)

def parse_xmltv_time(time_str):
    try:
        dt_obj = datetime.strptime(time_str[:14], '%Y%m%d%H%M%S')
        tz_sign = time_str[15]
        tz_hours = int(time_str[16:18])
        tz_minutes = int(time_str[18:20])
        if tz_sign == '+':
            dt_obj = dt_obj - timedelta(hours=tz_hours, minutes=tz_minutes)
        elif tz_sign == '-':
            dt_obj = dt_obj + timedelta(hours=tz_hours, minutes=tz_minutes)
        # Make the datetime aware with UTC using the imported dt_timezone
        aware_dt = timezone.make_aware(dt_obj, timezone=dt_timezone.utc)
        logger.debug(f"Parsed XMLTV time '{time_str}' to {aware_dt}")
        return aware_dt
    except Exception as e:
        logger.error(f"Error parsing XMLTV time '{time_str}': {e}", exc_info=True)
        raise

def parse_schedules_direct_time(time_str):
    try:
        dt_obj = datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%SZ')
        aware_dt = timezone.make_aware(dt_obj, timezone=dt_timezone.utc)
        logger.debug(f"Parsed Schedules Direct time '{time_str}' to {aware_dt}")
        return aware_dt
    except Exception as e:
        logger.error(f"Error parsing Schedules Direct time '{time_str}': {e}", exc_info=True)
        raise
