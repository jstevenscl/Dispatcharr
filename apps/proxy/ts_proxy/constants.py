"""
Constants used throughout the TS Proxy application.
Centralizing constants makes it easier to maintain and modify them.
"""

# Redis related constants
REDIS_KEY_PREFIX = "ts_proxy"
REDIS_TTL_DEFAULT = 3600  # 1 hour
REDIS_TTL_SHORT = 60      # 1 minute
REDIS_TTL_MEDIUM = 300    # 5 minutes

# Channel states
class ChannelState:
    INITIALIZING = "initializing"
    CONNECTING = "connecting"
    WAITING_FOR_CLIENTS = "waiting_for_clients"
    ACTIVE = "active"
    ERROR = "error"
    STOPPING = "stopping"
    STOPPED = "stopped"

# Event types
class EventType:
    STREAM_SWITCH = "stream_switch"
    STREAM_SWITCHED = "stream_switched"
    CHANNEL_STOP = "channel_stop"
    CHANNEL_STOPPED = "channel_stopped"
    CLIENT_CONNECTED = "client_connected"
    CLIENT_DISCONNECTED = "client_disconnected"
    CLIENT_STOP = "client_stop"

# Stream types
class StreamType:
    HLS = "hls"
    TS = "ts"
    UNKNOWN = "unknown"

# TS packet constants
TS_PACKET_SIZE = 188
TS_SYNC_BYTE = 0x47
NULL_PID_HIGH = 0x1F
NULL_PID_LOW = 0xFF
