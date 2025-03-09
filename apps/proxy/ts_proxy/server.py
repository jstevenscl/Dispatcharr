"""
Transport Stream (TS) Proxy Server
Handles live TS stream proxying with support for:
- Stream switching
- Buffer management
- Multiple client connections
- Connection state tracking
"""

import requests
import threading
import logging
import socket 
import random
from collections import deque
import time
import sys
from typing import Optional, Set, Deque, Dict
from apps.proxy.config import TSConfig as Config

# Configure root logger for this module
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - TS_PROXY - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# Force immediate output
print("TS PROXY SERVER MODULE LOADED", file=sys.stderr)

class StreamManager:
    """Manages a connection to a TS stream with continuity tracking"""
    
    def __init__(self, url, buffer, user_agent=None):
        self.url = url
        self.buffer = buffer
        self.running = True
        self.connected = False
        self.socket = None
        self.ready_event = threading.Event()
        self.retry_count = 0
        self.max_retries = 3
        
        # User agent for connection
        self.user_agent = user_agent or 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        
        # TS packet handling
        self.TS_PACKET_SIZE = 188
        self.recv_buffer = bytearray()
        self.sync_found = False
        self.continuity_counters = {}  # Track continuity counters for each PID
        
        # Buffer management
        self._last_buffer_check = time.time()
        logging.info(f"Initialized stream manager for channel {buffer.channel_id}")

    def _create_session(self) -> requests.Session:
        """Create and configure requests session"""
        session = requests.Session()
        session.headers.update({
            'User-Agent': self.user_agent,
            'Connection': 'keep-alive'
        })
        return session

    def update_url(self, new_url: str) -> bool:
        """Update stream URL and signal connection change"""
        if new_url != self.url:
            logging.info(f"Stream switch initiated: {self.url} -> {new_url}")
            self.url = new_url
            self.connected = False
            self.ready_event.set()
            return True
        return False

    def should_retry(self) -> bool:
        """Check if connection retry is allowed"""
        return self.retry_count < self.max_retries

    def stop(self) -> None:
        """Clean shutdown of stream manager"""
        self.running = False
        if self.socket:
            self.socket.close()

    def _process_complete_packets(self):
        """Process TS packets with detailed logging"""
        try:
            # Find sync byte if needed
            if not self.sync_found and len(self.recv_buffer) >= 376:
                for i in range(min(188, len(self.recv_buffer) - 188)):
                    # Look for at least two sync bytes (0x47) at 188-byte intervals
                    if (self.recv_buffer[i] == 0x47 and 
                        self.recv_buffer[i + 188] == 0x47):
                        
                        # Trim buffer to start at first sync byte
                        self.recv_buffer = self.recv_buffer[i:]
                        self.sync_found = True
                        logging.debug(f"TS sync found at position {i}")
                        break
                
                # If sync not found, keep last 188 bytes and return
                if not self.sync_found:
                    if len(self.recv_buffer) > 188:
                        self.recv_buffer = self.recv_buffer[-188:]
                    return False
                    
            # If we don't have a complete packet yet, wait for more data
            if len(self.recv_buffer) < 188:
                return False
                
            # Calculate how many complete packets we have
            packet_count = len(self.recv_buffer) // 188
            
            if packet_count == 0:
                return False
            
            # Log packet processing
            logging.debug(f"Processing {packet_count} TS packets ({packet_count * 188} bytes)")
            
            # Extract complete packets
            packets = self.recv_buffer[:packet_count * 188]
            
            # Keep remaining data in buffer
            self.recv_buffer = self.recv_buffer[packet_count * 188:]
            
            # Send packets to buffer
            if packets:
                # Log first and last sync byte to validate alignment
                first_sync = packets[0] if len(packets) > 0 else None
                last_sync = packets[188 * (packet_count - 1)] if packet_count > 0 else None
                
                if first_sync != 0x47 or last_sync != 0x47:
                    logging.warning(f"TS packet alignment issue: first_sync=0x{first_sync:02x}, last_sync=0x{last_sync:02x}")
                
                before_index = self.buffer.index
                success = self.buffer.add_chunk(bytes(packets))
                after_index = self.buffer.index
                
                # Log successful write
                if success:
                    logging.debug(f"Added chunk: {packet_count} packets, buffer index {before_index} → {after_index}")
                else:
                    logging.warning("Failed to add chunk to buffer")
                    
                return success
                
            return False
            
        except Exception as e:
            logging.error(f"Error processing TS packets: {e}", exc_info=True)
            self.sync_found = False  # Reset sync state on error
            return False

    def _process_ts_data(self, chunk):
        """Process received data and add to buffer"""
        if not chunk:
            return False
            
        # Add to existing buffer
        self.recv_buffer.extend(chunk)
        
        # Process complete packets now
        return self._process_complete_packets()

    def run(self):
        """Main execution loop for stream manager"""
        try:
            # Establish network connection
            import socket
            import requests
            
            logging.info(f"Starting stream for URL: {self.url}")
            
            # Parse URL
            if self.url.startswith("http"):
                # HTTP connection
                session = self._create_session()
                
                try:
                    # Create an initial connection to get socket
                    response = session.get(self.url, stream=True)
                    if response.status_code == 200:
                        self.connected = True
                        self.socket = response.raw._fp.fp.raw
                        
                        # Main fetch loop
                        while self.running:
                            if not self.fetch_chunk():
                                if not self.running:
                                    break
                                time.sleep(1)
                                continue
                                
                    else:
                        logging.error(f"Failed to connect to stream: HTTP {response.status_code}")
                        
                finally:
                    session.close()
            else:
                # Direct socket connection (UDP/TCP)
                logging.error(f"Unsupported URL scheme: {self.url}")
                
        except Exception as e:
            logging.error(f"Stream error: {e}")
            self._close_socket()
        finally:
            self._close_socket()
            logging.info("Stream manager stopped")
    
    def _close_socket(self):
        """Close the socket connection safely"""
        if self.socket:
            try:
                self.socket.close()
            except Exception:
                pass
            self.socket = None
            self.connected = False

    def fetch_chunk(self):
        """Fetch data from socket with improved buffer management"""
        if not self.connected or not self.socket:
            return False
            
        try:
            # SocketIO objects use read instead of recv and don't support settimeout
            try:
                # Try to read data chunk - use a multiple of TS packet size
                if hasattr(self.socket, 'recv'):
                    chunk = self.socket.recv(188 * 64)  # Standard socket
                else:
                    chunk = self.socket.read(188 * 64)  # SocketIO object
                
            except AttributeError:
                # Fall back to read() if recv() isn't available
                chunk = self.socket.read(188 * 64)
            
            if not chunk:
                # Connection closed by server
                logging.warning("Server closed connection")
                self._close_socket()
                self.connected = False
                return False
                
            # Process this chunk
            self._process_ts_data(chunk)
            
            # Memory management - clear any internal buffers periodically
            current_time = time.time()
            if current_time - self._last_buffer_check > 60:  # Check every minute
                self._last_buffer_check = current_time
                if len(self.recv_buffer) > 188 * 1024:  # If buffer is extremely large
                    logging.warning(f"Receive buffer unusually large ({len(self.recv_buffer)} bytes), trimming")
                    # Keep only recent data, aligned to TS packet boundary
                    keep_size = 188 * 128  # Keep reasonable buffer
                    self.recv_buffer = self.recv_buffer[-keep_size:]
            
            return True
            
        except (socket.timeout, socket.error) as e:
            # Socket error
            logging.error(f"Socket error: {e}")
            self._close_socket()
            self.connected = False
            return False
            
        except Exception as e:
            logging.error(f"Error in fetch_chunk: {e}")
            return False

