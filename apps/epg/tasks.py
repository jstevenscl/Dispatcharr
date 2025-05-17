# apps/epg/tasks.py

import logging
import gzip
import os
import uuid
import requests
import time  # Add import for tracking download progress
from datetime import datetime, timedelta, timezone as dt_timezone
import gc  # Add garbage collection module
import json
from lxml import etree  # Using lxml exclusively

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
    try:
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                'data': data
            }
        )
    except Exception as e:
        logger.warning(f"Failed to send WebSocket update: {e}")


def delete_epg_refresh_task_by_id(epg_id):
    """
    Delete the periodic task associated with an EPG source ID.
    Can be called directly or from the post_delete signal.
    Returns True if a task was found and deleted, False otherwise.
    """
    try:
        task = None
        task_name = f"epg_source-refresh-{epg_id}"

        # Look for task by name
        try:
            from django_celery_beat.models import PeriodicTask, IntervalSchedule
            task = PeriodicTask.objects.get(name=task_name)
            logger.info(f"Found task by name: {task.id} for EPGSource {epg_id}")
        except PeriodicTask.DoesNotExist:
            logger.warning(f"No PeriodicTask found with name {task_name}")
            return False

        # Now delete the task and its interval
        if task:
            # Store interval info before deleting the task
            interval_id = None
            if hasattr(task, 'interval') and task.interval:
                interval_id = task.interval.id

                # Count how many TOTAL tasks use this interval (including this one)
                tasks_with_same_interval = PeriodicTask.objects.filter(interval_id=interval_id).count()
                logger.info(f"Interval {interval_id} is used by {tasks_with_same_interval} tasks total")

            # Delete the task first
            task_id = task.id
            task.delete()
            logger.info(f"Successfully deleted periodic task {task_id}")

            # Now check if we should delete the interval
            # We only delete if it was the ONLY task using this interval
            if interval_id and tasks_with_same_interval == 1:
                try:
                    interval = IntervalSchedule.objects.get(id=interval_id)
                    logger.info(f"Deleting interval schedule {interval_id} (not shared with other tasks)")
                    interval.delete()
                    logger.info(f"Successfully deleted interval {interval_id}")
                except IntervalSchedule.DoesNotExist:
                    logger.warning(f"Interval {interval_id} no longer exists")
            elif interval_id:
                logger.info(f"Not deleting interval {interval_id} as it's shared with {tasks_with_same_interval-1} other tasks")

            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting periodic task for EPGSource {epg_id}: {str(e)}", exc_info=True)
        return False


@shared_task
def refresh_all_epg_data():
    logger.info("Starting refresh_epg_data task.")
    active_sources = EPGSource.objects.filter(is_active=True)
    logger.debug(f"Found {active_sources.count()} active EPGSource(s).")

    for source in active_sources:
        refresh_epg_data(source.id)
        # Force garbage collection between sources
        gc.collect()

    logger.info("Finished refresh_epg_data task.")
    return "EPG data refreshed."


