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
import json
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
        """Update stream URL and reconnect"""
        if new_url == self.url:
            return False
            
        logging.info(f"Switching stream URL from {self.url} to {new_url}")
        self.url = new_url
        self.connected = False
        self._close_socket()  # Close existing connection
        
        # Signal health monitor to reconnect immediately
        self.last_data_time = 0
        
        return True

    def should_retry(self) -> bool:
        """Check if connection retry is allowed"""
        return self.retry_count < self.max_retries

    def stop(self) -> None:
        """Stop the stream manager and close all resources"""
        self.running = False
        self._close_socket()
        logging.info("Stream manager resources released")

    def _process_complete_packets(self):
        """Process TS packets with improved resync capability"""
        try:
            # Enhanced sync byte detection with re-sync capability
            if (not self.sync_found or 
                (len(self.recv_buffer) >= 188 and self.recv_buffer[0] != 0x47)):
                
                # Need to find sync pattern if we haven't found it yet or lost sync
                if len(self.recv_buffer) >= 376:  # Need at least 2 packet lengths
                    sync_found = False
                    
                    # Look for at least two sync bytes (0x47) at 188-byte intervals
                    for i in range(min(188, len(self.recv_buffer) - 188)):
                        if (self.recv_buffer[i] == 0x47 and 
                            self.recv_buffer[i + 188] == 0x47):
                            
                            # If already had sync but lost it, log the issue
                            if self.sync_found:
                                logging.warning(f"Re-syncing TS stream at position {i} (lost sync)")
                            else:
                                logging.debug(f"TS sync found at position {i}")
                                
                            # Trim buffer to start at first sync byte
                            self.recv_buffer = self.recv_buffer[i:]
                            self.sync_found = True
                            sync_found = True
                            break
                            
                    # If we couldn't find sync in this buffer, discard partial data
                    if not sync_found:
                        logging.warning(f"Failed to find sync pattern - discarding {len(self.recv_buffer) - 188} bytes")
                        if len(self.recv_buffer) > 188:
                            self.recv_buffer = self.recv_buffer[-188:]  # Keep last chunk for next attempt
                        return False
                            
            # If we don't have a complete packet yet, wait for more data
            if len(self.recv_buffer) < 188:
                return False
                
            # Calculate how many complete packets we have
            packet_count = len(self.recv_buffer) // 188
            
            if packet_count == 0:
                return False
            
            # Verify all packets have sync bytes
            all_synced = True
            for i in range(0, packet_count):
                if self.recv_buffer[i * 188] != 0x47:
                    all_synced = False
                    break
                    
            # If not all packets are synced, re-scan for sync
            if not all_synced:
                self.sync_found = False  # Force re-sync on next call
                return False
            
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
                    # Don't process misaligned packets
                    return False
                
                before_index = self.buffer.index
                success = self.buffer.add_chunk(bytes(packets))
                after_index = self.buffer.index
                
                # Log successful write
                if success:
                    logging.debug(f"Added chunk: {packet_count} packets, buffer index {before_index} → {after_index}")
                else:
                    logging.warning("Failed to add chunk to buffer")
                    
                # If successful, update last data timestamp in Redis
                if success and hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                    last_data_key = f"ts_proxy:channel:{self.buffer.channel_id}:last_data"
                    self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)  # 1 minute expiry
                
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
            # Check if buffer already has data - in which case we might not need to connect
            if hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                buffer_index = self.buffer.redis_client.get(f"ts_proxy:buffer:{self.buffer.channel_id}:index")
                if buffer_index and int(buffer_index) > 0:
                    # There's already data in Redis, check if it's recent (within last 10 seconds)
                    last_data_key = f"ts_proxy:channel:{self.buffer.channel_id}:last_data"
                    last_data = self.buffer.redis_client.get(last_data_key)
                    if last_data:
                        last_time = float(last_data)
                        if time.time() - last_time < 10:
                            logging.info(f"Recent data found in Redis, no need to reconnect")
                            self.connected = True
                            self.healthy = True
                            return
            
            # Start health monitor thread
            health_thread = threading.Thread(target=self._monitor_health, daemon=True)
            health_thread.start()
            
            current_response = None  # Track the current response object
            current_session = None   # Track the current session
            
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
                        current_session = session
                        
                        try:
                            # Create an initial connection to get socket
                            response = session.get(self.url, stream=True)
                            current_response = response
                            
                            if response.status_code == 200:
                                self.connected = True
                                self.socket = response.raw._fp.fp.raw
                                self.healthy = True
                                logging.info("Successfully connected to stream source")
                                
                                # Connection successful - START GRACE PERIOD HERE
                                self._set_waiting_for_clients()
                                
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
                            
                            if current_session:
                                try:
                                    current_session.close()
                                except Exception as e:
                                    logging.debug(f"Error closing session: {e}")
                                current_session = None
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

    def _set_waiting_for_clients(self):
        """Set channel state to waiting for clients after successful connection"""
        try:
            if hasattr(self.buffer, 'channel_id') and hasattr(self.buffer, 'redis_client'):
                channel_id = self.buffer.channel_id
                redis_client = self.buffer.redis_client
                
                if channel_id and redis_client:
                    # Set state to waiting
                    state_key = f"ts_proxy:channel:{channel_id}:state"
                    redis_client.set(state_key, "waiting_for_clients")
                    
                    # Set grace period start time
                    grace_key = f"ts_proxy:channel:{channel_id}:grace_start"
                    redis_client.setex(grace_key, 120, str(time.time()))
                    
                    # Get configured grace period or default
                    grace_period = getattr(Config, 'CHANNEL_INIT_GRACE_PERIOD', 20)
                    
                    logging.info(f"Started initial connection grace period ({grace_period}s) for channel {channel_id}")
                    
        except Exception as e:
            logging.error(f"Error setting waiting for clients state: {e}")

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
    """Manages connected clients for a channel with cross-worker visibility"""
    
    def __init__(self, channel_id, redis_client=None, worker_id=None):
        self.channel_id = channel_id
        self.redis_client = redis_client
        self.worker_id = worker_id  # Store worker_id directly
        self.clients = set()  # Local clients only
        self.lock = threading.Lock()
        self.last_active_time = time.time()
        self.client_set_key = f"ts_proxy:channel:{channel_id}:clients"
        self.client_ttl = getattr(Config, 'CLIENT_RECORD_TTL', 60)
        self.heartbeat_interval = getattr(Config, 'CLIENT_HEARTBEAT_INTERVAL', 10)
        self.last_heartbeat_time = {}  # Track last heartbeat time per client
        
        # Start heartbeat thread for local clients
        self._start_heartbeat_thread()
    
    def _start_heartbeat_thread(self):
        """Start thread to regularly refresh client presence in Redis"""
        def heartbeat_task():
            while True:
                try:
                    # Wait for the interval
                    time.sleep(self.heartbeat_interval)
                    
                    # Send heartbeat for all local clients
                    with self.lock:
                        if not self.clients or not self.redis_client:
                            continue
                            
                        # Use pipeline for efficiency
                        pipe = self.redis_client.pipeline()
                        current_time = time.time()
                        
                        # For each client, update its TTL and timestamp
                        for client_id in self.clients:
                            # Skip if we just sent a heartbeat recently
                            if client_id in self.last_heartbeat_time:
                                time_since_last = current_time - self.last_heartbeat_time[client_id]
                                if time_since_last < self.heartbeat_interval * 0.8:
                                    continue
                            
                            # Update the client's individual key with new TTL
                            client_key = f"ts_proxy:client:{self.channel_id}:{client_id}"
                            pipe.setex(client_key, self.client_ttl, str(current_time))
                            
                            # Keep client in the set with TTL
                            pipe.sadd(self.client_set_key, client_id)
                            
                            # Update last activity timestamp in a separate key
                            activity_key = f"ts_proxy:client:{self.channel_id}:{client_id}:last_active"
                            pipe.setex(activity_key, self.client_ttl, str(current_time))
                            
                            # Track last heartbeat locally
                            self.last_heartbeat_time[client_id] = current_time
                        
                        # Always refresh the TTL on the set itself
                        pipe.expire(self.client_set_key, self.client_ttl)
                        
                        # Execute all commands atomically
                        pipe.execute()
                        
                        # Notify channel owner of client activity
                        self._notify_owner_of_activity()
                        
                except Exception as e:
                    logging.error(f"Error in client heartbeat thread: {e}")
                
        thread = threading.Thread(target=heartbeat_task, daemon=True)
        thread.name = f"client-heartbeat-{self.channel_id}"
        thread.start()
        logging.debug(f"Started client heartbeat thread for channel {self.channel_id} (interval: {self.heartbeat_interval}s)")
    
    def _notify_owner_of_activity(self):
        """Notify channel owner that clients are active on this worker"""
        if not self.redis_client or not self.clients:
            return
            
        try:
            # Use the stored worker_id
            worker_id = self.worker_id or "unknown"
                
            # Store count of clients on this worker
            worker_key = f"ts_proxy:channel:{self.channel_id}:worker:{worker_id}"
            self.redis_client.setex(worker_key, self.client_ttl, str(len(self.clients)))
            
            # Update channel activity timestamp
            activity_key = f"ts_proxy:channel:{self.channel_id}:activity"
            self.redis_client.setex(activity_key, self.client_ttl, str(time.time()))
        except Exception as e:
            logging.error(f"Error notifying owner of client activity: {e}")
    
    def add_client(self, client_id):
        """Add a client to this channel locally and in Redis"""
        with self.lock:
            self.clients.add(client_id)
            self.last_active_time = time.time()
            
            # Track in Redis if available
            if self.redis_client:
                current_time = str(time.time())
                
                # Add to channel's client set
                self.redis_client.sadd(self.client_set_key, client_id)
                
                # Set TTL on the whole set
                self.redis_client.expire(self.client_set_key, self.client_ttl)
                
                # Set up client key with timestamp as value
                client_key = f"ts_proxy:client:{self.channel_id}:{client_id}"
                self.redis_client.setex(client_key, self.client_ttl, current_time)
                
                # Also track last activity time separately
                activity_key = f"ts_proxy:client:{self.channel_id}:{client_id}:last_active"
                self.redis_client.setex(activity_key, self.client_ttl, current_time)
                
                # Clear any initialization timer by removing the init_time key
                init_key = f"ts_proxy:channel:{self.channel_id}:init_time"
                self.redis_client.delete(init_key)
                
                # Update worker count in Redis
                self._notify_owner_of_activity()
                
                # Also publish an event that the client connected
                event_data = json.dumps({
                    "event": "client_connected",
                    "channel_id": self.channel_id,
                    "client_id": client_id,
                    "worker_id": self.worker_id or "unknown",
                    "timestamp": time.time()
                })
                self.redis_client.publish(f"ts_proxy:events:{self.channel_id}", event_data)
                
            # Get total clients across all workers
            total_clients = self.get_total_client_count()
            logging.info(f"New client connected: {client_id} (local: {len(self.clients)}, total: {total_clients})")
            
            # Record last heartbeat time
            self.last_heartbeat_time[client_id] = time.time()
            
        return len(self.clients)
    
    def remove_client(self, client_id):
        """Remove a client from this channel and Redis"""
        with self.lock:
            if client_id in self.clients:
                self.clients.remove(client_id)
                
            if client_id in self.last_heartbeat_time:
                del self.last_heartbeat_time[client_id]
                
            self.last_active_time = time.time()
            
            # Remove from Redis
            if self.redis_client:
                # Remove from channel's client set
                self.redis_client.srem(self.client_set_key, client_id)
                
                # Delete individual client keys
                client_key = f"ts_proxy:client:{self.channel_id}:{client_id}"
                activity_key = f"ts_proxy:client:{self.channel_id}:{client_id}:last_active"
                self.redis_client.delete(client_key, activity_key)
                
                # Update worker count in Redis
                self._notify_owner_of_activity()
                
                # Also publish an event that the client disconnected
                event_data = json.dumps({
                    "event": "client_disconnected",
                    "channel_id": self.channel_id,
                    "client_id": client_id,
                    "worker_id": self.worker_id or "unknown",
                    "timestamp": time.time()
                })
                self.redis_client.publish(f"ts_proxy:events:{self.channel_id}", event_data)
            
            # Get remaining clients across all workers
            total_clients = self.get_total_client_count()
            logging.info(f"Client disconnected: {client_id} (local: {len(self.clients)}, total: {total_clients})")
            
        return len(self.clients)
    
    def get_client_count(self):
        """Get local client count"""
        with self.lock:
            return len(self.clients)
    
    def get_total_client_count(self):
        """Get total client count across all workers"""
        if not self.redis_client:
            return len(self.clients)
            
        try:
            # Count members in the client set
            return self.redis_client.scard(self.client_set_key) or 0
        except Exception as e:
            logging.error(f"Error getting total client count: {e}")
            return len(self.clients)  # Fall back to local count
            
    def refresh_client_ttl(self):
        """Refresh TTL for active clients to prevent expiration"""
        if not self.redis_client:
            return
            
        try:
            # Refresh TTL for all clients belonging to this worker
            for client_id in self.clients:
                client_key = f"ts_proxy:client:{self.channel_id}:{client_id}"
                self.redis_client.expire(client_key, self.client_ttl)
                
            # Refresh TTL on the set itself
            self.redis_client.expire(self.client_set_key, self.client_ttl)
        except Exception as e:
            logging.error(f"Error refreshing client TTL: {e}")

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
        
        # Start event listener for Redis pubsub messages
        self._start_event_listener()
    
    def _start_event_listener(self):
        """Listen for events from other workers"""
        if not self.redis_client:
            return
            
        def event_listener():
            try:
                pubsub = self.redis_client.pubsub()
                pubsub.psubscribe("ts_proxy:events:*")
                
                logging.info("Started Redis event listener for client activity")
                
                for message in pubsub.listen():
                    if message["type"] != "pmessage":
                        continue
                        
                    try:
                        channel = message["channel"].decode("utf-8")
                        data = json.loads(message["data"].decode("utf-8"))
                        
                        event_type = data.get("event")
                        channel_id = data.get("channel_id")
                        
                        if channel_id and event_type:
                            # For owner, update client status immediately
                            if self.am_i_owner(channel_id):
                                if event_type == "client_connected":
                                    logging.debug(f"Owner received client_connected event for channel {channel_id}")
                                    # Reset any no-clients timer
                                    no_clients_key = f"ts_proxy:channel:{channel_id}:no_clients_since"
                                    self.redis_client.delete(no_clients_key)
                                    
                                elif event_type == "client_disconnected":
                                    logging.debug(f"Owner received client_disconnected event for channel {channel_id}")
                                    # Check if any clients remain
                                    if channel_id in self.client_managers:
                                        total = self.client_managers[channel_id].get_total_client_count()
                                        if total == 0:
                                            logging.info(f"No clients left after disconnect event, starting shutdown timer")
                                            # Start the no-clients timer
                                            no_clients_key = f"ts_proxy:channel:{channel_id}:no_clients_since"
                                            self.redis_client.setex(no_clients_key, 60, str(time.time()))
                            elif event_type == "stream_switch":
                                logging.info(f"Owner received stream switch request for channel {channel_id}")
                                # Handle stream switch request
                                new_url = data.get("url")
                                user_agent = data.get("user_agent")
                                
                                if new_url and channel_id in self.stream_managers:
                                    # Update metadata in Redis
                                    if self.redis_client:
                                        metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
                                        self.redis_client.hset(metadata_key, "url", new_url)
                                        if user_agent:
                                            self.redis_client.hset(metadata_key, "user_agent", user_agent)
                                        
                                        # Set switch status
                                        status_key = f"ts_proxy:channel:{channel_id}:switch_status"
                                        self.redis_client.set(status_key, "switching")
                                    
                                    # Perform the stream switch
                                    stream_manager = self.stream_managers[channel_id]
                                    success = stream_manager.update_url(new_url)
                                    
                                    if success:
                                        logging.info(f"Stream switch initiated for channel {channel_id}")
                                        
                                        # Publish confirmation
                                        switch_result = {
                                            "event": "stream_switched",
                                            "channel_id": channel_id,
                                            "success": True,
                                            "url": new_url,
                                            "timestamp": time.time()
                                        }
                                        self.redis_client.publish(
                                            f"ts_proxy:events:{channel_id}", 
                                            json.dumps(switch_result)
                                        )
                                        
                                        # Update status
                                        if self.redis_client:
                                            self.redis_client.set(status_key, "switched")
                                    else:
                                        logging.error(f"Failed to switch stream for channel {channel_id}")
                                        
                                        # Publish failure
                                        switch_result = {
                                            "event": "stream_switched",
                                            "channel_id": channel_id,
                                            "success": False,
                                            "url": new_url,
                                            "timestamp": time.time()
                                        }
                                        self.redis_client.publish(
                                            f"ts_proxy:events:{channel_id}", 
                                            json.dumps(switch_result)
                                        )
                    except Exception as e:
                        logging.error(f"Error processing event message: {e}")
            except Exception as e:
                logging.error(f"Error in event listener: {e}")
                time.sleep(5)  # Wait before reconnecting
                # Try to restart the listener
                self._start_event_listener()
                
        thread = threading.Thread(target=event_listener, daemon=True)
        thread.name = "redis-event-listener"
        thread.start()

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
                
                # FIXED: Use hash operations consistently - don't mix string and hash operations
                # Create a dictionary of values to set in the hash
                metadata = {}
                if url:  # Only include URL if provided
                    metadata["url"] = url
                if user_agent:
                    metadata["user_agent"] = user_agent
                    
                # Initialize state
                metadata["state"] = "initializing"
                metadata["init_time"] = str(time.time())
                
                # Set the hash fields all at once
                if metadata:
                    self.redis_client.hset(metadata_key, mapping=metadata)
                    
                # Set expiration on the hash
                self.redis_client.expire(metadata_key, 3600)  # 1 hour TTL
                
                # Set activity key as a separate key
                activity_key = f"ts_proxy:active_channel:{channel_id}"
                self.redis_client.setex(activity_key, 300, "1")  # 5 min TTL
                
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
                
                # Create client manager with channel_id and redis_client
                client_manager = ClientManager(channel_id=channel_id, redis_client=self.redis_client, worker_id=self.worker_id)
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
                
                # Create client manager with channel_id and redis_client
                client_manager = ClientManager(channel_id=channel_id, redis_client=self.redis_client, worker_id=self.worker_id)
                self.client_managers[channel_id] = client_manager
                
                return True
            
            # We now own the channel - create stream manager
            logging.info(f"Worker {self.worker_id} is now the owner of channel {channel_id}")
            
            # Create stream buffer
            buffer = StreamBuffer(channel_id=channel_id, redis_client=self.redis_client)
            logging.debug(f"Created StreamBuffer for channel {channel_id}")
            self.stream_buffers[channel_id] = buffer
            
            # Only the owner worker creates the actual stream manager
            stream_manager = StreamManager(channel_url, buffer, user_agent=channel_user_agent)
            logging.debug(f"Created StreamManager for channel {channel_id}")
            self.stream_managers[channel_id] = stream_manager
            
            # Create client manager with channel_id, redis_client AND worker_id
            client_manager = ClientManager(
                channel_id=channel_id, 
                redis_client=self.redis_client,
                worker_id=self.worker_id
            )
            self.client_managers[channel_id] = client_manager
            
            # Set channel activity key (separate from lock key)
            if self.redis_client:
                activity_key = f"ts_proxy:active_channel:{channel_id}"
                self.redis_client.set(activity_key, "1", ex=300)
            
            # Start stream manager thread only for the owner
            thread = threading.Thread(target=stream_manager.run, daemon=True)
            thread.name = f"stream-{channel_id}"
            thread.start()
            logging.info(f"Started stream manager thread for channel {channel_id}")
            
            # If we're the owner, we need to set the channel state rather than starting a grace period immediately
            if self.am_i_owner(channel_id):
                # Set channel state to "connecting"
                if self.redis_client:
                    state_key = f"ts_proxy:channel:{channel_id}:state"
                    self.redis_client.set(state_key, "connecting")
                    
                    # Set connection start time for monitoring
                    connect_key = f"ts_proxy:channel:{channel_id}:connect_time"
                    self.redis_client.setex(connect_key, 60, str(time.time()))
                    
                    logging.info(f"Channel {channel_id} in connecting state - will start grace period after connection")
                    
            # SIMPLE CHANNEL REGISTRY - register this channel as active
            if self.redis_client:
                # Use a simple key for active channel registration
                registry_key = f"ts_proxy:active_channels:{channel_id}"
                # Store basic info and set a longer TTL (5 minutes)
                channel_info = {
                    "url": url if url else "",
                    "init_time": str(time.time()),
                    "owner": self.worker_id
                }
                self.redis_client.hset(registry_key, mapping=channel_info)
                self.redis_client.expire(registry_key, 300)  # 5 minute TTL
                
                logging.info(f"Registered channel {channel_id} in active channels registry")
            
            return True
            
        except Exception as e:
            logging.error(f"Error initializing channel {channel_id}: {e}", exc_info=True)
            # Release ownership on failure
            self.release_ownership(channel_id)
            return False

    def check_if_channel_exists(self, channel_id):
        """Simple check if a channel exists using the registry"""
        # Check local memory first (quick check)
        if channel_id in self.stream_managers or channel_id in self.stream_buffers:
            return True
            
        # Simple registry check in Redis
        if self.redis_client:
            registry_key = f"ts_proxy:active_channels:{channel_id}"
            return bool(self.redis_client.exists(registry_key))
            
        return False

    def stop_channel(self, channel_id):
        """Stop a channel with proper ownership handling"""
        try:
            logging.info(f"Stopping channel {channel_id}")
            
            # Only stop the actual stream manager if we're the owner
            if self.am_i_owner(channel_id):
                logging.info(f"This worker ({self.worker_id}) is the owner - closing provider connection")
                if channel_id in self.stream_managers:
                    stream_manager = self.stream_managers[channel_id]
                    
                    # Signal thread to stop and close resources
                    if hasattr(stream_manager, 'stop'):
                        stream_manager.stop()
                    else:
                        stream_manager.running = False
                        if hasattr(stream_manager, '_close_socket'):
                            stream_manager._close_socket()
                
                # Wait for stream thread to finish
                stream_thread_name = f"stream-{channel_id}"
                stream_thread = None
                
                for thread in threading.enumerate():
                    if thread.name == stream_thread_name:
                        stream_thread = thread
                        break
                
                if stream_thread and stream_thread.is_alive():
                    logging.info(f"Waiting for stream thread to terminate")
                    try:
                        # Very short timeout to prevent hanging the app
                        stream_thread.join(timeout=2.0)
                        if stream_thread.is_alive():
                            logging.warning(f"Stream thread did not terminate within timeout")
                    except RuntimeError:
                        logging.debug("Could not join stream thread (may be current thread)")
                
                # Release ownership
                self.release_ownership(channel_id)
                logging.info(f"Released ownership of channel {channel_id}")
            
            # Always clean up local resources
            if channel_id in self.stream_managers:
                del self.stream_managers[channel_id]
                logging.info(f"Removed stream manager for channel {channel_id}")
            
            if channel_id in self.stream_buffers:
                del self.stream_buffers[channel_id]
                logging.info(f"Removed stream buffer for channel {channel_id}")
            
            if channel_id in self.client_managers:
                del self.client_managers[channel_id]
                logging.info(f"Removed client manager for channel {channel_id}")
            
            # Clean up Redis keys
            self._clean_redis_keys(channel_id)
            
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
            while True:
                try:
                    # For channels we own, check total clients and cleanup as needed
                    for channel_id in list(self.stream_managers.keys()):
                        if self.am_i_owner(channel_id):
                            # Extend ownership lease
                            self.extend_ownership(channel_id)
                            
                            # Get channel state
                            channel_state = "unknown"
                            if self.redis_client:
                                state_bytes = self.redis_client.get(f"ts_proxy:channel:{channel_id}:state")
                                if state_bytes:
                                    channel_state = state_bytes.decode('utf-8')
                            
                            # Check if channel has any clients left
                            if channel_id in self.client_managers:
                                client_manager = self.client_managers[channel_id]
                                total_clients = client_manager.get_total_client_count()
                                
                                # If in waiting_for_clients state, check if grace period expired
                                if channel_state == "waiting_for_clients" and total_clients == 0:
                                    grace_key = f"ts_proxy:channel:{channel_id}:grace_start"
                                    grace_start = None
                                    
                                    if self.redis_client:
                                        grace_value = self.redis_client.get(grace_key)
                                        if grace_value:
                                            grace_start = float(grace_value.decode('utf-8'))
                                    
                                    if grace_start:
                                        grace_period = getattr(Config, 'CHANNEL_INIT_GRACE_PERIOD', 20)
                                        grace_elapsed = time.time() - grace_start
                                        
                                        if grace_elapsed > grace_period:
                                            logging.info(f"No clients connected within grace period ({grace_elapsed:.1f}s > {grace_period}s), stopping channel {channel_id}")
                                            self.stop_channel(channel_id)
                                        else:
                                            logging.debug(f"Channel {channel_id} in grace period - {grace_elapsed:.1f}s of {grace_period}s elapsed, waiting for clients")
                                            
                                # If active and no clients, start normal shutdown procedure
                                elif channel_state not in ["connecting", "waiting_for_clients"] and total_clients == 0:
                                    # Check if there's a pending no-clients timeout
                                    key = f"ts_proxy:channel:{channel_id}:no_clients_since"
                                    no_clients_since = None
                                    
                                    if self.redis_client:
                                        no_clients_value = self.redis_client.get(key)
                                        if no_clients_value:
                                            no_clients_since = float(no_clients_value.decode('utf-8'))
                                    
                                    current_time = time.time()
                                    
                                    if not no_clients_since:
                                        # First time seeing zero clients, set timestamp
                                        if self.redis_client:
                                            self.redis_client.setex(key, Config.CLIENT_RECORD_TTL, str(current_time))
                                        logging.info(f"No clients detected for channel {channel_id}, starting shutdown timer")
                                    elif current_time - no_clients_since > getattr(Config, 'CHANNEL_SHUTDOWN_DELAY', 5):
                                        # We've had no clients for the shutdown delay period
                                        logging.info(f"No clients for {current_time - no_clients_since:.1f}s, stopping channel {channel_id}")
                                        self.stop_channel(channel_id)
                                else:
                                    # There are clients or we're still connecting - clear any no-clients timestamp
                                    if self.redis_client:
                                        self.redis_client.delete(f"ts_proxy:channel:{channel_id}:no_clients_since")
                    
                    # Rest of the cleanup thread...
                    
                    # Refresh active channel registry
                    self.refresh_channel_registry()
                    
                except Exception as e:
                    logging.error(f"Error in cleanup thread: {e}", exc_info=True)
                
                time.sleep(getattr(Config, 'CLEANUP_CHECK_INTERVAL', 1))
        
        thread = threading.Thread(target=cleanup_task, daemon=True)
        thread.name = "ts-proxy-cleanup"
        thread.start()
        logging.info(f"Started TS proxy cleanup thread (interval: {getattr(Config, 'CLEANUP_CHECK_INTERVAL', 3)}s)")

    def _check_orphaned_channels(self):
        """Check for orphaned channels in Redis (owner worker crashed)"""
        if not self.redis_client:
            return
            
        try:
            # Get all active channel keys
            channel_pattern = "ts_proxy:channel:*:metadata"
            channel_keys = self.redis_client.keys(channel_pattern)
            
            for key in channel_keys:
                try:
                    channel_id = key.decode('utf-8').split(':')[2]
                    
                    # Skip channels we already have locally
                    if channel_id in self.stream_buffers:
                        continue
                        
                    # Check if this channel has an owner
                    owner = self.get_channel_owner(channel_id)
                    
                    if not owner:
                        # Check if there are any clients
                        client_set_key = f"ts_proxy:channel:{channel_id}:clients"
                        client_count = self.redis_client.scard(client_set_key) or 0
                        
                        if client_count > 0:
                            # Orphaned channel with clients - we could take ownership
                            logging.info(f"Found orphaned channel {channel_id} with {client_count} clients")
                        else:
                            # Orphaned channel with no clients - clean it up
                            logging.info(f"Cleaning up orphaned channel {channel_id}")
                            self._clean_redis_keys(channel_id)
                except Exception as e:
                    logging.error(f"Error processing channel key {key}: {e}")
                    
        except Exception as e:
            logging.error(f"Error checking orphaned channels: {e}")

    def _clean_redis_keys(self, channel_id):
        """Clean up all Redis keys for a channel"""
        if not self.redis_client:
            return
            
        try:
            # Delete metadata and related keys
            keys_to_delete = [
                f"ts_proxy:channel:{channel_id}:metadata",
                f"ts_proxy:channel:{channel_id}:owner",
                f"ts_proxy:active_channel:{channel_id}",
                f"ts_proxy:buffer:{channel_id}:index",
                f"ts_proxy:channel:{channel_id}:last_data",
                f"ts_proxy:channel:{channel_id}:clients",
                f"ts_proxy:channel:{channel_id}:no_clients_since"
            ]
            
            if keys_to_delete:
                self.redis_client.delete(*keys_to_delete)
                
            # Delete chunk keys with pattern matching
            chunk_pattern = f"ts_proxy:buffer:{channel_id}:chunk:*"
            chunk_keys = self.redis_client.keys(chunk_pattern)
            if chunk_keys:
                self.redis_client.delete(*chunk_keys)
                
            logging.info(f"Cleaned up Redis keys for channel {channel_id}")
        except Exception as e:
            logging.error(f"Error cleaning Redis keys for channel {channel_id}: {e}")

    def refresh_channel_registry(self):
        """Refresh TTL for active channels in registry"""
        if not self.redis_client:
            return
            
        # Refresh registry entries for channels we own
        for channel_id in self.stream_managers.keys():
            registry_key = f"ts_proxy:active_channels:{channel_id}"
            if self.redis_client.exists(registry_key):
                # Update last_active timestamp and extend TTL
                self.redis_client.hset(registry_key, "last_active", str(time.time()))
                self.redis_client.expire(registry_key, 300)  # 5 minute TTL

