# apps/epg/tasks.py

import logging
import gzip
import os
import uuid
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone as dt_timezone

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from apps.channels.models import Channel

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import EPGSource, EPGData, ProgramData
from core.utils import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task
def refresh_all_epg_data():
    logger.info("Starting refresh_epg_data task.")
    active_sources = EPGSource.objects.filter(is_active=True)
    logger.debug(f"Found {active_sources.count()} active EPGSource(s).")

    for source in active_sources:
        refresh_epg_data(source.id)

    logger.info("Finished refresh_epg_data task.")
    return "EPG data refreshed."

@shared_task
def refresh_epg_data(source_id):
    if not acquire_task_lock('refresh_epg_data', source_id):
        logger.debug(f"EPG refresh for {source_id} already running")
        return

    source = EPGSource.objects.get(id=source_id)
    logger.info(f"Processing EPGSource: {source.name} (type: {source.source_type})")
    if source.source_type == 'xmltv':
        fetch_xmltv(source)
        parse_channels_only(source)
        parse_programs_for_source(source)
    elif source.source_type == 'schedules_direct':
        fetch_schedules_direct(source)

    release_task_lock('refresh_epg_data', source_id)

def fetch_xmltv(source):
    logger.info(f"Fetching XMLTV data from source: {source.name}")
    try:
        response = requests.get(source.url, timeout=30)
        response.raise_for_status()
        logger.debug("XMLTV data fetched successfully.")

        # Decide on file extension
        file_ext = ".gz" if source.url.lower().endswith('.gz') else ".xml"
        filename = f"{source.name}_{uuid.uuid4().hex[:8]}{file_ext}"

        # Build full path in MEDIA_ROOT/cached_epg
        epg_dir = os.path.join(settings.MEDIA_ROOT, "cached_epg")
        os.makedirs(epg_dir, exist_ok=True)
        file_path = os.path.join(epg_dir, filename)

        # Save raw data
        with open(file_path, 'wb') as f:
            f.write(response.content)
        logger.info(f"Cached EPG file saved to {file_path}")

        # Save the file_path on the EPGSource instance so it can be retrieved later.
        source.file_path = file_path
        source.save(update_fields=['file_path'])

    except Exception as e:
        logger.error(f"Error fetching XMLTV from {source.name}: {e}", exc_info=True)


def parse_channels_only(source):
    file_path = source.file_path
    logger.info(f"Parsing channels from EPG file: {file_path}")
    existing_epgs = {e.tvg_id: e for e in EPGData.objects.filter(epg_source=source)}

    # Read entire file (decompress if .gz)
    if file_path.endswith('.gz'):
        with open(file_path, 'rb') as gz_file:
            decompressed = gzip.decompress(gz_file.read())
            xml_data = decompressed.decode('utf-8')
    else:
        with open(file_path, 'r', encoding='utf-8') as xml_file:
            xml_data = xml_file.read()

    root = ET.fromstring(xml_data)
    channels = root.findall('channel')

    epgs_to_create = []
    epgs_to_update = []

    logger.info(f"Found {len(channels)} <channel> entries in {file_path}")
    for channel_elem in channels:
        tvg_id = channel_elem.get('id', '').strip()
        if not tvg_id:
            continue  # skip blank/invalid IDs

        display_name = channel_elem.findtext('display-name', default=tvg_id).strip()

        if tvg_id in existing_epgs:
            epg_obj = existing_epgs[tvg_id]
            if epg_obj.name != display_name:
                epg_obj.name = display_name
                epgs_to_update.append(epg_obj)
        else:
            epgs_to_create.append(EPGData(
                tvg_id=tvg_id,
                name=display_name,
                epg_source=source,
            ))

    if epgs_to_create:
        EPGData.objects.bulk_create(epgs_to_create, ignore_conflicts=True)
    if epgs_to_update:
        EPGData.objects.bulk_update(epgs_to_update, ["name"])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'updates',
        {
            'type': 'update',
            "data": {"success": True, "type": "epg_channels"}
        }
    )

    logger.info("Finished parsing channel info.")

