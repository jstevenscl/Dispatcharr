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
    """Stream TS data to client with synchronized delivery timing"""
    if channel_id not in proxy_server.stream_managers:
        return JsonResponse({'error': 'Channel not found'}, status=404)
    
    def generate():
        client_id = f"client_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        
        try:
            logger.info(f"[{client_id}] New client connected to channel {channel_id}")
            
            # Add client to manager
            client_manager = proxy_server.client_managers[channel_id]
            client_manager.add_client(client_id)
            
            # Get buffer and set initial position for this client
            buffer = proxy_server.stream_buffers.get(channel_id)
            if not buffer:
                logger.error(f"[{client_id}] No buffer found for channel {channel_id}")
                return
            
            # Start 30 chunks behind current position
            local_index = max(0, buffer.index - 30)
            initial_position = local_index
            
            # Client state tracking
            last_yield_time = time.time()
            empty_reads = 0
            bytes_sent = 0
            chunks_sent = 0
            stream_start_time = time.time()
            
            # Critical timing parameters
            ts_packet_size = 188
            target_bitrate = 8000000  # Target ~8 Mbps (typical for HD)
            packets_per_second = target_bitrate / (8 * ts_packet_size)
            packets_per_batch = 200   # How many packets to send in one batch
            target_batch_time = packets_per_batch / packets_per_second  # Time one batch should take

            logger.info(f"[{client_id}] Starting stream at index {initial_position} (buffer at {buffer.index})")
            logger.info(f"[{client_id}] Target bitrate: {target_bitrate/1000000:.1f} Mbps, packets/sec: {packets_per_second:.1f}")
            
            # For rate limiting
            batch_start_time = time.time()
            
            # Main streaming loop
            while True:
                # Log buffer state periodically
                if empty_reads % 50 == 0:
                    current_buffer_index = buffer.index
                    chunks_behind = current_buffer_index - local_index
                    logger.debug(f"[{client_id}] Buffer state: Client={local_index}, Buffer={current_buffer_index}, Behind={chunks_behind}")
                
                # Get exactly 5 chunks (or whatever is available)
                chunks = buffer.get_chunks_exact(local_index, 5)
                
                if chunks:
                    # Calculate total packet count for this batch to maintain timing
                    total_packets = sum(len(chunk) // ts_packet_size for chunk in chunks)
                    batch_start_time = time.time()
                    
                    # Log chunk retrieval
                    chunk_sizes = [len(c) for c in chunks]
                    total_size = sum(chunk_sizes)
                    start_idx = local_index + 1
                    end_idx = local_index + len(chunks)
                    
                    logger.debug(f"[{client_id}] Retrieved {len(chunks)} chunks ({total_size} bytes) from index {start_idx} to {end_idx}")
                    
                    # Track how many packets we've sent in this batch
                    packets_sent_in_batch = 0
                    
                    # Send chunks with precise timing to maintain PCR synchronization
                    for chunk in chunks:
                        # Count packets in this chunk
                        packets_in_chunk = len(chunk) // ts_packet_size
                        
                        # Send the chunk
                        bytes_sent += len(chunk)
                        chunks_sent += 1
                        yield chunk
                        
                        packets_sent_in_batch += packets_in_chunk
                        
                        # Calculate elapsed time to maintain target bitrate
                        elapsed = time.time() - batch_start_time
                        target_time = packets_sent_in_batch / packets_per_second
                        
                        # If we're sending too fast, add a small delay
                        if elapsed < target_time and packets_sent_in_batch < total_packets:
                            sleep_time = target_time - elapsed
                            # Limit max sleep to prevent long pauses
                            sleep_time = min(sleep_time, 0.05)
                            if sleep_time > 0.001:  # Only sleep for meaningful amounts
                                time.sleep(sleep_time)
                    
                    # After sending a complete batch, ensure proper pacing
                    batch_elapsed = time.time() - batch_start_time
                    if batch_elapsed < target_batch_time:
                        time.sleep(target_batch_time - batch_elapsed)
                    
                    # Update progress stats periodically
                    if chunks_sent % 100 == 0:
                        elapsed = time.time() - stream_start_time
                        rate = bytes_sent / elapsed / 1024 if elapsed > 0 else 0
                        logger.info(f"[{client_id}] Streaming stats: {chunks_sent} chunks, {bytes_sent/1024:.1f} KB sent, {rate:.1f} KB/s")
                    
                    # Update local index to last chunk received
                    local_index = end_idx
                    last_yield_time = time.time()
                    empty_reads = 0
                else:
                    # No new data yet
                    empty_reads += 1
                    sleep_time = 0.1
                    time.sleep(sleep_time)
                    
                    # Log empty reads periodically 
                    if empty_reads % 50 == 0:
                        logger.debug(f"[{client_id}] Waiting for new chunks beyond index {local_index} (buffer at {buffer.index})")
                    
                    # Safety timeout
                    if time.time() - last_yield_time > 10:
                        logger.warning(f"[{client_id}] No data for 10 seconds, disconnecting")
                        break
                    
        except Exception as e:
            logger.error(f"[{client_id}] Streaming error: {e}", exc_info=True)
        finally:
            # Clean up client
            elapsed = time.time() - stream_start_time
            if channel_id in proxy_server.client_managers:
                remaining = proxy_server.client_managers[channel_id].remove_client(client_id)
                logger.info(f"[{client_id}] Disconnected after {elapsed:.2f}s, sent {bytes_sent/1024:.1f} KB in {chunks_sent} chunks ({remaining} clients left)")
    
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