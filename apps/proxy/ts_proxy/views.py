from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
from .server import ProxyServer

proxy_server = ProxyServer()

@require_http_methods(["GET"])
def stream_ts(request, channel_id):
    """Handle TS stream requests"""
    if channel_id not in proxy_server.stream_managers:
        return StreamingHttpResponse('Channel not found', status=404)
        
    def generate():
        client_id = threading.get_ident()
        buffer = proxy_server.stream_buffers[channel_id]
        client_manager = proxy_server.client_managers[channel_id]
        
        client_manager.add_client(client_id)
        last_index = buffer.index
        
        try:
            while True:
                with buffer.lock:
                    if buffer.index > last_index:
                        chunks_behind = buffer.index - last_index
                        start_pos = max(0, len(buffer.buffer) - chunks_behind)
                        
                        for i in range(start_pos, len(buffer.buffer)):
                            yield buffer.buffer[i]
                        last_index = buffer.index
                
                time.sleep(Config.CLIENT_POLL_INTERVAL)
        except Exception:
            remaining = client_manager.remove_client(client_id)
            if remaining == 0:
                proxy_server.stop_channel(channel_id)
            raise

    return StreamingHttpResponse(
        generate(),
        content_type='video/MP2T'
    )

@csrf_exempt
@require_http_methods(["POST"])
def change_stream(request, channel_id):
    """Handle stream URL changes"""
    try:
        data = json.loads(request.body)
        new_url = data.get('url')
        if not new_url:
            return JsonResponse({'error': 'No URL provided'}, status=400)
            
        if channel_id not in proxy_server.stream_managers:
            return JsonResponse({'error': 'Channel not found'}, status=404)
            
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

@csrf_exempt
@require_http_methods(["POST"])
def initialize_stream(request, channel_id):
    """Initialize a new stream channel"""
    try:
        data = json.loads(request.body)
        url = data.get('url')
        if not url:
            return JsonResponse({'error': 'No URL provided'}, status=400)
            
        proxy_server.initialize_channel(url, channel_id)
        return JsonResponse({
            'message': 'Stream initialized',
            'channel': channel_id,
            'url': url
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)