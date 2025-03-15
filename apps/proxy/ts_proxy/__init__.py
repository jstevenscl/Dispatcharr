"""Transport Stream proxy module"""

from .server import ProxyServer
from .stream_manager import StreamManager
from .stream_buffer import StreamBuffer
from .client_manager import ClientManager

# Create the singleton instance
proxy_server = ProxyServer()