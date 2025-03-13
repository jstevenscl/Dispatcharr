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
    """Manages a connection to a TS stream without using raw sockets"""
    
    def __init__(self, url, buffer, user_agent=None):
        # Basic properties
        self.url = url
        self.buffer = buffer
        self.running = True
        self.connected = False
        self.retry_count = 0
        self.max_retries = Config.MAX_RETRIES
        self.current_response = None
        self.current_session = None
        
        # User agent for connection
        self.user_agent = user_agent or Config.DEFAULT_USER_AGENT
        
        # Stream health monitoring
        self.last_data_time = time.time()
        self.healthy = True
        self.health_check_interval = Config.HEALTH_CHECK_INTERVAL
        self.chunk_size = getattr(Config, 'CHUNK_SIZE', 8192)
        
        logging.info(f"Initialized stream manager for channel {buffer.channel_id}")
    
    def _create_session(self):
        """Create and configure requests session with optimal settings"""
        session = requests.Session()
        
        # Configure session headers
        session.headers.update({
            'User-Agent': self.user_agent,
            'Connection': 'keep-alive'
        })
        
        # Set up connection pooling for better performance
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=1,     # Single connection for this stream
            pool_maxsize=1,         # Max size of connection pool
            max_retries=3,          # Auto-retry for failed requests
            pool_block=False        # Don't block when pool is full
        )
        
        # Apply adapter to both HTTP and HTTPS
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        
        return session
    
    def run(self):
        """Main execution loop using HTTP streaming with improved connection handling"""
        try:
            # Start health monitor thread
            health_thread = threading.Thread(target=self._monitor_health, daemon=True)
            health_thread.start()
            
            logging.info(f"Starting stream for URL: {self.url}")
            
            while self.running:
                try:
                    # Create new session for each connection attempt
                    session = self._create_session()
                    self.current_session = session
                    
                    # Stream the URL with proper timeout handling
                    response = session.get(
                        self.url, 
                        stream=True,
                        timeout=(10, 60)  # 10s connect timeout, 60s read timeout
                    )
                    self.current_response = response
                    
                    if response.status_code == 200:
                        self.connected = True
                        self.healthy = True
                        logging.info("Successfully connected to stream source")
                        
                        # Set channel state to waiting for clients
                        self._set_waiting_for_clients()
                        
                        # Process the stream in chunks with improved error handling
                        try:
                            chunk_count = 0
                            for chunk in response.iter_content(chunk_size=self.chunk_size):
                                if not self.running:
                                    break
                                    
                                if chunk:
                                    # Add chunk to buffer with TS packet alignment
                                    success = self.buffer.add_chunk(chunk)
                                    
                                    if success:
                                        self.last_data_time = time.time()
                                        chunk_count += 1
                                        
                                        # Update last data timestamp in Redis
                                        if hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                                            last_data_key = f"ts_proxy:channel:{self.buffer.channel_id}:last_data"
                                            self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)
                        except AttributeError as e:
                            # Handle the specific 'NoneType' object has no attribute 'read' error
                            if "'NoneType' object has no attribute 'read'" in str(e):
                                logging.warning(f"Connection closed by server (read {chunk_count} chunks before disconnect)")
                            else:
                                # Re-raise unexpected AttributeError
                                raise
                    else:
                        logging.error(f"Failed to connect to stream: HTTP {response.status_code}")
                        time.sleep(2)
                        
                except requests.exceptions.ReadTimeout:
                    logging.warning("Read timeout - server stopped sending data")
                    self.connected = False
                    time.sleep(1)
                    
                except requests.RequestException as e:
                    logging.error(f"HTTP request error: {e}")
                    self.connected = False
                    time.sleep(5)
                    
                finally:
                    # Clean up response and session
                    if self.current_response:
                        try:
                            self.current_response.close()
                        except Exception as e:
                            logging.debug(f"Error closing response: {e}")
                        self.current_response = None
                        
                    if self.current_session:
                        try:
                            self.current_session.close()
                        except Exception as e:
                            logging.debug(f"Error closing session: {e}")
                        self.current_session = None
                
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
            logging.error(f"Stream error: {e}", exc_info=True)
        finally:
            self.connected = False
            
            if self.current_response:
                try:
                    self.current_response.close()
                except:
                    pass
                    
            if self.current_session:
                try:
                    self.current_session.close() 
                except:
                    pass
                
            logging.info("Stream manager stopped")
    
    def stop(self):
        """Stop the stream manager and clean up resources"""
        self.running = False
        
        if self.current_response:
            try:
                self.current_response.close()
            except:
                pass
                
        if self.current_session:
            try:
                self.current_session.close()
            except:
                pass
                
        logging.info("Stream manager resources released")

    def update_url(self, new_url):
        """Update stream URL and reconnect with HTTP streaming approach"""
        if new_url == self.url:
            logging.info(f"URL unchanged: {new_url}")
            return False
            
        logging.info(f"Switching stream URL from {self.url} to {new_url}")
        
        # Close existing HTTP connection resources instead of socket
        self._close_connection()  # Use our new method instead of _close_socket
        
        # Update URL and reset connection state
        old_url = self.url
        self.url = new_url
        self.connected = False
        
        # Reset retry counter to allow immediate reconnect
        self.retry_count = 0
        
        return True

    def should_retry(self) -> bool:
        """Check if connection retry is allowed"""
        return self.retry_count < self.max_retries

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
    
    def _close_connection(self):
        """Close HTTP connection resources"""
        # Close response if it exists
        if hasattr(self, 'current_response') and self.current_response:
            try:
                self.current_response.close()
            except Exception as e:
                logging.debug(f"Error closing response: {e}")
            self.current_response = None
            
        # Close session if it exists
        if hasattr(self, 'current_session') and self.current_session:
            try:
                self.current_session.close()
            except Exception as e:
                logging.debug(f"Error closing session: {e}")
            self.current_session = None

    # Keep backward compatibility - let's create an alias to the new method
    def _close_socket(self):
        """Backward compatibility wrapper for _close_connection"""
        return self._close_connection()

    def fetch_chunk(self):
        """Fetch data from socket with direct pass-through to buffer"""
        if not self.connected or not self.socket:
            return False
            
        try:
            # Read data chunk - no need to align with TS packet size anymore
            try:
                # Try to read data chunk
                if hasattr(self.socket, 'recv'):
                    chunk = self.socket.recv(Config.CHUNK_SIZE)  # Standard socket
                else:
                    chunk = self.socket.read(Config.CHUNK_SIZE)  # SocketIO object
                
            except AttributeError:
                # Fall back to read() if recv() isn't available
                chunk = self.socket.read(Config.CHUNK_SIZE)
            
            if not chunk:
                # Connection closed by server
                logging.warning("Server closed connection")
                self._close_socket()
                self.connected = False
                return False
                
            # Add directly to buffer without TS-specific processing
            success = self.buffer.add_chunk(chunk)
            
            # Update last data timestamp in Redis if successful
            if success and hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                last_data_key = f"ts_proxy:channel:{self.buffer.channel_id}:last_data"
                self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)
            
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
                    current_time = str(time.time())
                    
                    # SIMPLIFIED: Always use direct Redis update for reliability
                    metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
                    
                    # Check current state first
                    current_state = None
                    try:
                        metadata = redis_client.hgetall(metadata_key)
                        if metadata and b'state' in metadata:
                            current_state = metadata[b'state'].decode('utf-8')
                    except Exception as e:
                        logging.error(f"Error checking current state: {e}")
                    
                    # Only update if not already past connecting
                    if not current_state or current_state in ["initializing", "connecting"]:
                        # Update directly - don't rely on proxy_server reference
                        update_data = {
                            "state": "waiting_for_clients",
                            "connection_ready_time": current_time,
                            "state_changed_at": current_time
                        }
                        redis_client.hset(metadata_key, mapping=update_data)
                        
                        # Get configured grace period or default
                        grace_period = getattr(Config, 'CHANNEL_INIT_GRACE_PERIOD', 20)
                        logging.info(f"STREAM MANAGER: Updated channel {channel_id} state: {current_state or 'None'} → waiting_for_clients")
                        logging.info(f"Started initial connection grace period ({grace_period}s) for channel {channel_id}")
                    else:
                        logging.debug(f"Not changing state: channel {channel_id} already in {current_state} state")
        except Exception as e:
            logging.error(f"Error setting waiting for clients state: {e}")

    def _read_stream(self):
        """Read from stream with minimal processing"""
        try:
            # Read up to CHUNK_SIZE bytes
            chunk = self.sock.recv(self.CHUNK_SIZE)
            
            if not chunk:
                # Connection closed
                logging.debug("Connection closed by remote host")
                return False
                
            # If we got data, just add it directly to the buffer 
            if chunk:
                success = self.buffer.add_chunk(chunk)
                
                # Update last data timestamp in Redis if successful
                if success and hasattr(self.buffer, 'redis_client') and self.buffer.redis_client:
                    last_data_key = f"ts_proxy:channel:{self.buffer.channel_id}:last_data"
                    self.buffer.redis_client.set(last_data_key, str(time.time()), ex=60)  # 1 minute expiry
                
                return success
            return True
            
        except socket.timeout:
            # Expected timeout - no data available
            return True
        except Exception as e:
            # Error reading from socket
            logging.error(f"Error reading from stream: {e}")
            return False

