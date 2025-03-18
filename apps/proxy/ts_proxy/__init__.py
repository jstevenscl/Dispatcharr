"""Transport Stream proxy module"""

# Only class imports, no instance creation
from .server import ProxyServer
from .stream_manager import StreamManager
from .stream_buffer import StreamBuffer
from .client_manager import ClientManager

proxy_server = ProxyServer()
