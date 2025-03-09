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
    """Initialize a new stream channel"""
    try:
        data = json.loads(request.body)
        url = data.get('url')
        if not url:
            return JsonResponse({'error': 'No URL provided'}, status=400)
        
        # Start the channel
        proxy_server.initialize_channel(url, channel_id)
        
        # Wait for connection to be established
        manager = proxy_server.stream_managers[channel_id]
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
            
        return JsonResponse({
            'message': 'Stream initialized and connected',
            'channel': channel_id,
            'url': url
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Failed to initialize stream: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def stream_ts(request, channel_id):
    """Stream TS data to client with proper EOF handling"""
    if channel_id not in proxy_server.stream_managers:
        return JsonResponse({'error': 'Channel not found'}, status=404)
    
    def generate():
        client_id = f"client_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        
        try:
            logger.info(f"[{client_id}] New client connected to channel {channel_id}")
            
            # Add client to manager
            client_manager = proxy_server.client_managers[channel_id]
            client_manager.add_client(client_id)
            
            # Get buffer and stream manager
            buffer = proxy_server.stream_buffers.get(channel_id)
            stream_manager = proxy_server.stream_managers[channel_id]
            if not buffer or not stream_manager:
                logger.error(f"[{client_id}] No buffer/stream manager for channel {channel_id}")
                return
            
            # Client state tracking
            local_index = max(0, buffer.index - 30)  # Start 30 chunks behind
            last_yield_time = time.time()
            empty_reads = 0
            bytes_sent = 0
            chunks_sent = 0
            stream_start_time = time.time()
            consecutive_empty = 0  # Track consecutive empty reads
            
            # Timing parameters
            ts_packet_size = 188
            target_bitrate = 8000000  # ~8 Mbps
            packets_per_second = target_bitrate / (8 * ts_packet_size)
            
            logger.info(f"[{client_id}] Starting stream at index {local_index} (buffer at {buffer.index})")
            
            # Main streaming loop
            while True:
                # Get chunks at client's position
                chunks = buffer.get_chunks_exact(local_index, 5)
                
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
                    
                    # Send chunks with pacing
                    for chunk in chunks:
                        bytes_sent += len(chunk)
                        chunks_sent += 1
                        yield chunk
                        time.sleep(0.01)  # Small spacing between chunks
                    
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
                    
                    # If we're at buffer head and stream is unhealthy, send keepalive
                    if at_buffer_head and not stream_manager.healthy and consecutive_empty >= 5:
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
                        time.sleep(0.5)  # Longer sleep after keepalive
                    else:
                        # Standard wait
                        sleep_time = min(0.1 * consecutive_empty, 1.0)  # Progressive backoff up to 1s
                        time.sleep(sleep_time)
                        
                    # Log empty reads periodically
                    if empty_reads % 50 == 0:
                        logger.debug(f"[{client_id}] Waiting for chunks beyond {local_index} (buffer at {buffer.index}, stream health: {stream_manager.healthy})")
                    
                    # Disconnect after long inactivity, but only if stream is dead
                    if time.time() - last_yield_time > 30 and not stream_manager.healthy:
                        logger.warning(f"[{client_id}] No data for 30s and stream unhealthy, disconnecting")
                        break
                    
        except Exception as e:
            logger.error(f"[{client_id}] Stream error: {e}", exc_info=True)
        finally:
            # Clean up client
            elapsed = time.time() - stream_start_time
            if channel_id in proxy_server.client_managers:
                remaining = proxy_server.client_managers[channel_id].remove_client(client_id)
                logger.info(f"[{client_id}] Disconnected after {elapsed:.2f}s, {bytes_sent/1024:.1f}KB in {chunks_sent} chunks ({remaining} clients left)")
    
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