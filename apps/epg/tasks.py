# apps/epg/tasks.py

import logging
import gzip
import os
import uuid
import requests
import xml.etree.ElementTree as ET
import time  # Add import for tracking download progress
from datetime import datetime, timedelta, timezone as dt_timezone

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from apps.channels.models import Channel
from core.models import UserAgent, CoreSettings

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import EPGSource, EPGData, ProgramData
from core.utils import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


def send_epg_update(source_id, action, progress, **kwargs):
    """Send WebSocket update about EPG download/parsing progress"""
    # Start with the base data dictionary
    data = {
        "progress": progress,
        "type": "epg_refresh",
        "source": source_id,
        "action": action,
    }

    # Add the additional key-value pairs from kwargs
    data.update(kwargs)

    # Now, send the updated data dictionary
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'updates',
        {
            'type': 'update',
            'data': data
        }
    )


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

    try:
        source = EPGSource.objects.get(id=source_id)
        if not source.is_active:
            logger.info(f"EPG source {source_id} is not active. Skipping.")
            return

        logger.info(f"Processing EPGSource: {source.name} (type: {source.source_type})")
        if source.source_type == 'xmltv':
            fetch_success = fetch_xmltv(source)
            if not fetch_success:
                logger.error(f"Failed to fetch XMLTV for source {source.name}")
                release_task_lock('refresh_epg_data', source_id)
                return

            parse_channels_success = parse_channels_only(source)
            if not parse_channels_success:
                logger.error(f"Failed to parse channels for source {source.name}")
                release_task_lock('refresh_epg_data', source_id)
                return

            parse_programs_for_source(source)

        elif source.source_type == 'schedules_direct':
            fetch_schedules_direct(source)

        source.save(update_fields=['updated_at'])
    except Exception as e:
        logger.error(f"Error in refresh_epg_data for source {source_id}: {e}", exc_info=True)
        try:
            source = EPGSource.objects.get(id=source_id)
            source.status = 'error'
            source.last_message = f"Error refreshing EPG data: {str(e)}"
            source.save(update_fields=['status', 'last_message'])
            send_epg_update(source_id, "refresh", 100, status="error", error=str(e))
        except Exception as inner_e:
            logger.error(f"Error updating source status: {inner_e}")
    finally:
        release_task_lock('refresh_epg_data', source_id)