class StreamBuffer:
    """Manages stream data buffering using Redis for persistence"""
    
    # Add a memory buffer to collect data before writing to Redis
    def __init__(self, channel_id=None, redis_client=None):
        self.channel_id = channel_id
        self.redis_client = redis_client
        self.lock = threading.Lock()
        self.index = 0
        self.TS_PACKET_SIZE = 188
        
        # STANDARDIZED KEYS: Move buffer keys under channel namespace
        self.buffer_index_key = f"ts_proxy:channel:{channel_id}:buffer:index"
        self.buffer_prefix = f"ts_proxy:channel:{channel_id}:buffer:chunk:"
        
        self.chunk_ttl = getattr(Config, 'REDIS_CHUNK_TTL', 60)
        
        # Initialize from Redis if available
        if self.redis_client and channel_id:
            try:
                current_index = self.redis_client.get(self.buffer_index_key)
                if current_index:
                    self.index = int(current_index)
                    logging.info(f"Initialized buffer from Redis with index {self.index}")
            except Exception as e:
                logging.error(f"Error initializing buffer from Redis: {e}")
        
        self._write_buffer = bytearray()
        self.target_chunk_size = getattr(Config, 'BUFFER_CHUNK_SIZE', 188 * 5644)  # ~1MB default
        
    def add_chunk(self, chunk):
        """Add data with optimized Redis storage"""
        if not chunk:
            return False
            
        try:
            # Accumulate partial packets between chunks
            if not hasattr(self, '_partial_packet'):
                self._partial_packet = bytearray()
                
            # Combine with any previous partial packet
            combined_data = bytearray(self._partial_packet) + bytearray(chunk)
            
            # Calculate complete packets
            complete_packets_size = (len(combined_data) // 188) * 188
            
            if complete_packets_size == 0:
                # Not enough data for a complete packet
                self._partial_packet = combined_data
                return True
                
            # Split into complete packets and remainder
            complete_packets = combined_data[:complete_packets_size]
            self._partial_packet = combined_data[complete_packets_size:]
            
            # Add completed packets to write buffer
            self._write_buffer.extend(complete_packets)
            
            # Only write to Redis when we have enough data for an optimized chunk
            writes_done = 0
            with self.lock:
                while len(self._write_buffer) >= self.target_chunk_size:
                    # Extract a full chunk
                    chunk_data = self._write_buffer[:self.target_chunk_size]
                    self._write_buffer = self._write_buffer[self.target_chunk_size:]
                    
                    # Write optimized chunk to Redis
                    if self.redis_client:
                        try:
                            chunk_index = self.redis_client.incr(self.buffer_index_key)
                            chunk_key = f"{self.buffer_prefix}{chunk_index}"
                            setex_result = self.redis_client.setex(chunk_key, self.chunk_ttl, bytes(chunk_data))
                            
                            if not setex_result:
                                logging.error(f"Redis SETEX failed for chunk {chunk_index}")
                                continue
                                
                            # Update local tracking
                            self.index = chunk_index
                            writes_done += 1
                            
                        except Exception as e:
                            logging.error(f"Redis operation failed in add_chunk: {e}")
                            return False
                
            if writes_done > 0:
                logging.debug(f"Added {writes_done} optimized chunks ({self.target_chunk_size} bytes each) to Redis")
                
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

    def stop(self):
        """Stop the buffer and flush any remaining data"""
        try:
            # Flush any remaining data in the write buffer
            if hasattr(self, '_write_buffer') and len(self._write_buffer) > 0:
                # Ensure remaining data is aligned to TS packets
                complete_size = (len(self._write_buffer) // 188) * 188
                
                if complete_size > 0:
                    final_chunk = self._write_buffer[:complete_size]
                    
                    # Write final chunk to Redis
                    with self.lock:
                        if self.redis_client:
                            try:
                                chunk_index = self.redis_client.incr(self.buffer_index_key)
                                chunk_key = f"{self.buffer_prefix}{chunk_index}"
                                self.redis_client.setex(chunk_key, self.chunk_ttl, bytes(final_chunk))
                                self.index = chunk_index
                                logging.info(f"Flushed final chunk of {len(final_chunk)} bytes to Redis")
                            except Exception as e:
                                logging.error(f"Error flushing final chunk: {e}")
                
                # Clear buffers
                self._write_buffer = bytearray()
                if hasattr(self, '_partial_packet'):
                    self._partial_packet = bytearray()
                    
        except Exception as e:
            logging.error(f"Error during buffer stop: {e}")

class ClientManager:
    """Manages connected clients for a channel with cross-worker visibility"""
    
    def __init__(self, channel_id, redis_client=None, worker_id=None):
        self.channel_id = channel_id
        self.redis_client = redis_client
        self.worker_id = worker_id
        self.clients = set()
        self.lock = threading.Lock()
        self.last_active_time = time.time()
        
        # STANDARDIZED KEYS: Move client set under channel namespace
        self.client_set_key = f"ts_proxy:channel:{channel_id}:clients"
        self.client_ttl = getattr(Config, 'CLIENT_RECORD_TTL', 60)
        self.heartbeat_interval = getattr(Config, 'CLIENT_HEARTBEAT_INTERVAL', 10)
        self.last_heartbeat_time = {}
        
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
                        
                        # IMPROVED GHOST DETECTION: Check for stale clients before sending heartbeats
                        current_time = time.time()
                        clients_to_remove = set()
                        
                        # First identify clients that should be removed
                        for client_id in self.clients:
                            client_key = f"ts_proxy:channel:{self.channel_id}:clients:{client_id}"
                            
                            # Check if client exists in Redis at all
                            exists = self.redis_client.exists(client_key)
                            if not exists:
                                # Client entry has expired in Redis but still in our local set
                                logging.warning(f"Found ghost client {client_id} - expired in Redis but still in local set")
                                clients_to_remove.add(client_id)
                                continue
                                
                            # Check for stale activity using last_active field
                            last_active = self.redis_client.hget(client_key, "last_active")
                            if last_active:
                                last_active_time = float(last_active.decode('utf-8'))
                                time_since_activity = current_time - last_active_time
                                
                                # If client hasn't been active for too long, mark for removal
                                # Use configurable threshold for detection
                                ghost_threshold = getattr(Config, 'GHOST_CLIENT_MULTIPLIER', 5.0)
                                if time_since_activity > self.heartbeat_interval * ghost_threshold:
                                    logging.warning(f"Detected ghost client {client_id} - last active {time_since_activity:.1f}s ago")
                                    clients_to_remove.add(client_id)
                        
                        # Remove ghost clients in a separate step
                        for client_id in clients_to_remove:
                            self.remove_client(client_id)
                        
                        if clients_to_remove:
                            logging.info(f"Removed {len(clients_to_remove)} ghost clients from channel {self.channel_id}")
                        
                        # Now send heartbeats only for remaining clients
                        pipe = self.redis_client.pipeline()
                        current_time = time.time()
                        
                        for client_id in self.clients:
                            # Skip clients we just marked for removal
                            if client_id in clients_to_remove:
                                continue
                                
                            # Skip if we just sent a heartbeat recently
                            if client_id in self.last_heartbeat_time:
                                time_since_last = current_time - self.last_heartbeat_time[client_id]
                                if time_since_last < self.heartbeat_interval * 0.8:
                                    continue
                            
                            # Only update clients that remain
                            client_key = f"ts_proxy:channel:{self.channel_id}:clients:{client_id}"
                            pipe.hset(client_key, "last_active", str(current_time))
                            pipe.expire(client_key, self.client_ttl)
                            
                            # Keep client in the set with TTL
                            pipe.sadd(self.client_set_key, client_id)
                            pipe.expire(self.client_set_key, self.client_ttl)
                            
                            # Track last heartbeat locally
                            self.last_heartbeat_time[client_id] = current_time
                        
                        # Execute all commands atomically
                        pipe.execute()
                        
                        # Only notify if we have real clients
                        if self.clients and not all(c in clients_to_remove for c in self.clients):
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
            worker_id = self.worker_id or "unknown"
                
            # STANDARDIZED KEY: Worker info under channel namespace
            worker_key = f"ts_proxy:channel:{self.channel_id}:worker:{worker_id}"
            self.redis_client.setex(worker_key, self.client_ttl, str(len(self.clients)))
            
            # STANDARDIZED KEY: Activity timestamp under channel namespace
            activity_key = f"ts_proxy:channel:{self.channel_id}:activity"
            self.redis_client.setex(activity_key, self.client_ttl, str(time.time()))
        except Exception as e:
            logging.error(f"Error notifying owner of client activity: {e}")
    
    def add_client(self, client_id, user_agent=None):
        """Add a client to this channel locally and in Redis"""
        with self.lock:
            self.clients.add(client_id)
            self.last_active_time = time.time()
            
            if self.redis_client:
                current_time = str(time.time())
                
                # Add to channel's client set
                self.redis_client.sadd(self.client_set_key, client_id)
                self.redis_client.expire(self.client_set_key, self.client_ttl)
                
                # STANDARDIZED KEY: Individual client under channel namespace
                client_key = f"ts_proxy:channel:{self.channel_id}:clients:{client_id}"
                
                # Store client info as a hash with all info in one place
                client_data = {
                    "last_active": current_time,
                    "worker_id": self.worker_id or "unknown",
                    "connect_time": current_time
                }
                
                # Add user agent if provided
                if user_agent:
                    client_data["user_agent"] = user_agent
                    
                # Use HSET to store client data as a hash
                self.redis_client.hset(client_key, mapping=client_data)
                self.redis_client.expire(client_key, self.client_ttl)
                
                # Clear any initialization timer
                self.redis_client.delete(f"ts_proxy:channel:{self.channel_id}:init_time")
                
                self._notify_owner_of_activity()
                
                # Publish client connected event with user agent
                event_data = {
                    "event": "client_connected",
                    "channel_id": self.channel_id,
                    "client_id": client_id,
                    "worker_id": self.worker_id or "unknown",
                    "timestamp": time.time()
                }
                
                if user_agent:
                    event_data["user_agent"] = user_agent
                    logging.debug(f"Storing user agent '{user_agent}' for client {client_id}")
                else:
                    logging.debug(f"No user agent provided for client {client_id}")
                self.redis_client.publish(
                    f"ts_proxy:events:{self.channel_id}", 
                    json.dumps(event_data)
                )
                
            # Get total clients across all workers
            total_clients = self.get_total_client_count()
            logging.info(f"New client connected: {client_id} (local: {len(self.clients)}, total: {total_clients})")
            
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
            
            if self.redis_client:
                # Remove from channel's client set
                self.redis_client.srem(self.client_set_key, client_id)
                
                # STANDARDIZED KEY: Delete individual client keys
                client_key = f"ts_proxy:channel:{self.channel_id}:clients:{client_id}"
                self.redis_client.delete(client_key)
                
                # Check if this was the last client
                remaining = self.redis_client.scard(self.client_set_key) or 0
                if remaining == 0:
                    logging.warning(f"Last client removed: {client_id} - channel may shut down soon")
                    
                    # Trigger disconnect time tracking even if we're not the owner
                    disconnect_key = f"ts_proxy:channel:{self.channel_id}:last_client_disconnect_time"
                    self.redis_client.setex(disconnect_key, 60, str(time.time()))
                
                self._notify_owner_of_activity()
                
                # Publish client disconnected event
                event_data = json.dumps({
                    "event": "client_disconnected",
                    "channel_id": self.channel_id,
                    "client_id": client_id,
                    "worker_id": self.worker_id or "unknown",
                    "timestamp": time.time(),
                    "remaining_clients": remaining
                })
                self.redis_client.publish(f"ts_proxy:events:{self.channel_id}", event_data)
            
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
                # STANDARDIZED: Use channel namespace for client keys
                client_key = f"ts_proxy:channel:{self.channel_id}:clients:{client_id}"
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
                                    # Reset any disconnect timer
                                    # RENAMED: no_clients_since → last_client_disconnect_time
                                    disconnect_key = f"ts_proxy:channel:{channel_id}:last_client_disconnect_time"
                                    self.redis_client.delete(disconnect_key)
                                    
                                elif event_type == "client_disconnected":
                                    logging.debug(f"Owner received client_disconnected event for channel {channel_id}")
                                    # Check if any clients remain
                                    if channel_id in self.client_managers:
                                        # VERIFY REDIS CLIENT COUNT DIRECTLY
                                        client_set_key = f"ts_proxy:channel:{channel_id}:clients"
                                        total = self.redis_client.scard(client_set_key) or 0
                                        
                                        if total == 0:
                                            logging.debug(f"No clients left after disconnect event - stopping channel {channel_id}")
                                            # Set the disconnect timer for other workers to see
                                            disconnect_key = f"ts_proxy:channel:{channel_id}:last_client_disconnect_time"
                                            self.redis_client.setex(disconnect_key, 60, str(time.time()))
                                            
                                            # Get configured shutdown delay or default
                                            shutdown_delay = getattr(Config, 'CHANNEL_SHUTDOWN_DELAY', 0)
                                            
                                            if shutdown_delay > 0:
                                                logging.info(f"Waiting {shutdown_delay}s before stopping channel...")
                                                time.sleep(shutdown_delay)
                                                
                                                # Re-check client count before stopping
                                                total = self.redis_client.scard(client_set_key) or 0
                                                if total > 0:
                                                    logging.info(f"New clients connected during shutdown delay - aborting shutdown")
                                                    self.redis_client.delete(disconnect_key)
                                                    return
                                            
                                            # Stop the channel directly
                                            self.stop_channel(channel_id)


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
        """Initialize a channel without redundant active key"""
        try:
            # Get channel URL from Redis if available
            channel_url = url
            channel_user_agent = user_agent
            
            # First check if channel metadata already exists
            existing_metadata = None
            metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
            
            if self.redis_client:
                existing_metadata = self.redis_client.hgetall(metadata_key)
                
                # If no url was passed, try to get from Redis
                if not url and existing_metadata:
                    url_bytes = existing_metadata.get(b'url')
                    if url_bytes:
                        channel_url = url_bytes.decode('utf-8')
                    
                    ua_bytes = existing_metadata.get(b'user_agent')
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
            
            # We now own the channel - ONLY NOW should we set metadata with initializing state
            logging.info(f"Worker {self.worker_id} is now the owner of channel {channel_id}")
            
            if self.redis_client:
                # NOW create or update metadata with initializing state
                metadata = {
                    "url": channel_url,
                    "init_time": str(time.time()),
                    "last_active": str(time.time()),
                    "owner": self.worker_id,
                    "state": "initializing"  # Only the owner sets this initial state
                }
                if channel_user_agent:
                    metadata["user_agent"] = channel_user_agent
                    
                # Set channel metadata
                self.redis_client.hset(metadata_key, mapping=metadata)
                self.redis_client.expire(metadata_key, 3600)  # 1 hour TTL
            
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
            
            # Start stream manager thread only for the owner
            thread = threading.Thread(target=stream_manager.run, daemon=True)
            thread.name = f"stream-{channel_id}"
            thread.start()
            logging.info(f"Started stream manager thread for channel {channel_id}")
            
            # If we're the owner, we need to set the channel state rather than starting a grace period immediately
            if self.am_i_owner(channel_id):
                self.update_channel_state(channel_id, "connecting", {
                    "init_time": str(time.time()),
                    "owner": self.worker_id
                })
                
                # Set connection attempt start time
                attempt_key = f"ts_proxy:channel:{channel_id}:connection_attempt_time"
                self.redis_client.setex(attempt_key, 60, str(time.time()))
                
                logging.info(f"Channel {channel_id} in connecting state - will start grace period after connection")            
            return True
            
        except Exception as e:
            logging.error(f"Error initializing channel {channel_id}: {e}", exc_info=True)
            # Release ownership on failure
            self.release_ownership(channel_id)
            return False

    def check_if_channel_exists(self, channel_id):
        """Check if a channel exists using standardized key structure"""
        # Check local memory first
        if channel_id in self.stream_managers or channel_id in self.stream_buffers:
            return True
            
        # Check Redis using the standard key pattern
        if self.redis_client:
            # Primary check - look for channel metadata
            metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
            
            # If metadata exists, return true
            if self.redis_client.exists(metadata_key):
                return True
                    
            # Additional checks if metadata doesn't exist
            additional_keys = [
                f"ts_proxy:channel:{channel_id}:clients",
                f"ts_proxy:channel:{channel_id}:buffer:index",
                f"ts_proxy:channel:{channel_id}:owner"
            ]
            
            for key in additional_keys:
                if self.redis_client.exists(key):
                    return True
                    
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
                            
                            # Get channel state from metadata hash
                            channel_state = "unknown"
                            if self.redis_client:
                                metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
                                metadata = self.redis_client.hgetall(metadata_key)
                                if metadata and b'state' in metadata:
                                    channel_state = metadata[b'state'].decode('utf-8')

                            # Check if channel has any clients left
                            total_clients = 0
                            if channel_id in self.client_managers:
                                client_manager = self.client_managers[channel_id]
                                total_clients = client_manager.get_total_client_count()
                                
                            # Log client count periodically
                            if time.time() % 30 < 1:  # Every ~30 seconds
                                logging.info(f"Channel {channel_id} has {total_clients} clients, state: {channel_state}")
                                
                            # If in connecting or waiting_for_clients state, check grace period
                            if channel_state in ["connecting", "waiting_for_clients"]:
                                # Get connection ready time from metadata
                                connection_ready_time = None
                                if metadata and b'connection_ready_time' in metadata:
                                    try:
                                        connection_ready_time = float(metadata[b'connection_ready_time'].decode('utf-8'))
                                    except (ValueError, TypeError):
                                        pass
                                    
                                # If still connecting, give it more time
                                if channel_state == "connecting":
                                    logging.debug(f"Channel {channel_id} still connecting - not checking for clients yet")
                                    continue
                                    
                                # If waiting for clients, check grace period
                                if connection_ready_time:
                                    grace_period = getattr(Config, 'CHANNEL_INIT_GRACE_PERIOD', 20)
                                    time_since_ready = time.time() - connection_ready_time
                                    
                                    # Add this debug log
                                    logging.debug(f"GRACE PERIOD CHECK: Channel {channel_id} in {channel_state} state, " 
                                                 f"time_since_ready={time_since_ready:.1f}s, grace_period={grace_period}s, "
                                                 f"total_clients={total_clients}")
                                    
                                    if time_since_ready <= grace_period:
                                        # Still within grace period
                                        logging.debug(f"Channel {channel_id} in grace period - {time_since_ready:.1f}s of {grace_period}s elapsed")
                                        continue
                                    elif total_clients == 0:
                                        # Grace period expired with no clients
                                        logging.info(f"Grace period expired ({time_since_ready:.1f}s > {grace_period}s) with no clients - stopping channel {channel_id}")
                                        self.stop_channel(channel_id)
                                    else:
                                        # Grace period expired but we have clients - mark channel as active
                                        logging.info(f"Grace period expired with {total_clients} clients - marking channel {channel_id} as active")
                                        old_state = "unknown"
                                        if metadata and b'state' in metadata:
                                            old_state = metadata[b'state'].decode('utf-8')
                                        if self.update_channel_state(channel_id, "active", {
                                            "grace_period_ended_at": str(time.time()),
                                            "clients_at_activation": str(total_clients)
                                        }):
                                            logging.info(f"Channel {channel_id} activated with {total_clients} clients after grace period")
                            # If active and no clients, start normal shutdown procedure
                            elif channel_state not in ["connecting", "waiting_for_clients"] and total_clients == 0:
                                # Check if there's a pending no-clients timeout
                                disconnect_key = f"ts_proxy:channel:{channel_id}:last_client_disconnect_time"
                                disconnect_time = None
                                
                                if self.redis_client:
                                    disconnect_value = self.redis_client.get(disconnect_key)
                                    if disconnect_value:
                                        try:
                                            disconnect_time = float(disconnect_value.decode('utf-8'))
                                        except (ValueError, TypeError) as e:
                                            logging.error(f"Invalid disconnect time for channel {channel_id}: {e}")
                                
                                current_time = time.time()
                                
                                if not disconnect_time:
                                    # First time seeing zero clients, set timestamp
                                    if self.redis_client:
                                        self.redis_client.setex(disconnect_key, 60, str(current_time))
                                    logging.warning(f"No clients detected for channel {channel_id}, starting shutdown timer")
                                elif current_time - disconnect_time > getattr(Config, 'CHANNEL_SHUTDOWN_DELAY', 5):
                                    # We've had no clients for the shutdown delay period
                                    logging.warning(f"No clients for {current_time - disconnect_time:.1f}s, stopping channel {channel_id}")
                                    self.stop_channel(channel_id)
                                else:
                                    # Still in shutdown delay period
                                    logging.debug(f"Channel {channel_id} shutdown timer: " 
                                                f"{current_time - disconnect_time:.1f}s of " 
                                                f"{getattr(Config, 'CHANNEL_SHUTDOWN_DELAY', 5)}s elapsed")
                            else:
                                # There are clients or we're still connecting - clear any disconnect timestamp
                                if self.redis_client:
                                    self.redis_client.delete(f"ts_proxy:channel:{channel_id}:last_client_disconnect_time")
                    
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
            # All keys are now under the channel namespace for easy pattern matching
            channel_pattern = f"ts_proxy:channel:{channel_id}:*"
            all_keys = self.redis_client.keys(channel_pattern)
            
            if all_keys:
                self.redis_client.delete(*all_keys)
                logging.info(f"Cleaned up {len(all_keys)} Redis keys for channel {channel_id}")
                                    
        except Exception as e:
            logging.error(f"Error cleaning Redis keys for channel {channel_id}: {e}")

    def refresh_channel_registry(self):
        """Refresh TTL for active channels using standard keys"""
        if not self.redis_client:
            return
            
        # Refresh registry entries for channels we own
        for channel_id in self.stream_managers.keys():
            # Use standard key pattern
            metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
            
            # Update activity timestamp in metadata only
            self.redis_client.hset(metadata_key, "last_active", str(time.time()))
            self.redis_client.expire(metadata_key, 3600)  # Reset TTL on metadata hash

    def update_channel_state(self, channel_id, new_state, additional_fields=None):
        """Update channel state with proper history tracking and logging"""
        if not self.redis_client:
            return False
            
        try:
            metadata_key = f"ts_proxy:channel:{channel_id}:metadata"
            
            # Get current state for logging
            current_state = None
            metadata = self.redis_client.hgetall(metadata_key)
            if metadata and b'state' in metadata:
                current_state = metadata[b'state'].decode('utf-8')
            
            # Only update if state is actually changing
            if current_state == new_state:
                logging.debug(f"Channel {channel_id} state unchanged: {current_state}")
                return True
                
            # Prepare update data
            update_data = {
                "state": new_state,
                "state_changed_at": str(time.time())
            }
            
            # Add optional additional fields
            if additional_fields:
                update_data.update(additional_fields)
                
            # Update the metadata
            self.redis_client.hset(metadata_key, mapping=update_data)
            
            # Log the transition
            logging.info(f"Channel {channel_id} state transition: {current_state or 'None'} → {new_state}")
            return True
        except Exception as e:
            logging.error(f"Error updating channel state: {e}")
            return False

