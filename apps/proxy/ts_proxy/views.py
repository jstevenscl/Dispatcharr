import json
import threading
import logging
import time
import random
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from apps.proxy.config import TSConfig as Config  # Change this line
from .server import ProxyServer

logger = logging.getLogger(__name__)
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
    """Stream TS data to client"""
    if channel_id not in proxy_server.stream_managers:
        return JsonResponse({'error': 'Channel not found'}, status=404)
    
    def generate():
        client_id = int(time.time() * 1000) + random.randint(1, 1000)
        
        try:
            # Add client to manager
            client_manager = proxy_server.client_managers[channel_id]
            client_manager.add_client(client_id)
            
            # Get buffer
            buffer = proxy_server.stream_buffers.get(channel_id)
            if not buffer:
                logger.error(f"No buffer found for channel {channel_id}")
                return
            
            # Start at current position
            local_index = None
            
            # Main streaming loop
            while True:
                chunks = buffer.get_chunks(local_index)
                
                if chunks:
                    # Send chunks to client
                    for chunk in chunks:
                        yield chunk
                    
                    # Update local index
                    local_index = buffer.index
                else:
                    # No data available, wait briefly
                    time.sleep(0.1)
                    
        except Exception as e:
            logger.error(f"Streaming error for client {client_id}, channel {channel_id}: {e}")
        finally:
            # Clean up client
            if channel_id in proxy_server.client_managers:
                remaining = proxy_server.client_managers[channel_id].remove_client(client_id)
                logger.info(f"Client {client_id} disconnected from channel {channel_id} ({remaining} clients remaining)")
    
    # Create streaming response
    response = StreamingHttpResponse(generate(), content_type='video/MP2T')
    response['Cache-Control'] = 'no-cache, no-store'
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