def fetch_xmltv(source):
    # Handle cases with local file but no URL
    if not source.url and source.file_path and os.path.exists(source.file_path):
        logger.info(f"Using existing local file for EPG source: {source.name} at {source.file_path}")

        # Set the status to success in the database
        source.status = 'success'
        source.save(update_fields=['status'])

        # Send a download complete notification
        send_epg_update(source.id, "downloading", 100, status="success")

        # Return True to indicate successful fetch, processing will continue with parse_channels_only
        return True

    # Handle cases where no URL is provided and no valid file path exists
    if not source.url:
        # Update source status for missing URL
        source.status = 'error'
        source.last_message = "No URL provided and no valid local file exists"
        source.save(update_fields=['status', 'last_message'])
        send_epg_update(source.id, "downloading", 100, status="error", error="No URL provided and no valid local file exists")
        return False

    if os.path.exists(source.get_cache_file()):
        os.remove(source.get_cache_file())

    logger.info(f"Fetching XMLTV data from source: {source.name}")
    try:
        # Get default user agent from settings
        default_user_agent_setting = CoreSettings.objects.filter(key='default-user-agent').first()
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"  # Fallback default
        if default_user_agent_setting and default_user_agent_setting.value:
            try:
                user_agent_obj = UserAgent.objects.filter(id=int(default_user_agent_setting.value)).first()
                if user_agent_obj and user_agent_obj.user_agent:
                    user_agent = user_agent_obj.user_agent
                    logger.debug(f"Using default user agent: {user_agent}")
            except (ValueError, Exception) as e:
                logger.warning(f"Error retrieving default user agent, using fallback: {e}")

        headers = {
            'User-Agent': user_agent
        }

        # Update status to fetching before starting download
        source.status = 'fetching'
        source.save(update_fields=['status'])

        # Send initial download notification
        send_epg_update(source.id, "downloading", 0)

        # Use streaming response to track download progress
        with requests.get(source.url, headers=headers, stream=True, timeout=30) as response:
            # Handle 404 specifically
            if response.status_code == 404:
                logger.error(f"EPG URL not found (404): {source.url}")
                # Update status to error in the database
                source.status = 'error'
                source.last_message = f"EPG source '{source.name}' returned 404 error - will retry on next scheduled run"
                source.save(update_fields=['status', 'last_message'])

                # Notify users through the WebSocket about the EPG fetch failure
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    'updates',
                    {
                        'type': 'update',
                        'data': {
                            "success": False,
                            "type": "epg_fetch_error",
                            "source_id": source.id,
                            "source_name": source.name,
                            "error_code": 404,
                            "message": f"EPG source '{source.name}' returned 404 error - will retry on next scheduled run"
                        }
                    }
                )
                # Ensure we update the download progress to 100 with error status
                send_epg_update(source.id, "downloading", 100, status="error", error="URL not found (404)")
                return False

            # For all other error status codes
            if response.status_code >= 400:
                error_message = f"HTTP error {response.status_code}"
                user_message = f"EPG source '{source.name}' encountered HTTP error {response.status_code}"

                # Update status to error in the database
                source.status = 'error'
                source.last_message = user_message
                source.save(update_fields=['status', 'last_message'])

                # Notify users through the WebSocket
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    'updates',
                    {
                        'type': 'update',
                        'data': {
                            "success": False,
                            "type": "epg_fetch_error",
                            "source_id": source.id,
                            "source_name": source.name,
                            "error_code": response.status_code,
                            "message": user_message
                        }
                    }
                )
                # Update download progress
                send_epg_update(source.id, "downloading", 100, status="error", error=user_message)
                return False

            response.raise_for_status()
            logger.debug("XMLTV data fetched successfully.")

            cache_file = source.get_cache_file()

            # Check if we have content length for progress tracking
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            start_time = time.time()
            last_update_time = start_time

            with open(cache_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

                        downloaded += len(chunk)
                        elapsed_time = time.time() - start_time

                        # Calculate download speed in KB/s
                        speed = downloaded / elapsed_time / 1024 if elapsed_time > 0 else 0

                        # Calculate progress percentage
                        if total_size and total_size > 0:
                            progress = min(100, int((downloaded / total_size) * 100))
                        else:
                            # If no content length header, estimate progress
                            progress = min(95, int((downloaded / (10 * 1024 * 1024)) * 100))  # Assume 10MB if unknown

                        # Time remaining (in seconds)
                        time_remaining = (total_size - downloaded) / (speed * 1024) if speed > 0 and total_size > 0 else 0

                        # Only send updates every 0.5 seconds to avoid flooding
                        current_time = time.time()
                        if current_time - last_update_time >= 0.5 and progress > 0:
                            last_update_time = current_time
                            send_epg_update(
                                source.id,
                                "downloading",
                                progress,
                                speed=speed,
                                elapsed_time=elapsed_time,
                                time_remaining=time_remaining
                            )

            # Send completion notification
            send_epg_update(source.id, "downloading", 100)

            # Update status to parsing
            source.status = 'parsing'
            source.save(update_fields=['status'])

            logger.info(f"Cached EPG file saved to {cache_file}")
            return True

    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP Error fetching XMLTV from {source.name}: {e}", exc_info=True)

        # Get error details
        status_code = e.response.status_code if hasattr(e, 'response') and e.response else 'unknown'
        error_message = str(e)

        # Create a user-friendly message
        user_message = f"EPG source '{source.name}' encountered HTTP error {status_code}"

        # Add specific handling for common HTTP errors
        if status_code == 404:
            user_message = f"EPG source '{source.name}' URL not found (404) - will retry on next scheduled run"
        elif status_code == 401 or status_code == 403:
            user_message = f"EPG source '{source.name}' access denied (HTTP {status_code}) - check credentials"
        elif status_code == 429:
            user_message = f"EPG source '{source.name}' rate limited (429) - try again later"
        elif status_code >= 500:
            user_message = f"EPG source '{source.name}' server error (HTTP {status_code}) - will retry later"

        # Update source status to error with the error message
        source.status = 'error'
        source.last_message = user_message
        source.save(update_fields=['status', 'last_message'])

        # Notify users through the WebSocket about the EPG fetch failure
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                'data': {
                    "success": False,
                    "type": "epg_fetch_error",
                    "source_id": source.id,
                    "source_name": source.name,
                    "error_code": status_code,
                    "message": user_message,
                    "details": error_message
                }
            }
        )

        # Ensure we update the download progress to 100 with error status
        send_epg_update(source.id, "downloading", 100, status="error", error=user_message)
        return False
    except requests.exceptions.ConnectionError as e:
        # Handle connection errors separately
        error_message = str(e)
        user_message = f"Connection error: Unable to connect to EPG source '{source.name}'"
        logger.error(f"Connection error fetching XMLTV from {source.name}: {e}", exc_info=True)

        # Update source status
        source.status = 'error'
        source.last_message = user_message
        source.save(update_fields=['status', 'last_message'])

        # Send notifications
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                'data': {
                    "success": False,
                    "type": "epg_fetch_error",
                    "source_id": source.id,
                    "source_name": source.name,
                    "error_code": "connection_error",
                    "message": user_message
                }
            }
        )
        send_epg_update(source.id, "downloading", 100, status="error", error=user_message)
        return False
    except Exception as e:
        error_message = str(e)
        logger.error(f"Error fetching XMLTV from {source.name}: {e}", exc_info=True)

        # Update source status for general exceptions too
        source.status = 'error'
        source.last_message = f"Error: {error_message}"
        source.save(update_fields=['status', 'last_message'])

        # Ensure we update the download progress to 100 with error status
        send_epg_update(source.id, "downloading", 100, status="error", error=f"Error: {error_message}")
        return False


