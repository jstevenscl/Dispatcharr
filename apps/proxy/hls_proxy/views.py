from django.http import StreamingHttpResponse, JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
from .server import ProxyServer, Config

proxy_server = ProxyServer()

@require_http_methods(["GET"])
def stream_endpoint(request, channel_id):
    """Serve HLS manifest"""
    response = proxy_server.stream_endpoint(channel_id)
    return StreamingHttpResponse(
        response.response[0], 
        content_type='application/vnd.apple.mpegurl',
        status=response.status_code
    )

@require_http_methods(["GET"]) 
def get_segment(request, channel_id, segment_name):
    """Serve MPEG-TS segments"""
    response = proxy_server.get_segment(channel_id, segment_name)
    if response[1] == 404:
        return HttpResponse(status=404)
    return StreamingHttpResponse(response[0], content_type='video/MP2T')

@csrf_exempt
@require_http_methods(["POST"])
def change_stream(request, channel_id):
    """Handle stream URL changes"""
    try:
        data = json.loads(request.body)
        response = proxy_server.change_stream(channel_id)
        return JsonResponse(response[0], status=response[1])
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

@csrf_exempt
@require_http_methods(["POST"])
def initialize_stream(request, channel_id):
    """Initialize a new HLS stream channel"""
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