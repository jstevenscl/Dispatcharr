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

        # Startup safety: skip old untracked files
        if not stored_mtime and age > STARTUP_SKIP_AGE:
            redis_client.set(redis_key, mtime, ex=REDIS_TTL)
            continue  # Assume already processed before startup

        # File too new — probably still being written
        if age < MIN_AGE_SECONDS:
            continue

        # Skip if we've already processed this mtime
        if stored_mtime and float(stored_mtime) >= mtime:
            continue


        m3u_account, _ = M3UAccount.objects.get_or_create(file_path=filepath, defaults={
            "name": filename,
            "is_active": CoreSettings.get_auto_import_mapped_files(),
        })

        redis_client.set(redis_key, mtime, ex=REDIS_TTL)
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

    for filename in os.listdir(EPG_WATCH_DIR):
        filepath = os.path.join(EPG_WATCH_DIR, filename)

        if not os.path.isfile(filepath):
            continue

        if not filename.endswith('.xml') and not filename.endswith('.gz'):
            continue

        mtime = os.path.getmtime(filepath)
        age = now - mtime
        redis_key = REDIS_PREFIX + filepath
        stored_mtime = redis_client.get(redis_key)

        # Startup safety: skip old untracked files
        if not stored_mtime and age > STARTUP_SKIP_AGE:
            redis_client.set(redis_key, mtime, ex=REDIS_TTL)
            continue  # Assume already processed before startup

        # File too new — probably still being written
        if age < MIN_AGE_SECONDS:
            continue

        # Skip if we've already processed this mtime
        if stored_mtime and float(stored_mtime) >= mtime:
            continue

        epg_source, _ = EPGSource.objects.get_or_create(file_path=filepath, defaults={
            "name": filename,
            "source_type": "xmltv",
            "is_active": CoreSettings.get_auto_import_mapped_files(),
        })

        redis_client.set(redis_key, mtime, ex=REDIS_TTL)
        redis_client.set(redis_key, mtime, ex=REDIS_TTL)

        if not epg_source.is_active:
            logger.info("EPG source is inactive, skipping.")
            continue

        refresh_epg_data.delay(epg_source.id)  # Trigger Celery task

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "updates",
            {
                "type": "update",
                "data": {"success": True, "type": "epg_file", "filename": filename}
            },
        )

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