def parse_channels_only(source):
    file_path = source.file_path
    if not file_path:
        file_path = source.get_cache_file()

    # Send initial parsing notification
    send_epg_update(source.id, "parsing_channels", 0)

    try:
        # Check if the file exists
        if not os.path.exists(file_path):
            logger.error(f"EPG file does not exist at path: {file_path}")

            # Update the source's file_path to the default cache location
            new_path = source.get_cache_file()
            logger.info(f"Updating file_path from '{file_path}' to '{new_path}'")
            source.file_path = new_path
            source.save(update_fields=['file_path'])

            # If the source has a URL, fetch the data before continuing
            if source.url:
                logger.info(f"Fetching new EPG data from URL: {source.url}")
                fetch_success = fetch_xmltv(source)  # Store the result

                # Only proceed if fetch was successful AND file exists
                if not fetch_success:
                    logger.error(f"Failed to fetch EPG data from URL: {source.url}")
                    # Update status to error
                    source.status = 'error'
                    source.last_message = f"Failed to fetch EPG data from URL"
                    source.save(update_fields=['status', 'last_message'])
                    # Send error notification
                    send_epg_update(source.id, "parsing_channels", 100, status="error", error="Failed to fetch EPG data")
                    return False

                # Verify the file was downloaded successfully
                if not os.path.exists(new_path):
                    logger.error(f"Failed to fetch EPG data, file still missing at: {new_path}")
                    # Update status to error
                    source.status = 'error'
                    source.last_message = f"Failed to fetch EPG data, file missing after download"
                    source.save(update_fields=['status', 'last_message'])
                    send_epg_update(source.id, "parsing_channels", 100, status="error", error="File not found after download")
                    return False
            else:
                logger.error(f"No URL provided for EPG source {source.name}, cannot fetch new data")
                # Update status to error
                source.status = 'error'
                source.last_message = f"No URL provided, cannot fetch EPG data"
                source.save(update_fields=['status', 'last_message'])
                send_epg_update(source.id, "parsing_channels", 100, status="error", error="No URL provided")
                return False

            file_path = new_path

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

        # Update progress to show file read completed
        send_epg_update(source.id, "parsing_channels", 25)

        root = ET.fromstring(xml_data)
        channels = root.findall('channel')

        epgs_to_create = []
        epgs_to_update = []

        logger.info(f"Found {len(channels)} <channel> entries in {file_path}")

        # Update progress to show parsing started
        send_epg_update(source.id, "parsing_channels", 50)

        total_channels = len(channels)
        for i, channel_elem in enumerate(channels):
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

            # Send occasional progress updates
            if i % 100 == 0 or i == total_channels - 1:
                progress = 50 + int((i / total_channels) * 40)  # Scale to 50-90% range
                send_epg_update(source.id, "parsing_channels", progress)

        # Update progress before database operations
        send_epg_update(source.id, "parsing_channels", 90)

        if epgs_to_create:
            EPGData.objects.bulk_create(epgs_to_create, ignore_conflicts=True)

        if epgs_to_update:
            EPGData.objects.bulk_update(epgs_to_update, ["name"])

        # Send completion notification
        send_epg_update(source.id, "parsing_channels", 100, status="success")

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                "data": {"success": True, "type": "epg_channels"}
            }
        )

        logger.info("Finished parsing channel info.")
        return True

    except FileNotFoundError:
        logger.error(f"EPG file not found at: {file_path}")
        # Update status to error
        source.status = 'error'
        source.last_message = f"EPG file not found: {file_path}"
        source.save(update_fields=['status', 'last_message'])
        send_epg_update(source.id, "parsing_channels", 100, status="error", error="File not found")
        return False
    except Exception as e:
        logger.error(f"Error reading EPG file {file_path}: {e}", exc_info=True)
        # Update status to error
        source.status = 'error'
        source.last_message = f"Error parsing EPG file: {str(e)}"
        source.save(update_fields=['status', 'last_message'])
        send_epg_update(source.id, "parsing_channels", 100, status="error", error=str(e))
        return False


