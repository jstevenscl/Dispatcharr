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
        # Existing initialization code
        self.url = url
        self.buffer = buffer
        self.running = True
        self.connected = False
        self.socket = None
        self.ready_event = threading.Event()
        self.retry_count = 0
        self.max_retries = Config.MAX_RETRIES
        
        # User agent for connection
        self.user_agent = user_agent or Config.DEFAULT_USER_AGENT
        
        # TS packet handling
        self.TS_PACKET_SIZE = 188
        self.recv_buffer = bytearray()
        self.sync_found = False
        self.continuity_counters = {}
        
        # Stream health monitoring
        self.last_data_time = time.time()
        self.healthy = True
        self.health_check_interval = Config.HEALTH_CHECK_INTERVAL
        
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
        """Stop the stream manager and close all resources"""
        self.running = False
        self._close_socket()
        logging.info("Stream manager resources released")

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
        """Main execution loop with stream health monitoring"""
        try:
            # Start health monitor thread
            health_thread = threading.Thread(target=self._monitor_health, daemon=True)
            health_thread.start()
            
            current_response = None  # Track the current response object
            
            # Establish network connection
            import socket
            import requests
            
            logging.info(f"Starting stream for URL: {self.url}")
            
            while self.running:
                try:
                    # Parse URL
                    if self.url.startswith("http"):
                        # HTTP connection
                        session = self._create_session()
                        
                        try:
                            # Create an initial connection to get socket
                            response = session.get(self.url, stream=True)
                            current_response = response  # Store reference for cleanup
                            
                            if response.status_code == 200:
                                self.connected = True
                                self.socket = response.raw._fp.fp.raw
                                self.healthy = True
                                logging.info("Successfully connected to stream source")
                                
                                # Main fetch loop
                                while self.running and self.connected:
                                    if self.fetch_chunk():
                                        self.last_data_time = time.time()
                                    else:
                                        if not self.running:
                                            break
                                        time.sleep(0.1)
                            else:
                                logging.error(f"Failed to connect to stream: HTTP {response.status_code}")
                                time.sleep(2)
                        finally:
                            # Properly close response before session
                            if current_response:
                                try:
                                    # Close the response explicitly to avoid the urllib3 error
                                    current_response.close()
                                except Exception as e:
                                    logging.debug(f"Error closing response: {e}")
                                current_response = None
                            session.close()
                    else:
                        logging.error(f"Unsupported URL scheme: {self.url}")
                    
                    # Connection retry logic
                    if self.running and not self.connected:
                        self.retry_count += 1
                        if self.retry_count > self.max_retries:
                            logging.error(f"Maximum retry attempts ({self.max_retries}) exceeded")
                            break
                        
                        timeout = min(2 ** self.retry_count, 30)
                        logging.info(f"Reconnecting in {timeout} seconds... (attempt {self.retry_count})")
                        time.sleep(timeout)
                    
                except Exception as e:
                    logging.error(f"Connection error: {e}")
                    self._close_socket()
                    time.sleep(5)
                    
        except Exception as e:
            logging.error(f"Stream error: {e}")
            self._close_socket()
        finally:
            # Final cleanup
            self._close_socket()
            logging.info("Stream manager stopped")
    
    def _monitor_health(self):
        """Monitor stream health and attempt recovery if needed"""
        while self.running:
            try:
                now = time.time()
                if now - self.last_data_time > 10 and self.connected:
                    # No data for 10 seconds, mark as unhealthy
                    if self.healthy:
                        logging.warning("Stream health check: No data received for 10+ seconds")
                        self.healthy = False
                    
                    # After 30 seconds with no data, force reconnection
                    if now - self.last_data_time > 30:
                        logging.warning("Stream appears dead, forcing reconnection")
                        self._close_socket()
                        self.connected = False
                        self.last_data_time = time.time()  # Reset timer for the reconnect
                elif self.connected and not self.healthy:
                    # Stream is receiving data again after being unhealthy
                    logging.info("Stream health restored, receiving data again")
                    self.healthy = True
                    
            except Exception as e:
                logging.error(f"Error in health monitor: {e}")
                
            time.sleep(self.health_check_interval)
    
    def _close_socket(self):
        """Close the socket connection safely"""
        if self.socket:
            try:
                self.socket.close()
            except Exception as e:
                logging.debug(f"Error closing socket: {e}")
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
        
        # Initialize from Redis if available (important for non-owner workers)
        if self.redis_client and channel_id:
            try:
                current_index = self.redis_client.get(self.buffer_index_key)
                if current_index:
                    self.index = int(current_index)
                    logging.info(f"Initialized buffer from Redis with index {self.index}")
            except Exception as e:
                logging.error(f"Error initializing buffer from Redis: {e}")
    
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
                    
                    # Update local tracking of position only
                    self.index = chunk_index
                    return True
                else:
                    # No Redis - can't function in multi-worker mode
                    logging.error("Redis not available, cannot store chunks")
                    return False
                    
        except Exception as e:
            logging.error(f"Error adding chunk to buffer: {e}")
            return False
    
    def get_chunks(self, start_index=None):
        """Get chunks from the buffer with detailed logging"""
        try:
            request_id = f"req_{random.randint(1000, 9999)}"
            logging.debug(f"[{request_id}] get_chunks called with start_index={start_index}")
            
            if not self.redis_client:
                logging.error("Redis not available, cannot retrieve chunks")
                return []
            
            # If no start_index provided, use most recent chunks
            if start_index is None:
                start_index = max(0, self.index - 10)  # Start closer to current position
                logging.debug(f"[{request_id}] No start_index provided, using {start_index}")
            
            # Get current index from Redis
            current_index = int(self.redis_client.get(self.buffer_index_key) or 0)
            
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
            
            # Directly fetch from Redis using pipeline for efficiency
            pipe = self.redis_client.pipeline()
            for idx in range(start_id, end_id):
                chunk_key = f"{self.buffer_prefix}{idx}"
                pipe.get(chunk_key)
            
            results = pipe.execute()
            
            # Process results
            chunks = [result for result in results if result is not None]
            
            # Count non-None results
            found_chunks = len(chunks)
            missing_chunks = len(results) - found_chunks
            
            if missing_chunks > 0:
                logging.debug(f"[{request_id}] Missing {missing_chunks}/{len(results)} chunks in Redis")
            
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
                logging.error("Redis not available, cannot retrieve chunks")
                return []
            
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
            
            # Directly fetch from Redis using pipeline
            pipe = self.redis_client.pipeline()
            for idx in range(start_id, end_id):
                chunk_key = f"{self.buffer_prefix}{idx}"
                pipe.get(chunk_key)
            
            results = pipe.execute()
            
            # Filter out None results
            chunks = [result for result in results if result is not None]
            
            # Update local index if needed
            if chunks and start_id + len(chunks) - 1 > self.index:
                self.index = start_id + len(chunks) - 1
            
            return chunks
            
        except Exception as e:
            logging.error(f"Error getting exact chunks: {e}", exc_info=True)
            return []

