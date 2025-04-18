# yourapp/tasks.py
from celery import shared_task
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import redis
import json
import logging
import re
import time
import os
from core.utils import RedisClient
from apps.proxy.ts_proxy.channel_status import ChannelStatus
from apps.m3u.models import M3UAccount
from apps.epg.models import EPGSource
from apps.m3u.tasks import refresh_single_m3u_account
from apps.epg.tasks import refresh_epg_data
from .models import CoreSettings

logger = logging.getLogger(__name__)

EPG_WATCH_DIR = '/data/epgs'
M3U_WATCH_DIR = '/data/m3us'
MIN_AGE_SECONDS = 6
STARTUP_SKIP_AGE = 30
REDIS_PREFIX = "processed_file:"
REDIS_TTL = 60 * 60 * 24 * 3  # expire keys after 3 days (optional)

# Store the last known value to compare with new data
last_known_data = {}

@shared_task
def beat_periodic_task():
    fetch_channel_stats()
    scan_and_process_files()

@shared_task
def scan_and_process_files():
    redis_client = RedisClient.get_client()
    now = time.time()

    # Add debug logging for the auto-import setting
    auto_import_value = CoreSettings.get_auto_import_mapped_files()
    logger.info(f"Auto-import mapped files setting value: '{auto_import_value}' (type: {type(auto_import_value).__name__})")

    # Check if directories exist
    logger.info(f"Checking M3U directory: {M3U_WATCH_DIR} (exists: {os.path.exists(M3U_WATCH_DIR)})")
    logger.info(f"Checking EPG directory: {EPG_WATCH_DIR} (exists: {os.path.exists(EPG_WATCH_DIR)})")

    for filename in os.listdir(M3U_WATCH_DIR):
        filepath = os.path.join(M3U_WATCH_DIR, filename)

        if not os.path.isfile(filepath):
            continue

        if not filename.endswith('.m3u') and not filename.endswith('.m3u8'):
            continue

        mtime = os.path.getmtime(filepath)
        age = now - mtime
        redis_key = REDIS_PREFIX + filepath
        stored_mtime = redis_client.get(redis_key)

        # Instead of assuming old files were processed, check if they exist in the database
        if not stored_mtime and age > STARTUP_SKIP_AGE:
            # Check if this file is already in the database
            existing_m3u = M3UAccount.objects.filter(file_path=filepath).exists()
            if existing_m3u:
                logger.info(f"Skipping {filename}: Already exists in database")
                redis_client.set(redis_key, mtime, ex=REDIS_TTL)
                continue
            else:
                logger.info(f"Processing {filename} despite age: Not found in database")
                # Continue processing this file even though it's old

        # File too new — probably still being written
        if age < MIN_AGE_SECONDS:
            continue

        # Skip if we've already processed this mtime
        if stored_mtime and float(stored_mtime) >= mtime:
            continue

        m3u_account, _ = M3UAccount.objects.get_or_create(file_path=filepath, defaults={
            "name": filename,
            "is_active": CoreSettings.get_auto_import_mapped_files() in [True, "true", "True"],
        })

        redis_client.set(redis_key, mtime, ex=REDIS_TTL)

        if not m3u_account.is_active:
            logger.info("M3U account is inactive, skipping.")
            continue

        refresh_single_m3u_account.delay(m3u_account.id)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "updates",
            {
                "type": "update",
                "data": {"success": True, "type": "m3u_file", "filename": filename}
            },
        )

    try:
        epg_files = os.listdir(EPG_WATCH_DIR)
        logger.info(f"Found {len(epg_files)} files in EPG directory: {epg_files}")
    except Exception as e:
        logger.error(f"Error listing EPG directory: {e}")
        epg_files = []

    for filename in epg_files:
        filepath = os.path.join(EPG_WATCH_DIR, filename)
        logger.info(f"Processing potential EPG file: {filename}")

        if not os.path.isfile(filepath):
            logger.info(f"Skipping {filename}: Not a file")
            continue

        if not filename.endswith('.xml') and not filename.endswith('.gz'):
            logger.info(f"Skipping {filename}: Not an XML or GZ file")
            continue

        mtime = os.path.getmtime(filepath)
        age = now - mtime
        redis_key = REDIS_PREFIX + filepath
        stored_mtime = redis_client.get(redis_key)

        logger.info(f"File {filename}: age={age}s, MIN_AGE={MIN_AGE_SECONDS}s, stored_mtime={stored_mtime}")

        # Instead of assuming old files were processed, check if they exist in the database
        if not stored_mtime and age > STARTUP_SKIP_AGE:
            # Check if this file is already in the database
            existing_epg = EPGSource.objects.filter(file_path=filepath).exists()
            if existing_epg:
                logger.info(f"Skipping {filename}: Already exists in database")
                redis_client.set(redis_key, mtime, ex=REDIS_TTL)
                continue
            else:
                logger.info(f"Processing {filename} despite age: Not found in database")
                # Continue processing this file even though it's old

        # File too new — probably still being written
        if age < MIN_AGE_SECONDS:
            logger.info(f"Skipping {filename}: Too new, possibly still being written (age={age}s < {MIN_AGE_SECONDS}s)")
            continue

        # Skip if we've already processed this mtime
        if stored_mtime and float(stored_mtime) >= mtime:
            logger.info(f"Skipping {filename}: Already processed this version (stored={stored_mtime}, current={mtime})")
            continue

        try:
            logger.info(f"Creating/getting EPG source for {filename}")
            epg_source, created = EPGSource.objects.get_or_create(file_path=filepath, defaults={
                "name": filename,
                "source_type": "xmltv",
                "is_active": CoreSettings.get_auto_import_mapped_files() in [True, "true", "True"],
            })

            # Add debug logging for created sources
            if created:
                logger.info(f"Created new EPG source '{filename}' with is_active={epg_source.is_active}")
            else:
                logger.info(f"Found existing EPG source '{filename}' with is_active={epg_source.is_active}")

            redis_client.set(redis_key, mtime, ex=REDIS_TTL)

            if not epg_source.is_active:
                logger.info(f"Skipping {filename}: EPG source is marked as inactive")
                continue

            logger.info(f"Triggering refresh_epg_data task for EPG source id={epg_source.id}")
            refresh_epg_data.delay(epg_source.id)  # Trigger Celery task

            logger.info(f"Successfully queued refresh for EPG file: {filename}")

        except Exception as e:
            logger.error(f"Error processing EPG file {filename}: {str(e)}", exc_info=True)
            continue

def fetch_channel_stats():
    redis_client = RedisClient.get_client()

    try:
        # Basic info for all channels
        channel_pattern = "ts_proxy:channel:*:metadata"
        all_channels = []

        # Extract channel IDs from keys
        cursor = 0
        while True:
            cursor, keys = redis_client.scan(cursor, match=channel_pattern)
            for key in keys:
                channel_id_match = re.search(r"ts_proxy:channel:(.*):metadata", key.decode('utf-8'))
                if channel_id_match:
                    ch_id = channel_id_match.group(1)
                    channel_info = ChannelStatus.get_basic_channel_info(ch_id)
                    if channel_info:
                        all_channels.append(channel_info)

            if cursor == 0:
                break

    except Exception as e:
        logger.error(f"Error in channel_status: {e}", exc_info=True)
        return
        # return JsonResponse({'error': str(e)}, status=500)

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "updates",
        {
            "type": "update",
            "data": {"success": True, "type": "channel_stats", "stats": json.dumps({'channels': all_channels, 'count': len(all_channels)})}
        },
    )