@shared_task
def refresh_epg_data(source_id):
    if not acquire_task_lock('refresh_epg_data', source_id):
        logger.debug(f"EPG refresh for {source_id} already running")
        return

    source = None
    try:
        # Try to get the EPG source
        try:
            source = EPGSource.objects.get(id=source_id)
        except EPGSource.DoesNotExist:
            # The EPG source doesn't exist, so delete the periodic task if it exists
            logger.warning(f"EPG source with ID {source_id} not found, but task was triggered. Cleaning up orphaned task.")

            # Call the shared function to delete the task
            if delete_epg_refresh_task_by_id(source_id):
                logger.info(f"Successfully cleaned up orphaned task for EPG source {source_id}")
            else:
                logger.info(f"No orphaned task found for EPG source {source_id}")

            # Release the lock and exit
            release_task_lock('refresh_epg_data', source_id)
            # Force garbage collection before exit
            gc.collect()
            return f"EPG source {source_id} does not exist, task cleaned up"

        # The source exists but is not active, just skip processing
        if not source.is_active:
            logger.info(f"EPG source {source_id} is not active. Skipping.")
            release_task_lock('refresh_epg_data', source_id)
            # Force garbage collection before exit
            gc.collect()
            return

        # Continue with the normal processing...
        logger.info(f"Processing EPGSource: {source.name} (type: {source.source_type})")
        if source.source_type == 'xmltv':
            fetch_success = fetch_xmltv(source)
            if not fetch_success:
                logger.error(f"Failed to fetch XMLTV for source {source.name}")
                release_task_lock('refresh_epg_data', source_id)
                # Force garbage collection before exit
                gc.collect()
                return

            parse_channels_success = parse_channels_only(source)
            if not parse_channels_success:
                logger.error(f"Failed to parse channels for source {source.name}")
                release_task_lock('refresh_epg_data', source_id)
                # Force garbage collection before exit
                gc.collect()
                return

            parse_programs_for_source(source)

        elif source.source_type == 'schedules_direct':
            fetch_schedules_direct(source)

        source.save(update_fields=['updated_at'])
    except Exception as e:
        logger.error(f"Error in refresh_epg_data for source {source_id}: {e}", exc_info=True)
        try:
            if source:
                source.status = 'error'
                source.last_message = f"Error refreshing EPG data: {str(e)}"
                source.save(update_fields=['status', 'last_message'])
                send_epg_update(source_id, "refresh", 100, status="error", error=str(e))
        except Exception as inner_e:
            logger.error(f"Error updating source status: {inner_e}")
    finally:
        # Clear references to ensure proper garbage collection
        source = None
        # Force garbage collection before releasing the lock
        gc.collect()
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

    # Clean up existing cache file
    if os.path.exists(source.get_cache_file()):
        try:
            os.remove(source.get_cache_file())
        except Exception as e:
            logger.warning(f"Failed to remove existing cache file: {e}")

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
        with requests.get(source.url, headers=headers, stream=True, timeout=60) as response:
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
            update_interval = 0.5  # Only update every 0.5 seconds

            with open(cache_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=16384):  # Increased chunk size for better performance
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

                        # Only send updates at specified intervals to avoid flooding
                        current_time = time.time()
                        if current_time - last_update_time >= update_interval and progress > 0:
                            last_update_time = current_time
                            send_epg_update(
                                source.id,
                                "downloading",
                                progress,
                                speed=round(speed, 2),
                                elapsed_time=round(elapsed_time, 1),
                                time_remaining=round(time_remaining, 1),
                                downloaded=f"{downloaded / (1024 * 1024):.2f} MB"
                            )

                        # Explicitly delete the chunk to free memory immediately
                        del chunk

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
    except requests.exceptions.Timeout as e:
        # Handle timeout errors specifically
        error_message = str(e)
        user_message = f"Timeout error: EPG source '{source.name}' took too long to respond"
        logger.error(f"Timeout error fetching XMLTV from {source.name}: {e}", exc_info=True)

        # Update source status
        source.status = 'error'
        source.last_message = user_message
        source.save(update_fields=['status', 'last_message'])

        # Send notifications
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

        # Add memory tracking at start
        import psutil
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024
        logger.info(f"Initial memory usage: {initial_memory:.2f} MB")

        # Replace full dictionary load with more efficient lookup set
        existing_tvg_ids = set()
        existing_epgs = {}  # Initialize the dictionary that will lazily load objects
        last_id = 0
        chunk_size = 5000

        while True:
            tvg_id_chunk = set(EPGData.objects.filter(
                epg_source=source,
                id__gt=last_id
            ).order_by('id').values_list('tvg_id', flat=True)[:chunk_size])

            if not tvg_id_chunk:
                break

            existing_tvg_ids.update(tvg_id_chunk)
            last_id = EPGData.objects.filter(tvg_id__in=tvg_id_chunk).order_by('-id')[0].id
        #time.sleep(20)
        # Update progress to show file read starting
        send_epg_update(source.id, "parsing_channels", 10)

        # Stream parsing instead of loading entire file at once
        is_gzipped = file_path.endswith('.gz')

        epgs_to_create = []
        epgs_to_update = []
        total_channels = 0
        processed_channels = 0
        batch_size = 500  # Process in batches to limit memory usage
        progress = 0  # Initialize progress variable here

        # Track memory at key points
        logger.info(f"Memory before opening file: {process.memory_info().rss / 1024 / 1024:.2f} MB")

        try:
            # Create a parser with the desired options
            #parser = etree.XMLParser(huge_tree=True, remove_blank_text=True)

            # Count channels for progress reporting - use proper lxml approach
            # Open the file first
            logger.info(f"Opening file for initial channel count: {file_path}")
            source_file = gzip.open(file_path, 'rb') if is_gzipped else open(file_path, 'rb')
            logger.info(f"Memory after opening file: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            # Count channels
            try:
                total_channels = EPGData.objects.filter(epg_source=source).count()
                logger.info(f"Found {total_channels} existing channels for this source")
            except Exception as e:
                logger.error(f"Error counting channels: {e}")
                total_channels = 500  # Default estimate

            # Close the file to reset position
            logger.info(f"Closing initial file handle")
            source_file.close()
            logger.info(f"Memory after closing initial file: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            # Update progress after counting
            send_epg_update(source.id, "parsing_channels", 25, total_channels=total_channels)

            # Reset file position for actual processing
            logger.info(f"Re-opening file for channel parsing: {file_path}")
            source_file = gzip.open(file_path, 'rb') if is_gzipped else open(file_path, 'rb')
            logger.info(f"Memory after re-opening file: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            logger.info(f"Creating iterparse context")
            channel_parser = etree.iterparse(source_file, events=('end',), tag='channel')
            logger.info(f"Memory after creating iterparse: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            channel_count = 0
            for _, elem in channel_parser:
                channel_count += 1
                tvg_id = elem.get('id', '').strip()
                if tvg_id:
                    display_name = None
                    for child in elem:
                        if child.tag == 'display-name' and child.text:
                            display_name = child.text.strip()
                            break

                    if not display_name:
                        display_name = tvg_id

                    # Use lazy loading approach to reduce memory usage
                    if tvg_id in existing_tvg_ids:
                        # Only fetch the object if we need to update it and it hasn't been loaded yet
                        if tvg_id not in existing_epgs:
                            try:
                                existing_epgs[tvg_id] = EPGData.objects.get(tvg_id=tvg_id, epg_source=source)
                            except EPGData.DoesNotExist:
                                # Handle race condition where record was deleted
                                existing_tvg_ids.remove(tvg_id)
                                epgs_to_create.append(EPGData(
                                    tvg_id=tvg_id,
                                    name=display_name,
                                    epg_source=source,
                                ))
                                continue

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

                processed_channels += 1

                # Batch processing
                if len(epgs_to_create) >= batch_size:
                    logger.info(f"Bulk creating {len(epgs_to_create)} EPG entries")
                    EPGData.objects.bulk_create(epgs_to_create, ignore_conflicts=True)
                    logger.info(f"Memory after bulk_create: {process.memory_info().rss / 1024 / 1024:.2f} MB")
                    del epgs_to_create  # Explicit deletion
                    epgs_to_create = []
                    gc.collect()
                    logger.info(f"Memory after gc.collect(): {process.memory_info().rss / 1024 / 1024:.2f} MB")

                if len(epgs_to_update) >= batch_size:
                    EPGData.objects.bulk_update(epgs_to_update, ["name"])
                    epgs_to_update = []
                    # Force garbage collection
                    gc.collect()

                # Periodically clear the existing_epgs cache to prevent memory buildup
                if processed_channels % 1000 == 0:
                    logger.info(f"Clearing existing_epgs cache at {processed_channels} channels")
                    existing_epgs.clear()
                    gc.collect()
                    logger.info(f"Memory after clearing cache: {process.memory_info().rss / 1024 / 1024:.2f} MB")

                # Send progress updates
                if processed_channels % 100 == 0 or processed_channels == total_channels:
                    progress = 25 + int((processed_channels / total_channels) * 65) if total_channels > 0 else 90
                    send_epg_update(
                        source.id,
                        "parsing_channels",
                        progress,
                        processed=processed_channels,
                        total=total_channels
                    )
                logger.debug(f"Processed channel: {tvg_id} - {display_name}")
                # Clear memory
                elem.clear()
                while elem.getprevious() is not None:
                    del elem.getparent()[0]

                # Check if we should break early to avoid excessive sleep
                if processed_channels >= total_channels and total_channels > 0:
                    logger.info(f"Breaking channel processing loop - processed {processed_channels}/{total_channels}")
                    break

            # Explicit cleanup before sleeping
            logger.info(f"Completed channel parsing loop, processed {processed_channels} channels")
            logger.info(f"Memory before cleanup: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            # Explicit cleanup of the parser
            del channel_parser
            logger.info(f"Deleted channel_parser object")

            # Close the file
            logger.info(f"Closing file: {file_path}")
            source_file.close()
            logger.info(f"File closed: {file_path}")

            # Force garbage collection
            gc.collect()
            logger.info(f"Memory after final cleanup: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            # Remove long sleep that might be causing issues
            # time.sleep(200)  # This seems excessive and may be causing issues

        except (etree.XMLSyntaxError, Exception) as xml_error:
            logger.error(f"XML parsing failed: {xml_error}")
            # Update status to error
            source.status = 'error'
            source.last_message = f"Error parsing XML file: {str(xml_error)}"
            source.save(update_fields=['status', 'last_message'])
            send_epg_update(source.id, "parsing_channels", 100, status="error", error=str(xml_error))
            return False

        # Process any remaining items
        if epgs_to_create:
            EPGData.objects.bulk_create(epgs_to_create, ignore_conflicts=True)
            logger.info(f"Created final batch of {len(epgs_to_create)} EPG entries")

        if epgs_to_update:
            EPGData.objects.bulk_update(epgs_to_update, ["name"])
            logger.info(f"Updated final batch of {len(epgs_to_update)} EPG entries")

        # Final garbage collection and memory tracking
        logger.info(f"Memory before final gc: {process.memory_info().rss / 1024 / 1024:.2f} MB")
        gc.collect()
        logger.info(f"Memory after final gc: {process.memory_info().rss / 1024 / 1024:.2f} MB")

        # Update source status with channel count
        source.status = 'success'
        source.last_message = f"Successfully parsed {processed_channels} channels"
        source.save(update_fields=['status', 'last_message'])

        # Send completion notification
        send_epg_update(
            source.id,
            "parsing_channels",
            100,
            status="success",
            channels_count=processed_channels
        )

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'updates',
            {
                'type': 'update',
                "data": {"success": True, "type": "epg_channels"}
            }
        )

        logger.info(f"Finished parsing channel info. Found {processed_channels} channels.")
        # Remove excessive sleep
        # time.sleep(20)
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
    finally:
        # Add more detailed cleanup in finally block
        logger.info("In finally block, ensuring cleanup")
        existing_tvg_ids = None
        existing_epgs = None
        gc.collect()
        # Check final memory usage
        try:
            import psutil
            process = psutil.Process()
            final_memory = process.memory_info().rss / 1024 / 1024
            logger.info(f"Final memory usage: {final_memory:.2f} MB")
        except:
            pass


@shared_task
def parse_programs_for_tvg_id(epg_id):
    if not acquire_task_lock('parse_epg_programs', epg_id):
        logger.info(f"Program parse for {epg_id} already in progress, skipping duplicate task")
        return "Task already running"

    source_file = None
    program_parser = None
    programs_to_create = None
    epg = None
    epg_source = None

    try:
        # Add memory tracking
        try:
            import psutil
            process = psutil.Process()
            initial_memory = process.memory_info().rss / 1024 / 1024
            logger.info(f"[parse_programs_for_tvg_id] Initial memory usage: {initial_memory:.2f} MB")
        except ImportError:
            process = None

        epg = EPGData.objects.get(id=epg_id)
        epg_source = epg.epg_source

        if not Channel.objects.filter(epg_data=epg).exists():
            logger.info(f"No channels matched to EPG {epg.tvg_id}")
            release_task_lock('parse_epg_programs', epg_id)
            return

        logger.info(f"Refreshing program data for tvg_id: {epg.tvg_id}")

        # First, remove all existing programs - use chunked delete to avoid memory issues
        chunk_size = 5000
        programs_to_delete = ProgramData.objects.filter(epg=epg)
        total_programs = programs_to_delete.count()

        if total_programs > 0:
            logger.info(f"Deleting {total_programs} existing programs for {epg.tvg_id}")

            # More memory-efficient approach using cursor-based pagination
            last_id = 0
            while True:
                # Get batch of IDs greater than the last ID processed
                id_batch = list(programs_to_delete.filter(id__gt=last_id).order_by('id').values_list('id', flat=True)[:chunk_size])
                if not id_batch:
                    break

                # Store the last ID before deleting the batch variable
                if id_batch:
                    max_id = id_batch[-1]
                else:
                    max_id = 0

                # Delete this batch
                ProgramData.objects.filter(id__in=id_batch).delete()
                # Release memory immediately
                del id_batch
                gc.collect()

                # Update last_id for next iteration using our stored value
                last_id = max_id

            # Explicitly delete query objects
            del programs_to_delete
            del last_id
            gc.collect()

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

        # Use streaming parsing to reduce memory usage
        is_gzipped = file_path.endswith('.gz')

        logger.info(f"Parsing programs for tvg_id={epg.tvg_id} from {file_path}")

        # Memory usage tracking
        if process:
            mem_before = process.memory_info().rss / 1024 / 1024
            logger.info(f"[parse_programs_for_tvg_id] Memory before parsing: {mem_before:.2f} MB")

        programs_to_create = []
        batch_size = 1000  # Process in batches to limit memory usage
        programs_processed = 0

        try:
            # Create a parser with the desired options
            #parser = etree.XMLParser(huge_tree=True, remove_blank_text=True)

            # Open the file properly
            source_file = gzip.open(file_path, 'rb') if is_gzipped else open(file_path, 'rb')

            # Stream parse the file using lxml's iterparse
            program_parser = etree.iterparse(source_file, events=('end',), tag='programme')

            for _, elem in program_parser:
                if elem.get('channel') == epg.tvg_id:
                    try:
                        start_time = parse_xmltv_time(elem.get('start'))
                        end_time = parse_xmltv_time(elem.get('stop'))
                        title = None
                        desc = None
                        sub_title = None

                        # Efficiently process child elements
                        for child in elem:
                            if child.tag == 'title':
                                title = child.text or 'No Title'
                            elif child.tag == 'desc':
                                desc = child.text or ''
                            elif child.tag == 'sub-title':
                                sub_title = child.text or ''

                        if not title:
                            title = 'No Title'

                        # Extract custom properties
                        custom_props = extract_custom_properties(elem)
                        custom_properties_json = None
                        if custom_props:
                            logger.debug(f"Number of custom properties: {len(custom_props)}")
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

                        programs_processed += 1
                        custom_props = None
                        custom_properties_json = None
                        # Batch processing
                        if len(programs_to_create) >= batch_size:
                            ProgramData.objects.bulk_create(programs_to_create)
                            logger.debug(f"Saved batch of {len(programs_to_create)} programs for {epg.tvg_id}")
                            del programs_to_create  # Explicit deletion
                            programs_to_create = []

                            # Force more aggressive garbage collection
                            custom_props = None
                            custom_properties_json = None
                            gc.collect()

                    except Exception as e:
                        logger.error(f"Error processing program for {epg.tvg_id}: {e}", exc_info=True)

                # Important: Clear the element to avoid memory leaks (lxml specific method)
                elem.clear()
                # Also eliminate ancestors to prevent memory leaks
                while elem.getprevious() is not None:
                    del elem.getparent()[0]

            # Make sure to close the file and release parser resources
            if source_file:
                source_file.close()
                source_file = None

            if program_parser:
                program_parser = None

            gc.collect()

        except etree.XMLSyntaxError as xml_error:
            logger.error(f"XML syntax error parsing program data: {xml_error}")
            raise
        except Exception as e:
            logger.error(f"Error parsing XML for programs: {e}", exc_info=True)
            raise
        finally:
            # Ensure file is closed even if an exception occurs
            if source_file:
                source_file.close()
                source_file = None

        # Process any remaining items
        if programs_to_create:
            ProgramData.objects.bulk_create(programs_to_create)
            logger.debug(f"Saved final batch of {len(programs_to_create)} programs for {epg.tvg_id}")
            del programs_to_create
            programs_to_create = []

        # Memory tracking after processing
        if process:
            mem_after = process.memory_info().rss / 1024 / 1024
            logger.info(f"[parse_programs_for_tvg_id] Memory after parsing {programs_processed} programs: {mem_after:.2f} MB (change: {mem_after-mem_before:.2f} MB)")

        # Final garbage collection
        gc.collect()

        # One additional garbage collection specifically for lxml elements
        # which can sometimes be retained due to reference cycles
        gc.collect()

        # Reset internal caches and pools that lxml might be keeping
        try:
            etree.clear_error_log()
        except:
            pass

        logger.info(f"Completed program parsing for tvg_id={epg.tvg_id}.")
    finally:
        # Explicit cleanup of all potentially large objects
        if source_file:
            try:
                source_file.close()
            except:
                pass

        source_file = None
        program_parser = None
        programs_to_create = None
        epg = None
        epg_source = None

        # Force garbage collection before releasing lock
        gc.collect()
        release_task_lock('parse_epg_programs', epg_id)


def parse_programs_for_source(epg_source, tvg_id=None):
    # Send initial programs parsing notification
    send_epg_update(epg_source.id, "parsing_programs", 0)

    # Add memory tracking
    try:
        import psutil
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024
        logger.info(f"[parse_programs_for_source] Initial memory usage: {initial_memory:.2f} MB")
    except ImportError:
        logger.warning("psutil not available for memory tracking")
        process = None

    try:
        # Process EPG entries in batches rather than all at once
        batch_size = 20  # Process fewer channels at once to reduce memory usage
        epg_count = EPGData.objects.filter(epg_source=epg_source).count()

        if epg_count == 0:
            logger.info(f"No EPG entries found for source: {epg_source.name}")
            # Update status - this is not an error, just no entries
            epg_source.status = 'success'
            epg_source.save(update_fields=['status'])
            send_epg_update(epg_source.id, "parsing_programs", 100, status="success")
            return True

        logger.info(f"Parsing programs for {epg_count} EPG entries from source: {epg_source.name}")

        failed_entries = []
        program_count = 0
        channel_count = 0
        updated_count = 0
        processed = 0

        # Memory check before batch processing
        if process:
            logger.info(f"[parse_programs_for_source] Memory before batch processing: {process.memory_info().rss / 1024 / 1024:.2f} MB")

        # Process in batches using cursor-based approach to limit memory usage
        last_id = 0
        while True:
            # Get a batch of EPG entries
            batch_entries = list(EPGData.objects.filter(
                epg_source=epg_source,
                id__gt=last_id
            ).order_by('id')[:batch_size])

            if not batch_entries:
                break  # No more entries to process

            # Update last_id for next iteration
            last_id = batch_entries[-1].id

            # Process this batch
            for epg in batch_entries:
                if epg.tvg_id:
                    try:
                        result = parse_programs_for_tvg_id(epg.id)
                        if result == "Task already running":
                            logger.info(f"Program parse for {epg.id} already in progress, skipping")

                        processed += 1
                        progress = min(95, int((processed / epg_count) * 100)) if epg_count > 0 else 50
                        send_epg_update(epg_source.id, "parsing_programs", progress)
                    except Exception as e:
                        logger.error(f"Error parsing programs for tvg_id={epg.tvg_id}: {e}", exc_info=True)
                        failed_entries.append(f"{epg.tvg_id}: {str(e)}")

            # Memory check after processing batch
            if process:
                logger.info(f"[parse_programs_for_source] Memory after processing batch: {process.memory_info().rss / 1024 / 1024:.2f} MB")

            # Force garbage collection after each batch
            batch_entries = None  # Remove reference to help garbage collection
            gc.collect()

            # Memory check after garbage collection
            if process:
                logger.info(f"[parse_programs_for_source] Memory after gc: {process.memory_info().rss / 1024 / 1024:.2f} MB")

        # If there were failures, include them in the message but continue
        if failed_entries:
            epg_source.status = EPGSource.STATUS_SUCCESS  # Still mark as success if some processed
            error_summary = f"Failed to parse {len(failed_entries)} of {epg_count} entries"
            stats_summary = f"Processed {program_count} programs across {channel_count} channels. Updated: {updated_count}."
            epg_source.last_message = f"{stats_summary} Warning: {error_summary}"
            epg_source.updated_at = timezone.now()
            epg_source.save(update_fields=['status', 'last_message', 'updated_at'])

            # Send completion notification with mixed status
            send_epg_update(epg_source.id, "parsing_programs", 100,
                          status="success",
                          message=epg_source.last_message)

            # Explicitly release memory of large lists before returning
            del failed_entries
            gc.collect()

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
    finally:
        # Final memory cleanup and tracking
        if process:
            # Force garbage collection before measuring
            gc.collect()
            final_memory = process.memory_info().rss / 1024 / 1024
            logger.info(f"[parse_programs_for_source] Final memory usage: {final_memory:.2f} MB")

        # Explicitly release any remaining large data structures
        failed_entries = None
        program_count = None
        channel_count = None
        updated_count = None
        processed = None
        gc.collect()


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
        logger.trace(f"Parsed XMLTV time '{time_str}' to {aware_dt}")
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


# Helper function to extract custom properties - moved to a separate function to clean up the code
def extract_custom_properties(prog):
    # Create a new dictionary for each call
    custom_props = {}

    # Extract categories with a single comprehension to reduce intermediate objects
    categories = [cat.text.strip() for cat in prog.findall('category') if cat.text and cat.text.strip()]
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

    # Extract ratings more efficiently
    rating_elem = prog.find('rating')
    if rating_elem is not None:
        value_elem = rating_elem.find('value')
        if value_elem is not None and value_elem.text:
            custom_props['rating'] = value_elem.text.strip()
            if rating_elem.get('system'):
                custom_props['rating_system'] = rating_elem.get('system')

    # Extract credits more efficiently
    credits_elem = prog.find('credits')
    if credits_elem is not None:
        credits = {}
        for credit_type in ['director', 'actor', 'writer', 'presenter', 'producer']:
            names = [e.text.strip() for e in credits_elem.findall(credit_type) if e.text and e.text.strip()]
            if names:
                credits[credit_type] = names
        if credits:
            custom_props['credits'] = credits

    # Extract other common program metadata
    date_elem = prog.find('date')
    if date_elem is not None and date_elem.text:
        custom_props['year'] = date_elem.text.strip()[:4]  # Just the year part

    country_elem = prog.find('country')
    if country_elem is not None and country_elem.text:
        custom_props['country'] = country_elem.text.strip()

    icon_elem = prog.find('icon')
    if icon_elem is not None and icon_elem.get('src'):
        custom_props['icon'] = icon_elem.get('src')

    # Simpler approach for boolean flags
    for kw in ['previously-shown', 'premiere', 'new']:
        if prog.find(kw) is not None:
            custom_props[kw.replace('-', '_')] = True

    return custom_props