class ClientManager:
    """Manages connected clients for a channel with activity tracking"""
    
    def __init__(self):
        self.clients = set()
        self.lock = threading.Lock()
        self.last_active_time = time.time()
    
    def add_client(self, client_id):
        """Add a client to this channel"""
        with self.lock:
            self.clients.add(client_id)
            self.last_active_time = time.time()
            logging.info(f"New client connected: {client_id} (total: {len(self.clients)})")
        return len(self.clients)
    
    def remove_client(self, client_id):
        """Remove a client from this channel and return remaining count"""
        with self.lock:
            if client_id in self.clients:
                self.clients.remove(client_id)
            self.last_active_time = time.time()  # Update activity time on disconnect too
            logging.info(f"Client disconnected: {client_id} (remaining: {len(self.clients)})")
        return len(self.clients)
    
    def get_client_count(self):
        """Get current client count"""
        with self.lock:
            return len(self.clients)

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
    """Manages TS proxy server instance with worker coordination"""
    
    def __init__(self):
        """Initialize proxy server with worker identification"""
        self.stream_managers = {}
        self.stream_buffers = {}
        self.client_managers = {}
        
        # Generate a unique worker ID
        import socket
        import os
        pid = os.getpid()
        hostname = socket.gethostname()
        self.worker_id = f"{hostname}:{pid}"
        
        # Connect to Redis
        self.redis_client = None
        try:
            import redis
            from django.conf import settings
            
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis_client = redis.from_url(redis_url)
            logging.info(f"Connected to Redis at {redis_url}")
            logging.info(f"Worker ID: {self.worker_id}")
        except Exception as e:
            self.redis_client = None
            logging.error(f"Failed to connect to Redis: {e}")
        
        # Start cleanup thread
        self.cleanup_interval = getattr(Config, 'CLEANUP_INTERVAL', 60)
        self._start_cleanup_thread()
    
    def get_channel_owner(self, channel_id):
        """Get the worker ID that owns this channel with proper error handling"""
        if not self.redis_client:
            return None
        
        try:
            lock_key = f"ts_proxy:channel:{channel_id}:owner"
            owner = self.redis_client.get(lock_key)
            if owner:
                return owner.decode('utf-8')
            return None
        except Exception as e:
            logging.error(f"Error getting channel owner: {e}")
            return None
    
    def am_i_owner(self, channel_id):
        """Check if this worker is the owner of the channel"""
        owner = self.get_channel_owner(channel_id)
        return owner == self.worker_id
    
    def try_acquire_ownership(self, channel_id, ttl=30):
        """Try to become the owner of this channel using proper locking"""
        if not self.redis_client:
            return True  # If no Redis, always become owner
            
        try:
            # Create a lock key with proper namespace
            lock_key = f"ts_proxy:channel:{channel_id}:owner"
            
            # Use Redis SETNX for atomic locking - only succeeds if the key doesn't exist
            acquired = self.redis_client.setnx(lock_key, self.worker_id)
            
            # If acquired, set expiry to prevent orphaned locks
            if acquired:
                self.redis_client.expire(lock_key, ttl)
                logging.info(f"Worker {self.worker_id} acquired ownership of channel {channel_id}")
                return True
            
            # If not acquired, check if we already own it (might be a retry)
            current_owner = self.redis_client.get(lock_key)
            if current_owner and current_owner.decode('utf-8') == self.worker_id:
                # Refresh TTL
                self.redis_client.expire(lock_key, ttl)
                logging.info(f"Worker {self.worker_id} refreshed ownership of channel {channel_id}")
                return True
                
            # Someone else owns it
            return False
            
        except Exception as e:
            logging.error(f"Error acquiring channel ownership: {e}")
            return False
    
    def release_ownership(self, channel_id):
        """Release ownership of this channel safely"""
        if not self.redis_client:
            return
            
        try:
            lock_key = f"ts_proxy:channel:{channel_id}:owner"
            
            # Only delete if we're the current owner to prevent race conditions
            current = self.redis_client.get(lock_key)
            if current and current.decode('utf-8') == self.worker_id:
                self.redis_client.delete(lock_key)
                logging.info(f"Released ownership of channel {channel_id}")
        except Exception as e:
            logging.error(f"Error releasing channel ownership: {e}")
    
    def extend_ownership(self, channel_id, ttl=30):
        """Extend ownership lease with grace period"""
        if not self.redis_client:
            return False
            
        try:
            lock_key = f"ts_proxy:channel:{channel_id}:owner" 
            current = self.redis_client.get(lock_key)
            
            # Only extend if we're still the owner
            if current and current.decode('utf-8') == self.worker_id:
                self.redis_client.expire(lock_key, ttl)
                return True
            return False
        except Exception as e:
            logging.error(f"Error extending ownership: {e}")
            return False
    
    def initialize_channel(self, url, channel_id, user_agent=None):
        """Initialize a channel with improved worker coordination"""
        try:
            # Get channel URL from Redis if available
            channel_url = url
            channel_user_agent = user_agent
            
            if self.redis_client:
                # Store stream metadata - can be done regardless of ownership
                metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
                if url:  # Only update URL if one is provided
                    self.redis_client.hset(metadata_key, "url", url)
                if user_agent:
                    self.redis_client.hset(metadata_key, "user_agent", user_agent)
                
                # If no url was passed, try to get from Redis
                if not url:
                    url_bytes = self.redis_client.hget(metadata_key, "url")
                    if url_bytes:
                        channel_url = url_bytes.decode('utf-8')
                    
                    ua_bytes = self.redis_client.hget(metadata_key, "user_agent")
                    if ua_bytes:
                        channel_user_agent = ua_bytes.decode('utf-8')
            
            # Check if channel is already owned
            current_owner = self.get_channel_owner(channel_id)
            
            # Exit early if another worker owns the channel
            if current_owner and current_owner != self.worker_id:
                logging.info(f"Channel {channel_id} already owned by worker {current_owner}")
                logging.info(f"This worker ({self.worker_id}) will read from Redis buffer only")
                
                # Create buffer but not stream manager
                buffer = StreamBuffer(channel_id=channel_id, redis_client=self.redis_client)
                self.stream_buffers[channel_id] = buffer
                
                # Create client manager
                client_manager = ClientManager()
                self.client_managers[channel_id] = client_manager
                
                return True
            
            # Only continue with full initialization if URL is provided
            # or we can get it from Redis
            if not channel_url:
                logging.error(f"No URL available for channel {channel_id}")
                return False
            
            # Try to acquire ownership with Redis locking
            if not self.try_acquire_ownership(channel_id):
                # Another worker just acquired ownership
                logging.info(f"Another worker just acquired ownership of channel {channel_id}")
                
                # Create buffer but not stream manager
                buffer = StreamBuffer(channel_id=channel_id, redis_client=self.redis_client)
                self.stream_buffers[channel_id] = buffer
                
                # Create client manager
                client_manager = ClientManager()
                self.client_managers[channel_id] = client_manager
                
                return True
            
            # We now own the channel - create stream manager
            logging.info(f"Worker {self.worker_id} is now the owner of channel {channel_id}")
            
            # Create stream buffer
            buffer = StreamBuffer(channel_id=channel_id, redis_client=self.redis_client)
            logging.debug(f"Created StreamBuffer for channel {channel_id}")
            self.stream_buffers[channel_id] = buffer
            
            # Create stream manager (actual connection to provider)
            stream_manager = StreamManager(channel_url, buffer, user_agent=channel_user_agent)
            logging.debug(f"Created StreamManager for channel {channel_id}")
            self.stream_managers[channel_id] = stream_manager
            
            # Create client manager
            client_manager = ClientManager()
            self.client_managers[channel_id] = client_manager
            
            # Set channel activity key (separate from lock key)
            if self.redis_client:
                activity_key = f"ts_proxy:active_channel:{channel_id}"
                self.redis_client.set(activity_key, "1", ex=300)
            
            # Start stream manager thread
            thread = threading.Thread(target=stream_manager.run, daemon=True)
            thread.name = f"stream-{channel_id}"
            thread.start()
            logging.info(f"Started stream manager thread for channel {channel_id}")
            
            return True
            
        except Exception as e:
            logging.error(f"Error initializing channel {channel_id}: {e}", exc_info=True)
            # Release ownership on failure
            self.release_ownership(channel_id)
            return False

    def check_if_channel_exists(self, channel_id):
        """Check if a channel exists by checking metadata and locks"""
        if not self.redis_client:
            return channel_id in self.stream_managers
        
        # Check both metadata and lock keys
        metadata_exists = self.redis_client.exists(f"ts_proxy:channel:{channel_id}:metadata")
        owner_exists = self.redis_client.exists(f"ts_proxy:channel:{channel_id}:owner")
        activity_exists = self.redis_client.exists(f"ts_proxy:active_channel:{channel_id}")
        
        return metadata_exists or owner_exists or activity_exists

    def stop_channel(self, channel_id):
        """Stop a channel with proper ownership handling"""
        try:
            logging.info(f"Stopping channel {channel_id}")
            
            # Only stop the actual stream manager if we're the owner
            if self.am_i_owner(channel_id):
                if channel_id in self.stream_managers:
                    stream_manager = self.stream_managers[channel_id]
                    
                    # Signal thread to stop and close resources
                    if hasattr(stream_manager, 'stop'):
                        stream_manager.stop()
                    else:
                        stream_manager.running = False
                        if hasattr(stream_manager, '_close_socket'):
                            stream_manager._close_socket()
                
                # Release ownership
                self.release_ownership(channel_id)
            
            # Always clean up local resources
            if channel_id in self.stream_managers:
                del self.stream_managers[channel_id]
            
            if channel_id in self.stream_buffers:
                del self.stream_buffers[channel_id]
            
            if channel_id in self.client_managers:
                del self.client_managers[channel_id]
            
            # Clean up shared Redis data only if no other workers are using this channel
            if self.redis_client:
                # Check if any worker still owns this channel
                if not self.redis_client.exists(f"ts_proxy:channel:{channel_id}:owner"):
                    # No owner, safe to remove Redis data
                    self.redis_client.delete(f"ts_proxy:channel:{channel_id}")
                    self.redis_client.delete(f"ts_proxy:active_channel:{channel_id}")
                    logging.info(f"Removed Redis data for channel {channel_id}")
            
            return True
        except Exception as e:
            logging.error(f"Error stopping channel {channel_id}: {e}", exc_info=True)
            return False

    def check_inactive_channels(self):
        """Check for inactive channels (no clients) and stop them"""
        channels_to_stop = []
        
        for channel_id, client_manager in self.client_managers.items():
            if client_manager.get_client_count() == 0:
                channels_to_stop.append(channel_id)
        
        for channel_id in channels_to_stop:
            logging.info(f"Auto-stopping inactive channel {channel_id}")
            self.stop_channel(channel_id)

    def _cleanup_channel(self, channel_id: str) -> None:
        """Remove channel resources"""
        for collection in [self.stream_managers, self.stream_buffers, 
                         self.client_managers, self.fetch_threads]:
            collection.pop(channel_id, None)

    def shutdown(self) -> None:
        """Stop all channels and cleanup"""
        for channel_id in list(self.stream_managers.keys()):
            self.stop_channel(channel_id)

    def _start_cleanup_thread(self):
        """Start background thread to maintain ownership and clean up resources"""
        def cleanup_task():
            # Initial delay to let initialization complete
            time.sleep(10)
            
            while True:
                try:
                    # Extend ownership for channels we own
                    for channel_id in list(self.stream_managers.keys()):
                        if self.am_i_owner(channel_id):
                            self.extend_ownership(channel_id)
                    
                    # Check for inactive channels but ONLY those we own
                    channels_to_stop = []
                    for channel_id, client_manager in self.client_managers.items():
                        # Only stop channels we own and that have no clients
                        if self.am_i_owner(channel_id) and client_manager.get_client_count() == 0:
                            # Make sure it's been inactive for a while
                            if hasattr(client_manager, 'last_active_time'):
                                inactive_seconds = time.time() - client_manager.last_active_time
                                if inactive_seconds > 30:  # 30 seconds grace period
                                    channels_to_stop.append(channel_id)
                            else:
                                channels_to_stop.append(channel_id)
                    
                    for channel_id in channels_to_stop:
                        logging.info(f"Auto-stopping inactive channel {channel_id}")
                        self.stop_channel(channel_id)
                    
                except Exception as e:
                    logging.error(f"Error in cleanup thread: {e}")
                
                # Sleep at the end
                time.sleep(self.cleanup_interval)
        
        thread = threading.Thread(target=cleanup_task, daemon=True)
        thread.name = "ts-proxy-cleanup"
        thread.start()
        logging.info(f"Started TS proxy cleanup thread (interval: {self.cleanup_interval}s)")