class StreamBuffer:
    """Manages stream data buffering using Redis for persistence"""
    
    def __init__(self, channel_id=None, redis_client=None):
        self.channel_id = channel_id
        self.redis_client = redis_client
        self.lock = threading.Lock()
        self.index = 0
        self.TS_PACKET_SIZE = 188
        
        # Redis keys
        self.buffer_index_key = f"ts_proxy:buffer:{channel_id}:index"
        self.buffer_prefix = f"ts_proxy:buffer:{channel_id}:chunk:"
        
        # Expiration time for chunks
        self.chunk_ttl = getattr(Config, 'REDIS_CHUNK_TTL', 60)  # Default 60 seconds
        
        # Local tracking for performance
        self.local_cache = {}
        self.local_cache_size = 50  # Keep last 50 chunks in local memory
    
    def add_chunk(self, chunk):
        """Add a chunk to the buffer"""
        if not chunk:
            return False
            
        try:
            # Ensure chunk is properly aligned with TS packets
            if len(chunk) % self.TS_PACKET_SIZE != 0:
                logging.warning(f"Received non-aligned chunk of size {len(chunk)}")
                aligned_size = (len(chunk) // self.TS_PACKET_SIZE) * self.TS_PACKET_SIZE
                if (aligned_size == 0):
                    return False
                chunk = chunk[:aligned_size]
            
            with self.lock:
                # Increment index atomically
                if self.redis_client:
                    # Use Redis to store and track chunks
                    chunk_index = self.redis_client.incr(self.buffer_index_key)
                    chunk_key = f"{self.buffer_prefix}{chunk_index}"
                    self.redis_client.setex(chunk_key, self.chunk_ttl, chunk)
                    
                    # Update local tracking
                    self.index = chunk_index
                    self.local_cache[chunk_index] = chunk
                    
                    # Trim local cache if needed
                    if len(self.local_cache) > self.local_cache_size:
                        oldest = min(self.local_cache.keys())
                        del self.local_cache[oldest]
                    
                    return True
                else:
                    # Fallback to local storage if Redis not available
                    logging.warning("Redis not available, using local storage only")
                    self.index += 1
                    self.local_cache[self.index] = chunk
                    
                    if len(self.local_cache) > self.local_cache_size:
                        oldest = min(self.local_cache.keys())
                        del self.local_cache[oldest]
                    
                    return True
                    
        except Exception as e:
            logging.error(f"Error adding chunk to buffer: {e}")
            return False
    
    def get_chunks(self, start_index=None):
        """Get chunks from the buffer with detailed logging"""
        try:
            request_id = f"req_{random.randint(1000, 9999)}"
            logging.debug(f"[{request_id}] get_chunks called with start_index={start_index}")
            
            if not self.redis_client:
                # Local fallback (unchanged)
                chunks = []
                with self.lock:
                    for idx in sorted(self.local_cache.keys()):
                        if start_index is None or idx > start_index:
                            chunks.append(self.local_cache[idx])
                logging.debug(f"[{request_id}] Local fallback returned {len(chunks)} chunks")
                return chunks
            
            # If no start_index provided, use most recent chunks
            if start_index is None:
                start_index = max(0, self.index - 10)  # Start closer to current position
                logging.debug(f"[{request_id}] No start_index provided, using {start_index}")
            
            # Get current index from Redis (cached to reduce load)
            if not hasattr(self, '_last_redis_check') or time.time() - self._last_redis_check > 0.5:
                current_index = int(self.redis_client.get(self.buffer_index_key) or 0)
                self._current_index = current_index
                self._last_redis_check = time.time()
                logging.debug(f"[{request_id}] Updated buffer index from Redis: {current_index}")
            else:
                current_index = self._current_index
                logging.debug(f"[{request_id}] Using cached buffer index: {current_index}")
            
            # Calculate range of chunks to retrieve
            start_id = start_index + 1
            chunks_behind = current_index - start_id
            
            # Adaptive chunk retrieval based on how far behind
            if chunks_behind > 100:
                fetch_count = 15
                logging.debug(f"[{request_id}] Client very behind ({chunks_behind} chunks), fetching {fetch_count}")
            elif chunks_behind > 50:
                fetch_count = 10  
                logging.debug(f"[{request_id}] Client moderately behind ({chunks_behind} chunks), fetching {fetch_count}")
            elif chunks_behind > 20:
                fetch_count = 5
                logging.debug(f"[{request_id}] Client slightly behind ({chunks_behind} chunks), fetching {fetch_count}")
            else:
                fetch_count = 3
                logging.debug(f"[{request_id}] Client up-to-date (only {chunks_behind} chunks behind), fetching {fetch_count}")
            
            end_id = min(current_index + 1, start_id + fetch_count)
            
            if start_id >= end_id:
                logging.debug(f"[{request_id}] No new chunks to fetch (start_id={start_id}, end_id={end_id})")
                return []
            
            # Log the range we're retrieving
            logging.debug(f"[{request_id}] Retrieving chunks {start_id} to {end_id-1} (total: {end_id-start_id})")
            
            # Try local cache first to reduce Redis load
            chunks = []
            missing_indices = []
            
            for idx in range(start_id, end_id):
                if idx in self.local_cache:
                    chunks.append(self.local_cache[idx])
                else:
                    missing_indices.append(idx)
            
            # Log cache hit rate
            if end_id > start_id:
                cache_hit_rate = (len(chunks) / (end_id - start_id)) * 100
                logging.debug(f"[{request_id}] Local cache hit rate: {cache_hit_rate:.1f}% ({len(chunks)}/{end_id-start_id})")
            
            # Only retrieve missing chunks from Redis
            if missing_indices:
                logging.debug(f"[{request_id}] Fetching {len(missing_indices)} missing chunks from Redis")
                pipe = self.redis_client.pipeline()
                for idx in missing_indices:
                    chunk_key = f"{self.buffer_prefix}{idx}"
                    pipe.get(chunk_key)
                
                results = pipe.execute()
                
                # Count non-None results
                found_chunks = sum(1 for r in results if r is not None)
                logging.debug(f"[{request_id}] Found {found_chunks}/{len(missing_indices)} chunks in Redis")
                
                # Process results and update cache
                for i, result in enumerate(results):
                    if result:
                        idx = missing_indices[i]
                        chunks.append(result)
                        # Update local cache
                        self.local_cache[idx] = result
                    else:
                        # Log missing chunks
                        logging.warning(f"[{request_id}] Chunk {missing_indices[i]} missing from Redis")
            
            # Update local tracking
            if chunks:
                self.index = end_id - 1
                
            # Final log message
            chunk_sizes = [len(c) for c in chunks]
            total_bytes = sum(chunk_sizes) if chunks else 0
            logging.debug(f"[{request_id}] Returning {len(chunks)} chunks ({total_bytes} bytes)")
            
            return chunks
            
        except Exception as e:
            logging.error(f"Error getting chunks from buffer: {e}", exc_info=True)
            return []

    def get_chunks_exact(self, start_index, count):
        """Get exactly the requested number of chunks from given index"""
        try:
            if not self.redis_client:
                # Local fallback
                chunks = []
                with self.lock:
                    for idx in range(start_index + 1, start_index + count + 1):
                        if idx in self.local_cache:
                            chunks.append(self.local_cache[idx])
                return chunks
            
            # Calculate range to retrieve
            start_id = start_index + 1
            end_id = start_id + count
            
            # Get current buffer position
            current_index = int(self.redis_client.get(self.buffer_index_key) or 0)
            
            # If requesting beyond current buffer, return what we have
            if start_id > current_index:
                return []
                
            # Cap end at current buffer position
            end_id = min(end_id, current_index + 1)
            
            # Get chunks from local cache first
            chunks = []
            missing_indices = []
            
            for idx in range(start_id, end_id):
                if idx in self.local_cache:
                    chunks.append(self.local_cache[idx])
                else:
                    missing_indices.append(idx)
            
            # Get missing chunks from Redis
            if missing_indices:
                pipe = self.redis_client.pipeline()
                for idx in missing_indices:
                    chunk_key = f"{self.buffer_prefix}{idx}"
                    pipe.get(chunk_key)
                
                results = pipe.execute()
                
                # Process results
                for i, result in enumerate(results):
                    if result:
                        idx = missing_indices[i]
                        chunks.insert(i, result)  # Insert at correct position
                        self.local_cache[idx] = result
            
            return chunks
            
        except Exception as e:
            logging.error(f"Error getting exact chunks: {e}", exc_info=True)
            return []

class ClientManager:
    """Manages active client connections"""
    
    def __init__(self):
        self.active_clients: Set[int] = set()
        self.lock: threading.Lock = threading.Lock()
        self.last_client_time: float = time.time()
        self.cleanup_timer: Optional[threading.Timer] = None
        self._proxy_server = None
        self._channel_id = None
        
    def start_cleanup_timer(self, proxy_server, channel_id):
        """Start timer to cleanup idle channels"""
        self._proxy_server = proxy_server
        self._channel_id = channel_id
        if self.cleanup_timer:
            self.cleanup_timer.cancel()
        self.cleanup_timer = threading.Timer(
            Config.CLIENT_TIMEOUT, 
            self._cleanup_idle_channel,
            args=[proxy_server, channel_id]
        )
        self.cleanup_timer.daemon = True
        self.cleanup_timer.start()
        
    def _cleanup_idle_channel(self, proxy_server, channel_id):
        """Stop channel if no clients connected"""
        with self.lock:
            if not self.active_clients:
                logging.info(f"No clients connected for {Config.CLIENT_TIMEOUT}s, stopping channel {channel_id}")
                proxy_server.stop_channel(channel_id)

    def add_client(self, client_id: int) -> None:
        """Add new client connection"""
        with self.lock:
            self.active_clients.add(client_id)
            self.last_client_time = time.time()  # Reset the timer
            if self.cleanup_timer:
                self.cleanup_timer.cancel()  # Cancel existing timer
                self.start_cleanup_timer(self._proxy_server, self._channel_id)  # Restart timer
            logging.info(f"New client connected: {client_id} (total: {len(self.active_clients)})")

    def remove_client(self, client_id: int) -> int:
        """Remove client and return remaining count"""
        with self.lock:
            self.active_clients.remove(client_id)
            remaining = len(self.active_clients)
            logging.info(f"Client disconnected: {client_id} (remaining: {remaining})")
            return remaining

class StreamFetcher:
    """Handles stream data fetching"""
    
    def __init__(self, manager: StreamManager, buffer: StreamBuffer):
        self.manager = manager
        self.buffer = buffer

    def fetch_loop(self) -> None:
        """Main fetch loop for stream data"""
        while self.manager.running:
            try:
                if not self._handle_connection():
                    continue

                with self.manager.session.get(self.manager.url, stream=True) as response:
                    if response.status_code == 200:
                        self._handle_successful_connection()
                        self._process_stream(response)

            except requests.exceptions.RequestException as e:
                self._handle_connection_error(e)

    def _handle_connection(self) -> bool:
        """Handle connection state and retries"""
        if not self.manager.connected:
            if not self.manager.should_retry():
                logging.error(f"Failed to connect after {self.manager.max_retries} attempts")
                return False
            
            if not self.manager.running:
                return False
                
            self.manager.retry_count += 1
            logging.info(f"Connecting to stream: {self.manager.url} "
                        f"(attempt {self.manager.retry_count}/{self.manager.max_retries})")
        return True

    def _handle_successful_connection(self) -> None:
        """Handle successful stream connection"""
        if not self.manager.connected:
            logging.info("Stream connected successfully")
            self.manager.connected = True
            self.manager.retry_count = 0

    def _process_stream(self, response: requests.Response) -> None:
        """Process incoming stream data"""
        for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
            if not self.manager.running:
                logging.info("Stream fetch stopped - shutting down")
                return
                
            if chunk:
                if self.manager.ready_event.is_set():
                    logging.info("Stream switch in progress, closing connection")
                    self.manager.ready_event.clear()
                    break
                    
                with self.buffer.lock:
                    self.buffer.buffer.append(chunk)
                    self.buffer.index += 1

    def _handle_connection_error(self, error: Exception) -> None:
        """Handle stream connection errors"""
        logging.error(f"Stream connection error: {error}")
        self.manager.connected = False
        
        if not self.manager.running:
            return
            
        logging.info(f"Attempting to reconnect in {Config.RECONNECT_DELAY} seconds...")
        if not wait_for_running(self.manager, Config.RECONNECT_DELAY):
            return

def wait_for_running(manager: StreamManager, delay: float) -> bool:
    """Wait while checking manager running state"""
    start = time.time()
    while time.time() - start < delay:
        if not manager.running:
            return False
        threading.Event().wait(0.1)
    return True

class ProxyServer:
    """Manages TS proxy server instance"""
    
    def __init__(self):
        self.stream_managers = {}  # Maps channel_id to StreamManager
        self.stream_buffers = {}   # Maps channel_id to StreamBuffer
        self.client_managers = {}  # Maps channel_id to ClientManager
        self.fetch_threads = {}    # Add this missing attribute
        
        # Initialize Redis connection
        try:
            import redis
            from django.conf import settings
            
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis_client = redis.from_url(redis_url)
            logging.info(f"Connected to Redis at {redis_url}")
        except Exception as e:
            self.redis_client = None
            logging.error(f"Failed to connect to Redis: {e}")
    
    def initialize_channel(self, url, channel_id):
        """Initialize a channel with enhanced logging"""
        try:
            logging.info(f"Initializing channel {channel_id} with URL: {url}")
            
            # Clean up any existing Redis entries for this channel
            if self.redis_client:
                # Get the current state before cleanup for logging
                index_key = f"ts_proxy:buffer:{channel_id}:index"
                old_index = self.redis_client.get(index_key)
                
                # Count existing chunks for logging
                pattern = f"ts_proxy:buffer:{channel_id}:chunk:*"
                old_chunk_count = 0
                cursor = 0
                while True:
                    cursor, keys = self.redis_client.scan(cursor, pattern, 100)
                    old_chunk_count += len(keys)
                    if cursor == 0:
                        break
                
                logging.info(f"Found existing channel data: index={old_index}, chunks={old_chunk_count}")
                
                # Delete index key
                self.redis_client.delete(index_key)
                logging.debug(f"Deleted Redis index key: {index_key}")
                
                # Delete all chunks for this channel
                deleted_chunks = 0
                cursor = 0
                while True:
                    cursor, keys = self.redis_client.scan(cursor, pattern, 100)
                    if keys:
                        self.redis_client.delete(*keys)
                        deleted_chunks += len(keys)
                    if cursor == 0:
                        break
                
                logging.info(f"Deleted {deleted_chunks} Redis chunks for channel {channel_id}")
                
                # Register this channel as active
                activity_key = f"ts_proxy:active_channel:{channel_id}"
                self.redis_client.set(activity_key, "1", ex=60)
                logging.debug(f"Set channel activity key: {activity_key}")
            
            # Create buffer and stream manager
            buffer = StreamBuffer(channel_id=channel_id, redis_client=self.redis_client)
            logging.debug(f"Created StreamBuffer for channel {channel_id}")
            
            self.stream_buffers[channel_id] = buffer
            
            stream_manager = StreamManager(url, buffer)
            logging.debug(f"Created StreamManager for channel {channel_id}")
            
            self.stream_managers[channel_id] = stream_manager
            
            # Create client manager
            client_manager = ClientManager()
            self.client_managers[channel_id] = client_manager
            logging.debug(f"Created ClientManager for channel {channel_id}")
            
            # Start stream manager
            thread = threading.Thread(target=stream_manager.run, daemon=True)
            thread.name = f"stream-{channel_id}"
            thread.start()
            logging.info(f"Started stream manager thread for channel {channel_id}")
            
            return True
            
        except Exception as e:
            logging.error(f"Error initializing channel {channel_id}: {e}", exc_info=True)
            return False
    
    def stop_channel(self, channel_id):
        """Stop channel and clean up resources"""
        try:
            # Stop stream manager
            if channel_id in self.stream_managers:
                self.stream_managers[channel_id].stop()
                del self.stream_managers[channel_id]
            
            # Remove buffer
            if channel_id in self.stream_buffers:
                del self.stream_buffers[channel_id]
            
            # Cancel cleanup timer
            if channel_id in self.client_managers:
                if self.client_managers[channel_id].cleanup_timer:
                    self.client_managers[channel_id].cleanup_timer.cancel()
                del self.client_managers[channel_id]
            
            # Clean up fetch thread if exists
            if channel_id in self.fetch_threads:
                if self.fetch_threads[channel_id].is_alive():
                    # We can't forcibly terminate threads in Python,
                    # but we can make sure they're not referenced
                    pass
                del self.fetch_threads[channel_id]
            
            # Remove Redis active channel marker
            if self.redis_client:
                self.redis_client.delete(f"ts_proxy:active_channel:{channel_id}")
            
            logging.info(f"Stopped channel {channel_id}")
            return True
        except Exception as e:
            logging.error(f"Error stopping channel {channel_id}: {e}")
            return False

    def _cleanup_channel(self, channel_id: str) -> None:
        """Remove channel resources"""
        for collection in [self.stream_managers, self.stream_buffers, 
                         self.client_managers, self.fetch_threads]:
            collection.pop(channel_id, None)

    def shutdown(self) -> None:
        """Stop all channels and cleanup"""
        for channel_id in list(self.stream_managers.keys()):
            self.stop_channel(channel_id)

