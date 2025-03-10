import json
import threading
import logging
import time
import random
import sys
import os
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from apps.proxy.config import TSConfig as Config
from .server import ProxyServer

# Configure logging properly to ensure visibility
logger = logging.getLogger(__name__)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.DEBUG)

# Print directly to output for critical messages (bypass logging system)
print("TS PROXY VIEWS INITIALIZED", file=sys.stderr)

# Initialize proxy server
proxy_server = ProxyServer()

@csrf_exempt
@require_http_methods(["POST"])
def initialize_stream(request, channel_id):
    """Initialize a new stream channel with initialization-based ownership"""
    try:
        data = json.loads(request.body)
        url = data.get('url')
        if not url:
            return JsonResponse({'error': 'No URL provided'}, status=400)
        
        # Get optional user_agent from request
        user_agent = data.get('user_agent')
        
        # Try to acquire ownership and create connection
        success = proxy_server.initialize_channel(url, channel_id, user_agent)
        if not success:
            return JsonResponse({'error': 'Failed to initialize channel'}, status=500)
        
        # If we're the owner, wait for connection
        if proxy_server.am_i_owner(channel_id):
            # Wait for connection to be established
            manager = proxy_server.stream_managers.get(channel_id)
            if manager:
                wait_start = time.time()
                while not manager.connected:
                    if time.time() - wait_start > Config.CONNECTION_TIMEOUT:
                        proxy_server.stop_channel(channel_id)
                        return JsonResponse({
                            'error': 'Connection timeout'
                        }, status=504)
                    if not manager.should_retry():
                        proxy_server.stop_channel(channel_id)
                        return JsonResponse({
                            'error': 'Failed to connect'
                        }, status=502)
                    time.sleep(0.1)
        
        # Return success response with owner status
        return JsonResponse({
            'message': 'Stream initialized and connected',
            'channel': channel_id,
            'url': url,
            'owner': proxy_server.am_i_owner(channel_id)
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Failed to initialize stream: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def stream_ts(request, channel_id):
    """Stream TS data to client with redis-based client tracking"""
    # Check if channel exists
    if channel_id not in proxy_server.stream_buffers:
        # Not in local memory, check Redis
        if not proxy_server.check_if_channel_exists(channel_id):
            return JsonResponse({'error': 'Channel not found'}, status=404)
            
        # Channel exists in Redis but not in this worker, initialize it (buffer only)
        if not proxy_server.initialize_channel(None, channel_id):
            return JsonResponse({'error': 'Failed to initialize channel'}, status=500)
    
    def generate():
        client_id = f"client_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        stream_start_time = time.time()
        bytes_sent = 0
        chunks_sent = 0
        
        try:
            logger.info(f"[{client_id}] New client connected to channel {channel_id}")
            
            # Add client to manager
            client_manager = proxy_server.client_managers[channel_id]
            client_count = client_manager.add_client(client_id)
            
            # If this is the first client, try to acquire ownership
            if client_count == 1 and not proxy_server.am_i_owner(channel_id):
                if proxy_server.try_acquire_ownership(channel_id):
                    logger.info(f"[{client_id}] First client, acquiring channel ownership")
                    
                    # Get channel metadata from Redis
                    if proxy_server.redis_client:
                        metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
                        url_bytes = proxy_server.redis_client.hget(metadata_key, "url")
                        ua_bytes = proxy_server.redis_client.hget(metadata_key, "user_agent")
                        
                        url = url_bytes.decode('utf-8') if url_bytes else None
                        user_agent = ua_bytes.decode('utf-8') if ua_bytes else None
                        
                        if url:
                            # Create and start stream connection
                            from .server import StreamManager  # Import here to avoid circular import
                            
                            logger.info(f"[{client_id}] Creating stream connection for URL: {url}")
                            buffer = proxy_server.stream_buffers[channel_id]
                            
                            stream_manager = StreamManager(url, buffer, user_agent=user_agent)
                            proxy_server.stream_managers[channel_id] = stream_manager
                            
                            thread = threading.Thread(target=stream_manager.run, daemon=True)
                            thread.name = f"stream-{channel_id}"
                            thread.start()
                            
                            # Wait briefly for connection
                            wait_start = time.time()
                            while not stream_manager.connected:
                                if time.time() - wait_start > Config.CONNECTION_TIMEOUT:
                                    break
                                time.sleep(0.1)
            
            # Get buffer - stream manager may not exist in this worker
            buffer = proxy_server.stream_buffers.get(channel_id)
            stream_manager = proxy_server.stream_managers.get(channel_id)
            
            if not buffer:
                logger.error(f"[{client_id}] No buffer found for channel {channel_id}")
                return
            
            # Client state tracking - use config for initial position
            local_index = max(0, buffer.index - Config.INITIAL_BEHIND_CHUNKS)
            initial_position = local_index
            last_yield_time = time.time()
            empty_reads = 0
            bytes_sent = 0
            chunks_sent = 0
            stream_start_time = time.time()
            consecutive_empty = 0  # Track consecutive empty reads
            
            # Timing parameters from config
            ts_packet_size = 188
            target_bitrate = Config.TARGET_BITRATE 
            packets_per_second = target_bitrate / (8 * ts_packet_size)
            
            logger.info(f"[{client_id}] Starting stream at index {local_index} (buffer at {buffer.index})")
            
            # Check if we're the owner worker
            is_owner_worker = proxy_server.am_i_owner(channel_id) if hasattr(proxy_server, 'am_i_owner') else True
            
            # Main streaming loop
            while True:
                # Get chunks at client's position
                chunks = buffer.get_chunks_exact(local_index, Config.CHUNK_BATCH_SIZE)
                
                if chunks:
                    # Reset empty counters since we got data
                    empty_reads = 0
                    consecutive_empty = 0
                    
                    # Track and send chunks
                    chunk_sizes = [len(c) for c in chunks]
                    total_size = sum(chunk_sizes)
                    start_idx = local_index + 1
                    end_idx = local_index + len(chunks)
                    
                    logger.debug(f"[{client_id}] Retrieved {len(chunks)} chunks ({total_size} bytes) from index {start_idx} to {end_idx}")
                    
                    # Calculate total packet count for this batch to maintain timing
                    total_packets = sum(len(chunk) // ts_packet_size for chunk in chunks)
                    batch_start_time = time.time()
                    packets_sent_in_batch = 0
                    
                    # Send chunks with pacing
                    for chunk in chunks:
                        packets_in_chunk = len(chunk) // ts_packet_size
                        bytes_sent += len(chunk)
                        chunks_sent += 1
                        yield chunk
                        
                        # Pacing logic
                        packets_sent_in_batch += packets_in_chunk
                        elapsed = time.time() - batch_start_time
                        target_time = packets_sent_in_batch / packets_per_second
                        
                        # If we're sending too fast, add a small delay
                        if elapsed < target_time and packets_sent_in_batch < total_packets:
                            sleep_time = min(target_time - elapsed, 0.05)
                            if sleep_time > 0.001:
                                time.sleep(sleep_time)
                    
                    # Log progress periodically
                    if chunks_sent % 100 == 0:
                        elapsed = time.time() - stream_start_time
                        rate = bytes_sent / elapsed / 1024 if elapsed > 0 else 0
                        logger.info(f"[{client_id}] Stats: {chunks_sent} chunks, {bytes_sent/1024:.1f}KB, {rate:.1f}KB/s")
                    
                    # Update local index
                    local_index = end_idx
                    last_yield_time = time.time()
                else:
                    # No chunks available
                    empty_reads += 1
                    consecutive_empty += 1
                    
                    # Check if we're caught up to buffer head
                    at_buffer_head = local_index >= buffer.index
                    
                    # If we're at buffer head and no data is coming, send keepalive
                    # Only check stream manager health if it exists
                    stream_healthy = stream_manager.healthy if stream_manager else True
                    
                    if at_buffer_head and not stream_healthy and consecutive_empty >= 5:
                        # Create a null TS packet as keepalive (188 bytes filled with padding)
                        # This prevents VLC from hitting EOF
                        keepalive_packet = bytearray(188)
                        keepalive_packet[0] = 0x47  # Sync byte
                        keepalive_packet[1] = 0x1F  # PID high bits (null packet)
                        keepalive_packet[2] = 0xFF  # PID low bits (null packet)
                        
                        logger.debug(f"[{client_id}] Sending keepalive packet while waiting at buffer head")
                        yield bytes(keepalive_packet)
                        bytes_sent += len(keepalive_packet)
                        last_yield_time = time.time()
                        consecutive_empty = 0  # Reset consecutive counter but keep total empty_reads
                        time.sleep(Config.KEEPALIVE_INTERVAL)
                    else:
                        # Standard wait
                        sleep_time = min(0.1 * consecutive_empty, 1.0)  # Progressive backoff up to 1s
                        time.sleep(sleep_time)
                        
                    # Log empty reads periodically
                    if empty_reads % 50 == 0:
                        stream_status = "healthy" if (stream_manager and stream_manager.healthy) else "unknown"
                        logger.debug(f"[{client_id}] Waiting for chunks beyond {local_index} (buffer at {buffer.index}, stream: {stream_status})")
                    
                    # Disconnect after long inactivity
                    # For non-owner workers, we're more lenient with timeout
                    if time.time() - last_yield_time > Config.STREAM_TIMEOUT:
                        if stream_manager and not stream_manager.healthy:
                            logger.warning(f"[{client_id}] No data for {Config.STREAM_TIMEOUT}s and stream unhealthy, disconnecting")
                            break
                        elif not is_owner_worker and consecutive_empty > 100:
                            # Non-owner worker without data for too long
                            logger.warning(f"[{client_id}] Non-owner worker with no data for {Config.STREAM_TIMEOUT}s, disconnecting")
                            break
                    
        except Exception as e:
            logger.error(f"[{client_id}] Stream error: {e}", exc_info=True)
        finally:
            # Client cleanup - simpler now since owner tracks all clients
            elapsed = time.time() - stream_start_time
            local_clients = 0
            
            if channel_id in proxy_server.client_managers:
                local_clients = proxy_server.client_managers[channel_id].remove_client(client_id)
                total_clients = proxy_server.client_managers[channel_id].get_total_client_count()
                logger.info(f"[{client_id}] Disconnected after {elapsed:.2f}s, {bytes_sent/1024:.1f}KB in {chunks_sent} chunks (local: {local_clients}, total: {total_clients})")
            
            
    # Create streaming response
    response = StreamingHttpResponse(generate(), content_type='video/MP2T')
    response['Cache-Control'] = 'no-cache, no-store'
    response['X-Accel-Buffering'] = 'no'
    return response

@csrf_exempt
@require_http_methods(["POST"])
def change_stream(request, channel_id):
    """Change stream URL for existing channel"""
    try:
        if channel_id not in proxy_server.stream_managers:
            return JsonResponse({'error': 'Channel not found'}, status=404)
            
        data = json.loads(request.body)
        new_url = data.get('url')
        if not new_url:
            return JsonResponse({'error': 'No URL provided'}, status=400)
            
        manager = proxy_server.stream_managers[channel_id]
        if manager.update_url(new_url):
            return JsonResponse({
                'message': 'Stream URL updated',
                'channel': channel_id,
                'url': new_url
            })
            
        return JsonResponse({
            'message': 'URL unchanged',
            'channel': channel_id,
            'url': new_url
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Failed to change stream: {e}")
        return JsonResponse({'error': str(e)}, status=500)