@shared_task
def parse_programs_for_tvg_id(epg_id):
    if not acquire_task_lock('parse_epg_programs', epg_id):
        logger.info(f"Program parse for {epg_id} already in progress, skipping duplicate task")
        return "Task already running"

    epg = EPGData.objects.get(id=epg_id)
    epg_source = epg.epg_source

    if not Channel.objects.filter(epg_data=epg).exists():
        logger.info(f"No channels matched to EPG {epg.tvg_id}")
        release_task_lock('parse_epg_programs', epg_id)
        return

    logger.info(f"Refreshing program data for tvg_id: {epg.tvg_id}")

    # First, remove all existing programs
    ProgramData.objects.filter(epg=epg).delete()

    file_path = epg_source.file_path
    if not file_path:
        file_path = epg_source.get_cache_file()

    # Check if the file exists
    if not os.path.exists(file_path):
        logger.error(f"EPG file not found at: {file_path}")

        # Update the file path in the database
        new_path = epg_source.get_cache_file()
        logger.info(f"Updating file_path from '{file_path}' to '{new_path}'")
        epg_source.file_path = new_path
        epg_source.save(update_fields=['file_path'])

        # Fetch new data before continuing
        if epg_source.url:
            logger.info(f"Fetching new EPG data from URL: {epg_source.url}")
            # Properly check the return value from fetch_xmltv
            fetch_success = fetch_xmltv(epg_source)

            # If fetch was not successful or the file still doesn't exist, abort
            if not fetch_success:
                logger.error(f"Failed to fetch EPG data, cannot parse programs for tvg_id: {epg.tvg_id}")
                # Update status to error if not already set
                epg_source.status = 'error'
                epg_source.last_message = f"Failed to download EPG data, cannot parse programs"
                epg_source.save(update_fields=['status', 'last_message'])
                send_epg_update(epg_source.id, "parsing_programs", 100, status="error", error="Failed to download EPG file")
                release_task_lock('parse_epg_programs', epg_id)
                return

            # Also check if the file exists after download
            if not os.path.exists(new_path):
                logger.error(f"Failed to fetch EPG data, file still missing at: {new_path}")
                epg_source.status = 'error'
                epg_source.last_message = f"Failed to download EPG data, file missing after download"
                epg_source.save(update_fields=['status', 'last_message'])
                send_epg_update(epg_source.id, "parsing_programs", 100, status="error", error="File not found after download")
                release_task_lock('parse_epg_programs', epg_id)
                return
        else:
            logger.error(f"No URL provided for EPG source {epg_source.name}, cannot fetch new data")
            # Update status to error
            epg_source.status = 'error'
            epg_source.last_message = f"No URL provided, cannot fetch EPG data"
            epg_source.save(update_fields=['status', 'last_message'])
            send_epg_update(epg_source.id, "parsing_programs", 100, status="error", error="No URL provided")
            release_task_lock('parse_epg_programs', epg_id)
            return

        file_path = new_path

    # Read entire file (decompress if .gz)
    try:
        if file_path.endswith('.gz'):
            with open(file_path, 'rb') as gz_file:
                decompressed = gzip.decompress(gz_file.read())
                xml_data = decompressed.decode('utf-8')
        else:
            with open(file_path, 'r', encoding='utf-8') as xml_file:
                xml_data = xml_file.read()
    except FileNotFoundError:
        logger.error(f"EPG file not found at: {file_path}")
        release_task_lock('parse_epg_programs', epg_id)
        return
    except Exception as e:
        logger.error(f"Error reading EPG file {file_path}: {e}", exc_info=True)
        release_task_lock('parse_epg_programs', epg_id)
        return

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
    # Send initial programs parsing notification
    send_epg_update(epg_source.id, "parsing_programs", 0)

    try:
        epg_entries = EPGData.objects.filter(epg_source=epg_source)
        total_entries = epg_entries.count()
        processed = 0

        if total_entries == 0:
            logger.info(f"No EPG entries found for source: {epg_source.name}")
            # Update status - this is not an error, just no entries
            epg_source.status = 'success'
            epg_source.save(update_fields=['status'])
            send_epg_update(epg_source.id, "parsing_programs", 100, status="success")
            return True

        logger.info(f"Parsing programs for {total_entries} EPG entries from source: {epg_source.name}")

        failed_entries = []
        program_count = 0
        channel_count = 0
        updated_count = 0

        for epg in epg_entries:
            if epg.tvg_id:
                try:
                    result = parse_programs_for_tvg_id(epg.id)
                    if result == "Task already running":
                        logger.info(f"Program parse for {epg.id} already in progress, skipping")

                    processed += 1
                    progress = min(95, int((processed / total_entries) * 100)) if total_entries > 0 else 50
                    send_epg_update(epg_source.id, "parsing_programs", progress)
                except Exception as e:
                    logger.error(f"Error parsing programs for tvg_id={epg.tvg_id}: {e}", exc_info=True)
                    failed_entries.append(f"{epg.tvg_id}: {str(e)}")

        # If there were failures, include them in the message but continue
        if failed_entries:
            epg_source.status = EPGSource.STATUS_SUCCESS  # Still mark as success if some processed
            error_summary = f"Failed to parse {len(failed_entries)} of {total_entries} entries"
            stats_summary = f"Processed {program_count} programs across {channel_count} channels. Updated: {updated_count}."
            epg_source.last_message = f"{stats_summary} Warning: {error_summary}"
            epg_source.updated_at = timezone.now()
            epg_source.save(update_fields=['status', 'last_message', 'updated_at'])

            # Send completion notification with mixed status
            send_epg_update(epg_source.id, "parsing_programs", 100,
                          status="success",
                          message=epg_source.last_message)
            return True

        # If all successful, set a comprehensive success message
        epg_source.status = EPGSource.STATUS_SUCCESS
        epg_source.last_message = f"Successfully processed {program_count} programs across {channel_count} channels. Updated: {updated_count}."
        epg_source.updated_at = timezone.now()
        epg_source.save(update_fields=['status', 'last_message', 'updated_at'])

        # Send completion notification with status
        send_epg_update(epg_source.id, "parsing_programs", 100,
                      status="success",
                      message=epg_source.last_message)

        logger.info(f"Completed parsing all programs for source: {epg_source.name}")
        return True

    except Exception as e:
        logger.error(f"Error in parse_programs_for_source: {e}", exc_info=True)
        # Update status to error
        epg_source.status = EPGSource.STATUS_ERROR
        epg_source.last_message = f"Error parsing programs: {str(e)}"
        epg_source.save(update_fields=['status', 'last_message'])
        send_epg_update(epg_source.id, "parsing_programs", 100,
                      status="error",
                      message=epg_source.last_message)
        return False


def fetch_schedules_direct(source):
    logger.info(f"Fetching Schedules Direct data from source: {source.name}")
    try:
        # Get default user agent from settings
        default_user_agent_setting = CoreSettings.objects.filter(key='default-user-agent').first()
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"  # Fallback default

        if default_user_agent_setting and default_user_agent_setting.value:
            try:
                user_agent_obj = UserAgent.objects.filter(id=int(default_user_agent_setting.value)).first()
                if user_agent_obj and user_agent_obj.user_agent:
                    user_agent = user_agent_obj.user_agent
                    logger.debug(f"Using default user agent: {user_agent}")
            except (ValueError, Exception) as e:
                logger.warning(f"Error retrieving default user agent, using fallback: {e}")

        api_url = ''
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {source.api_key}',
            'User-Agent': user_agent
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
