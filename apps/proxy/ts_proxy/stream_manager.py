"""Stream connection management for TS proxy"""

import threading
import logging
import time
import requests
import subprocess
from typing import Optional, List
from apps.proxy.config import TSConfig as Config

# Import StreamBuffer but use lazy imports inside methods if needed
from .stream_buffer import StreamBuffer

logger = logging.getLogger("ts_proxy")

class StreamManager:
    """Manages a connection to a TS stream without using raw sockets"""

    def __init__(self, url, buffer, user_agent=None, transcode_cmd=[]):
        # Basic properties
        self.url = url
        self.buffer = buffer
        self.running = True
        self.connected = False
        self.retry_count = 0
        self.max_retries = Config.MAX_RETRIES
        self.current_response = None
        self.current_session = None

        # Sockets used for transcode jobs
        self.socket = None
        self.transcode_cmd = transcode_cmd
        self.transcode_process = None

        # User agent for connection
        self.user_agent = user_agent or Config.DEFAULT_USER_AGENT

        # Stream health monitoring
        self.last_data_time = time.time()
        self.healthy = True
        self.health_check_interval = Config.HEALTH_CHECK_INTERVAL
        self.chunk_size = getattr(Config, 'CHUNK_SIZE', 8192)

        logger.info(f"Initialized stream manager for channel {buffer.channel_id}")

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
        # Add a stop flag to the class properties
        self.stop_requested = False

        try:
            # Start health monitor thread
            health_thread = threading.Thread(target=self._monitor_health, daemon=True)
            health_thread.start()

            logger.info(f"Starting stream for URL: {self.url}")

            while self.running:
                if len(self.transcode_cmd) > 0:
                    # Start command process for transcoding
                    logger.debug(f"Starting transcode process: {self.transcode_cmd}")
                    self.transcode_process = subprocess.Popen(
                        self.transcode_cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL,  # Suppress FFmpeg logs
                        bufsize=188 * 64            # Buffer optimized for TS packets
                    )
                    self.socket = self.transcode_process.stdout  # Read from FFmpeg output
                    self.connected = True

                    if self.socket is not None:
                        # Set channel state to waiting for clients
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
                    try:
                        # Using direct HTTP streaming
                        logger.debug(f"Using TS Proxy to connect to stream: {self.url}")
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
                            logger.info("Successfully connected to stream source")

                            # Set channel state to waiting for clients
                            self._set_waiting_for_clients()

                            # Process the stream in chunks with improved error handling
                            try:
                                chunk_count = 0
                                for chunk in response.iter_content(chunk_size=self.chunk_size):
                                    # Check if we've been asked to stop
                                    if self.stop_requested:
                                        logger.info(f"Stream loop for channel {self.channel_id} stopping due to request")
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
                            except (AttributeError, ConnectionError) as e:
                                if self.stop_requested:
                                    # This is expected during shutdown, just log at debug level
                                    logger.debug(f"Expected connection error during shutdown: {e}")
                                else:
                                    # Unexpected error during normal operation
                                    logger.error(f"Unexpected stream error: {e}")
                                    # Handle the error appropriately
                            except Exception as e:
                                # Handle the specific 'NoneType' object has no attribute 'read' error
                                if "'NoneType' object has no attribute 'read'" in str(e):
                                    logger.warning(f"Connection closed by server (read {chunk_count} chunks before disconnect)")
                                else:
                                    # Re-raise unexpected AttributeErrors
                                    logger.error(f"Unexpected AttributeError: {e}")
                                    raise
                        else:
                            logger.error(f"Failed to connect to stream: HTTP {response.status_code}")
                            time.sleep(2)

                    except requests.exceptions.ReadTimeout:
                        logger.warning("Read timeout - server stopped sending data")
                        self.connected = False
                        time.sleep(1)

                    except requests.RequestException as e:
                        logger.error(f"HTTP request error: {e}")
                        self.connected = False
                        time.sleep(5)

                    finally:
                        # Clean up response and session
                        if self.current_response:
                            try:
                                self.current_response.close()
                            except Exception as e:
                                logger.debug(f"Error closing response: {e}")
                            self.current_response = None

                        if self.current_session:
                            try:
                                self.current_session.close()
                            except Exception as e:
                                logger.debug(f"Error closing session: {e}")
                            self.current_session = None

                # Connection retry logic
                if self.running and not self.connected:
                    self.retry_count += 1
                    if self.retry_count > self.max_retries:
                        logger.error(f"Maximum retry attempts ({self.max_retries}) exceeded")
                        break

                    timeout = min(2 ** self.retry_count, 30)
                    logger.info(f"Reconnecting in {timeout} seconds... (attempt {self.retry_count})")
                    time.sleep(timeout)

        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
        finally:
            self.connected = False

            if self.socket:
                try:
                    self._close_socket()
                except:
                    pass

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

            logger.info("Stream manager stopped")

    def stop(self):
        """Stop this stream"""
        # Set the flag first
        self.stop_requested = True
        
        # Close any active response connection
        if hasattr(self, 'current_response') and self.current_response:  # CORRECT NAME
            try:
                self.current_response.close()  # CORRECT NAME
            except Exception:
                pass
            
        # Also close the session
        if hasattr(self, 'current_session') and self.current_session:
            try:
                self.current_session.close()
            except Exception:
                pass
        
        # Set running to false to ensure thread exits
        self.running = False

    def update_url(self, new_url):
        """Update stream URL and reconnect with HTTP streaming approach"""
        if new_url == self.url:
            logger.info(f"URL unchanged: {new_url}")
            return False

        logger.info(f"Switching stream URL from {self.url} to {new_url}")

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
                if now - self.last_data_time > getattr(Config, 'CONNECTION_TIMEOUT', 10) and self.connected:
                    # Mark unhealthy if no data for too long
                    if self.healthy:
                        logger.warning(f"Stream unhealthy - no data for {now - self.last_data_time:.1f}s")
                        self.healthy = False
                elif self.connected and not self.healthy:
                    # Auto-recover health when data resumes
                    logger.info("Stream health restored")
                    self.healthy = True

            except Exception as e:
                logger.error(f"Error in health monitor: {e}")

            time.sleep(self.health_check_interval)

    def _close_connection(self):
        """Close HTTP connection resources"""
        # Close response if it exists
        if hasattr(self, 'current_response') and self.current_response:
            try:
                self.current_response.close()
            except Exception as e:
                logger.debug(f"Error closing response: {e}")
            self.current_response = None

        # Close session if it exists
        if hasattr(self, 'current_session') and self.current_session:
            try:
                self.current_session.close()
            except Exception as e:
                logger.debug(f"Error closing session: {e}")
            self.current_session = None

    # Keep backward compatibility - let's create an alias to the new method
    def _close_socket(self):
        """Backward compatibility wrapper for _close_connection"""
        if self.current_response:
            return self._close_connection()
        if self.socket:
            try:
                self.socket.close()
            except Exception as e:
                logging.debug(f"Error closing socket: {e}")
                pass

            self.socket = None
            self.connected = False

        if self.transcode_process:
            try:
                self.transcode_process.terminate()
                self.transcode_process.wait()
            except Exception as e:
                logging.debug(f"Error terminating transcode process: {e}")
                pass

            self.transcode_process = None

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
                logger.warning("Server closed connection")
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
            logger.error(f"Socket error: {e}")
            self._close_socket()
            self.connected = False
            return False

        except Exception as e:
            logger.error(f"Error in fetch_chunk: {e}")
            return False

    def _set_waiting_for_clients(self):
        """Set channel state to waiting for clients AFTER buffer has enough chunks"""
        try:
            if hasattr(self.buffer, 'channel_id') and hasattr(self.buffer, 'redis_client'):
                channel_id = self.buffer.channel_id
                redis_client = self.buffer.redis_client

                if channel_id and redis_client:
                    current_time = str(time.time())
                    metadata_key = f"ts_proxy:channel:{channel_id}:metadata"

                    # Check current state first
                    current_state = None
                    try:
                        metadata = redis_client.hgetall(metadata_key)
                        if metadata and b'state' in metadata:
                            current_state = metadata[b'state'].decode('utf-8')
                    except Exception as e:
                        logger.error(f"Error checking current state: {e}")

                    # Only update if not already past connecting
                    if not current_state or current_state in ["initializing", "connecting"]:
                        # NEW CODE: Check if buffer has enough chunks
                        current_buffer_index = getattr(self.buffer, 'index', 0)
                        initial_chunks_needed = getattr(Config, 'INITIAL_BEHIND_CHUNKS', 10)
                        
                        if current_buffer_index < initial_chunks_needed:
                            # Not enough buffer yet - set to connecting state if not already
                            if current_state != "connecting":
                                update_data = {
                                    "state": "connecting",
                                    "state_changed_at": current_time
                                }
                                redis_client.hset(metadata_key, mapping=update_data)
                                logger.info(f"Channel {channel_id} connected but waiting for buffer to fill: {current_buffer_index}/{initial_chunks_needed} chunks")
                            
                            # Schedule a retry to check buffer status again
                            timer = threading.Timer(0.5, self._check_buffer_and_set_state)
                            timer.daemon = True
                            timer.start()
                            return False
                        
                        # We have enough buffer, proceed with state change
                        update_data = {
                            "state": "waiting_for_clients",
                            "connection_ready_time": current_time,
                            "state_changed_at": current_time,
                            "buffer_chunks": str(current_buffer_index)
                        }
                        redis_client.hset(metadata_key, mapping=update_data)

                        # Get configured grace period or default
                        grace_period = getattr(Config, 'CHANNEL_INIT_GRACE_PERIOD', 20)
                        logger.info(f"STREAM MANAGER: Updated channel {channel_id} state: {current_state or 'None'} → waiting_for_clients with {current_buffer_index} buffer chunks")
                        logger.info(f"Started initial connection grace period ({grace_period}s) for channel {channel_id}")
                    else:
                        logger.debug(f"Not changing state: channel {channel_id} already in {current_state} state")
        except Exception as e:
            logger.error(f"Error setting waiting for clients state: {e}")

    def _check_buffer_and_set_state(self):
        """Check buffer size and set state to waiting_for_clients when ready"""
        try:
            # This method will be called asynchronously to check buffer status
            # and update state when enough chunks are available
            if hasattr(self.buffer, 'index') and hasattr(self.buffer, 'channel_id'):
                current_buffer_index = self.buffer.index
                initial_chunks_needed = getattr(Config, 'INITIAL_BEHIND_CHUNKS', 10)
                channel_id = self.buffer.channel_id
                
                if current_buffer_index >= initial_chunks_needed:
                    # We now have enough buffer, call _set_waiting_for_clients again
                    logger.info(f"Buffer threshold reached for channel {channel_id}: {current_buffer_index}/{initial_chunks_needed} chunks")
                    self._set_waiting_for_clients()
                else:
                    # Still waiting, log progress and schedule another check
                    logger.debug(f"Buffer filling for channel {channel_id}: {current_buffer_index}/{initial_chunks_needed} chunks")
                    if current_buffer_index > 0 and current_buffer_index % 5 == 0:
                        # Log less frequently to avoid spamming logs
                        logger.info(f"Buffer filling for channel {channel_id}: {current_buffer_index}/{initial_chunks_needed} chunks")
                    
                    # Schedule another check
                    timer = threading.Timer(0.5, self._check_buffer_and_set_state)
                    timer.daemon = True
                    timer.start()
        except Exception as e:
            logger.error(f"Error in buffer check: {e}")