@shared_task
def parse_programs_for_tvg_id(epg_id):
    if not acquire_task_lock('parse_epg_programs', epg_id):
        logger.debug(f"Program parse for {epg_id} already in progress")
        return

    epg = EPGData.objects.get(id=epg_id)
    epg_source = epg.epg_source

    if not Channel.objects.filter(epg_data=epg).exists():
        logger.info(f"No channels matched to EPG {epg.tvg_id}")
        release_task_lock('parse_epg_programs', epg_id)
        return

    logger.info(f"Refreshing program data for tvg_id: {epg.tvg_id}")

    # First, remove all existing programs
    ProgramData.objects.filter(epg=epg).delete()

    # Read entire file (decompress if .gz)
    if epg_source.file_path.endswith('.gz'):
        with open(epg_source.file_path, 'rb') as gz_file:
            decompressed = gzip.decompress(gz_file.read())
            xml_data = decompressed.decode('utf-8')
    else:
        with open(epg_source.file_path, 'r', encoding='utf-8') as xml_file:
            xml_data = xml_file.read()

    root = ET.fromstring(xml_data)

    # Find only <programme> elements for this tvg_id
    matched_programmes = [p for p in root.findall('programme') if p.get('channel') == epg.tvg_id]
    logger.debug(f"Found {len(matched_programmes)} programmes for tvg_id={epg.tvg_id}")

    programs_to_create = []
    for prog in matched_programmes:
        start_time = parse_xmltv_time(prog.get('start'))
        end_time = parse_xmltv_time(prog.get('stop'))
        title = prog.findtext('title', default='No Title')
        desc = prog.findtext('desc', default='')
        sub_title = prog.findtext('sub-title', default='')

        # Extract custom properties
        custom_props = {}

        # Extract categories
        categories = []
        for cat_elem in prog.findall('category'):
            if cat_elem.text and cat_elem.text.strip():
                categories.append(cat_elem.text.strip())
        if categories:
            custom_props['categories'] = categories

        # Extract episode numbers
        for ep_num in prog.findall('episode-num'):
            system = ep_num.get('system', '')
            if system == 'xmltv_ns' and ep_num.text:
                # Parse XMLTV episode-num format (season.episode.part)
                parts = ep_num.text.split('.')
                if len(parts) >= 2:
                    if parts[0].strip() != '':
                        try:
                            season = int(parts[0]) + 1  # XMLTV format is zero-based
                            custom_props['season'] = season
                        except ValueError:
                            pass
                    if parts[1].strip() != '':
                        try:
                            episode = int(parts[1]) + 1  # XMLTV format is zero-based
                            custom_props['episode'] = episode
                        except ValueError:
                            pass
            elif system == 'onscreen' and ep_num.text:
                # Just store the raw onscreen format
                custom_props['onscreen_episode'] = ep_num.text.strip()

        # Extract ratings
        for rating_elem in prog.findall('rating'):
            if rating_elem.findtext('value'):
                custom_props['rating'] = rating_elem.findtext('value').strip()
                if rating_elem.get('system'):
                    custom_props['rating_system'] = rating_elem.get('system')
                break  # Just use the first rating

        # Extract credits (actors, directors, etc.)
        credits_elem = prog.find('credits')
        if credits_elem is not None:
            credits = {}
            for credit_type in ['director', 'actor', 'writer', 'presenter', 'producer']:
                elements = credits_elem.findall(credit_type)
                if elements:
                    names = [e.text.strip() for e in elements if e.text and e.text.strip()]
                    if names:
                        credits[credit_type] = names
            if credits:
                custom_props['credits'] = credits

        # Extract other common program metadata
        if prog.findtext('date'):
            custom_props['year'] = prog.findtext('date').strip()[:4]  # Just the year part

        if prog.findtext('country'):
            custom_props['country'] = prog.findtext('country').strip()

        for icon_elem in prog.findall('icon'):
            if icon_elem.get('src'):
                custom_props['icon'] = icon_elem.get('src')
                break  # Just use the first icon

        for kw in ['previously-shown', 'premiere', 'new']:
            if prog.find(kw) is not None:
                custom_props[kw.replace('-', '_')] = True

        # Convert custom_props to JSON string if not empty
        custom_properties_json = None
        if custom_props:
            import json
            try:
                custom_properties_json = json.dumps(custom_props)
            except Exception as e:
                logger.error(f"Error serializing custom properties to JSON: {e}", exc_info=True)

        programs_to_create.append(ProgramData(
            epg=epg,
            start_time=start_time,
            end_time=end_time,
            title=title,
            description=desc,
            sub_title=sub_title,
            tvg_id=epg.tvg_id,
            custom_properties=custom_properties_json
        ))

    ProgramData.objects.bulk_create(programs_to_create)

    release_task_lock('parse_epg_programs', epg_id)

    logger.info(f"Completed program parsing for tvg_id={epg.tvg_id}.")

def parse_programs_for_source(epg_source, tvg_id=None):
    file_path = epg_source.file_path
    epg_entries = EPGData.objects.filter(epg_source=epg_source)
    for epg in epg_entries:
        if epg.tvg_id:
            parse_programs_for_tvg_id(epg.id)

def fetch_schedules_direct(source):
    logger.info(f"Fetching Schedules Direct data from source: {source.name}")
    try:
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
            tvg_id = sub.get('stationID')
            logger.debug(f"Processing subscription for tvg_id: {tvg_id}")
            schedules_url = f"/schedules/{tvg_id}"
            logger.debug(f"Requesting schedules from URL: {schedules_url}")
            sched_response = requests.get(schedules_url, headers=headers, timeout=30)
            sched_response.raise_for_status()
            schedules = sched_response.json()
            logger.debug(f"Fetched schedules: {schedules}")

            epg_data, created = EPGData.objects.get_or_create(
                tvg_id=tvg_id,
                defaults={'name': tvg_id}
            )
            if created:
                logger.info(f"Created new EPGData for tvg_id '{tvg_id}'.")
            else:
                logger.debug(f"Found existing EPGData for tvg_id '{tvg_id}'.")

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
                    logger.info(f"Created ProgramData '{title}' for tvg_id '{tvg_id}'.")
                else:
                    logger.info(f"Updated ProgramData '{title}' for tvg_id '{tvg_id}'.")
    except Exception as e:
        logger.error(f"Error fetching Schedules Direct data from {source.name}: {e}", exc_info=True)


# -------------------------------
# Helper parse functions
# -------------------------------
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
