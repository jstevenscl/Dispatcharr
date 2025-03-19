"""
Stream generation and client-side handling for TS streams.
This module handles generating and delivering video streams to clients.
"""

import time
import logging
from apps.proxy.config import TSConfig as Config
from . import proxy_server

logger = logging.getLogger("ts_proxy")

class StreamGenerator:
    """
    Handles generating streams for clients, including initialization,
    data delivery, and cleanup.
    """

    def __init__(self, channel_id, client_id, client_ip, client_user_agent, channel_initializing=False):
        """
        Initialize the stream generator with client and channel details.

        Args:
            channel_id: The UUID of the channel to stream
            client_id: Unique ID for this client connection
            client_ip: Client's IP address
            client_user_agent: User agent string from client
            channel_initializing: Whether the channel is still initializing
        """
        self.channel_id = channel_id
        self.client_id = client_id
        self.client_ip = client_ip
        self.client_user_agent = client_user_agent
        self.channel_initializing = channel_initializing

        # Performance and state tracking
        self.stream_start_time = time.time()
        self.bytes_sent = 0
        self.chunks_sent = 0
        self.local_index = 0
        self.consecutive_empty = 0

    def generate(self):
        """
        Generator function that produces the stream content for the client.
        Handles initialization state, data delivery, and client disconnection.

        Yields:
            bytes: Chunks of TS stream data
        """
        self.stream_start_time = time.time()
        self.bytes_sent = 0
        self.chunks_sent = 0

        # Keep track of initialization state
        initialization_start = time.time()
        max_init_wait = getattr(Config, 'CLIENT_WAIT_TIMEOUT', 30)
        channel_ready = not self.channel_initializing
        keepalive_interval = 0.5
        last_keepalive = 0

        try:
            logger.info(f"[{self.client_id}] Stream generator started, channel_ready={channel_ready}")

            # Wait for initialization to complete if needed
            if not channel_ready:
                # While init is happening, send keepalive packets
                while time.time() - initialization_start < max_init_wait:
                    # Check if initialization has completed
                    if proxy_server.redis_client:
                        metadata_key = f"ts_proxy:channel:{self.channel_id}:metadata"
                        metadata = proxy_server.redis_client.hgetall(metadata_key)

                        if metadata and b'state' in metadata:
                            state = metadata[b'state'].decode('utf-8')
                            if state in ['waiting_for_clients', 'active']:
                                logger.info(f"[{self.client_id}] Channel {self.channel_id} now ready (state={state})")
                                channel_ready = True
                                break
                            elif state in ['error', 'stopped']:
                                error_message = metadata.get(b'error_message', b'Unknown error').decode('utf-8')
                                logger.error(f"[{self.client_id}] Channel {self.channel_id} in error state: {state}, message: {error_message}")
                                # Send error in a comment TS packet before giving up
                                error_packet = bytearray(188)
                                error_packet[0] = 0x47  # Sync byte
                                error_packet[1] = 0x1F  # PID high bits
                                error_packet[2] = 0xFF  # PID low bits
                                error_msg = f"Error: {error_message}".encode('utf-8')
                                error_packet[4:4+min(len(error_msg), 180)] = error_msg[:180]
                                yield bytes(error_packet)
                                return
                            else:
                                # Still initializing - send keepalive if needed
                                if time.time() - last_keepalive >= keepalive_interval:
                                    keepalive_packet = bytearray(188)
                                    keepalive_packet[0] = 0x47  # Sync byte
                                    keepalive_packet[1] = 0x1F  # PID high bits (null packet)
                                    keepalive_packet[2] = 0xFF  # PID low bits (null packet)

                                    # Add status info in packet payload (will be ignored by players)
                                    status_msg = f"Initializing: {state}".encode('utf-8')
                                    keepalive_packet[4:4+min(len(status_msg), 180)] = status_msg[:180]

                                    logger.debug(f"[{self.client_id}] Sending keepalive packet during initialization, state={state}")
                                    yield bytes(keepalive_packet)
                                    self.bytes_sent += len(keepalive_packet)
                                    last_keepalive = time.time()

                    # Wait a bit before checking again (don't send too many keepalives)
                    time.sleep(0.1)

                # Check if we timed out waiting
                if not channel_ready:
                    logger.warning(f"[{self.client_id}] Timed out waiting for initialization")
                    error_packet = bytearray(188)
                    error_packet[0] = 0x47  # Sync byte
                    error_packet[1] = 0x1F  # PID high bits
                    error_packet[2] = 0xFF  # PID low bits
                    error_msg = f"Error: Initialization timeout".encode('utf-8')
                    error_packet[4:4+min(len(error_msg), 180)] = error_msg[:180]
                    yield bytes(error_packet)
                    return

            # Channel is now ready - start normal streaming
            logger.info(f"[{self.client_id}] Channel {self.channel_id} ready, starting normal streaming")

            # Reset start time for real streaming
            self.stream_start_time = time.time()

            # Get buffer - stream manager may not exist in this worker
            buffer = proxy_server.stream_buffers.get(self.channel_id)
            stream_manager = proxy_server.stream_managers.get(self.channel_id)

            if not buffer:
                logger.error(f"[{self.client_id}] No buffer found for channel {self.channel_id}")
                return

            # Client state tracking - use config for initial position
            initial_behind = getattr(Config, 'INITIAL_BEHIND_CHUNKS', 10)
            current_buffer_index = buffer.index
            local_index = max(0, current_buffer_index - initial_behind)
            logger.debug(f"[{self.client_id}] Buffer at {current_buffer_index}, starting {initial_behind} chunks behind at index {local_index}")

            initial_position = local_index
            last_yield_time = time.time()
            empty_reads = 0
            bytes_sent = 0
            chunks_sent = 0
            stream_start_time = time.time()
            consecutive_empty = 0  # Track consecutive empty reads
            self.local_index = local_index

            # Timing parameters from config
            ts_packet_size = 188
            target_bitrate = Config.TARGET_BITRATE
            packets_per_second = target_bitrate / (8 * ts_packet_size)

            logger.info(f"[{self.client_id}] Starting stream at index {local_index} (buffer at {buffer.index})")

            # Check if we're the owner worker
            is_owner_worker = proxy_server.am_i_owner(self.channel_id) if hasattr(proxy_server, 'am_i_owner') else True

            # Main streaming loop
            while True:
                # Enhanced resource checks
                if self.channel_id not in proxy_server.stream_buffers:
                    logger.info(f"[{self.client_id}] Channel buffer no longer exists, terminating stream")
                    break

                if self.channel_id not in proxy_server.client_managers:
                    logger.info(f"[{self.client_id}] Client manager no longer exists, terminating stream")
                    break

                # Check if this specific client has been stopped
                if proxy_server.redis_client:
                    # Channel stop check
                    stop_key = f"ts_proxy:channel:{self.channel_id}:stopping"
                    if proxy_server.redis_client.exists(stop_key):
                        logger.info(f"[{self.client_id}] Detected channel stop signal, terminating stream")
                        break

                    # Client stop check
                    client_stop_key = f"ts_proxy:channel:{self.channel_id}:client:{self.client_id}:stop"
                    if proxy_server.redis_client.exists(client_stop_key):
                        logger.info(f"[{self.client_id}] Detected client stop signal, terminating stream")
                        break

                    # Also check if client has been removed from client_manager
                    if self.channel_id in proxy_server.client_managers:
                        client_manager = proxy_server.client_managers[self.channel_id]
                        if self.client_id not in client_manager.clients:
                            logger.info(f"[{self.client_id}] Client no longer in client manager, terminating stream")
                            break

                # Get chunks at client's position using improved strategy
                chunks, next_index = buffer.get_optimized_client_data(local_index)

                if chunks:
                    empty_reads = 0
                    consecutive_empty = 0

                    # Process and send chunks
                    total_size = sum(len(c) for c in chunks)
                    logger.debug(f"[{self.client_id}] Retrieved {len(chunks)} chunks ({total_size} bytes) from index {local_index+1} to {next_index}")

                    # Send the chunks to the client
                    for chunk in chunks:
                        try:
                            yield chunk
                            bytes_sent += len(chunk)
                            chunks_sent += 1

                            # Log every 100 chunks for visibility
                            if chunks_sent % 100 == 0:
                                elapsed = time.time() - stream_start_time
                                rate = bytes_sent / elapsed / 1024 if elapsed > 0 else 0
                                logger.info(f"[{self.client_id}] Stats: {chunks_sent} chunks, {bytes_sent/1024:.1f}KB, {rate:.1f}KB/s")
                        except Exception as e:
                            logger.error(f"[{self.client_id}] Error sending chunk to client: {e}")
                            raise  # Re-raise to exit the generator

                    # Update index after successfully sending all chunks
                    local_index = next_index
                    self.local_index = local_index
                    last_yield_time = time.time()
                else:
                    # No chunks available
                    empty_reads += 1
                    consecutive_empty += 1

                    # Check if we're caught up to buffer head
                    at_buffer_head = local_index >= buffer.index

                    # If we're at buffer head and no data is coming, send keepalive
                    # Only check stream manager health if it exists
                    stream_healthy = stream_manager.healthy if stream_manager else True

                    if at_buffer_head and not stream_healthy and consecutive_empty >= 5:
                        # Create a null TS packet as keepalive (188 bytes filled with padding)
                        # This prevents VLC from hitting EOF
                        keepalive_packet = bytearray(188)
                        keepalive_packet[0] = 0x47  # Sync byte
                        keepalive_packet[1] = 0x1F  # PID high bits (null packet)
                        keepalive_packet[2] = 0xFF  # PID low bits (null packet)

                        logger.debug(f"[{self.client_id}] Sending keepalive packet while waiting at buffer head")
                        yield bytes(keepalive_packet)
                        bytes_sent += len(keepalive_packet)
                        last_yield_time = time.time()
                        consecutive_empty = 0  # Reset consecutive counter but keep total empty_reads
                        time.sleep(Config.KEEPALIVE_INTERVAL)
                    else:
                        # Standard wait
                        sleep_time = min(0.1 * consecutive_empty, 1.0)  # Progressive backoff up to 1s
                        time.sleep(sleep_time)

                    # Log empty reads periodically
                    if empty_reads % 50 == 0:
                        stream_status = "healthy" if (stream_manager and stream_manager.healthy) else "unknown"
                        logger.debug(f"[{self.client_id}] Waiting for chunks beyond {local_index} (buffer at {buffer.index}, stream: {stream_status})")

                    # Check for client disconnect during wait periods
                    if consecutive_empty > 100 and buffer.index > local_index + 50:
                        logger.warning(f"[{self.client_id}] Possible ghost client: buffer has advanced {buffer.index - local_index} chunks ahead but client stuck at {local_index}")
                        break

                    # Disconnect after long inactivity
                    # For non-owner workers, we're more lenient with timeout
                    if time.time() - last_yield_time > Config.STREAM_TIMEOUT:
                        if stream_manager and not stream_manager.healthy:
                            logger.warning(f"[{self.client_id}] No data for {Config.STREAM_TIMEOUT}s and stream unhealthy, disconnecting")
                            break
                        elif not is_owner_worker and consecutive_empty > 100:
                            # Non-owner worker without data for too long
                            logger.warning(f"[{self.client_id}] Non-owner worker with no data for {Config.STREAM_TIMEOUT}s, disconnecting")
                            break

        except Exception as e:
            logger.error(f"[{self.client_id}] Stream error: {e}", exc_info=True)
        finally:
            # Client cleanup
            elapsed = time.time() - self.stream_start_time
            local_clients = 0
            total_clients = 0

            if self.channel_id in proxy_server.client_managers:
                client_manager = proxy_server.client_managers[self.channel_id]
                local_clients = client_manager.remove_client(self.client_id)
                total_clients = client_manager.get_total_client_count()
                logger.info(f"[{self.client_id}] Disconnected after {elapsed:.2f}s, {bytes_sent/1024:.1f}KB in {chunks_sent} chunks (local: {local_clients}, total: {total_clients})")

                # Schedule channel shutdown if no clients left
                self._schedule_channel_shutdown_if_needed(local_clients)

    def _schedule_channel_shutdown_if_needed(self, local_clients):
        """
        Schedule channel shutdown if there are no clients left and we're the owner.
        """
        # If no clients left and we're the owner, schedule shutdown using the config value
        if local_clients == 0 and proxy_server.am_i_owner(self.channel_id):
            logger.info(f"No local clients left for channel {self.channel_id}, scheduling shutdown")

            def delayed_shutdown():
                # Use the config setting instead of hardcoded value
                shutdown_delay = getattr(Config, 'CHANNEL_SHUTDOWN_DELAY', 5)
                logger.info(f"Waiting {shutdown_delay}s before checking if channel should be stopped")
                time.sleep(shutdown_delay)

                # After delay, check global client count
                if self.channel_id in proxy_server.client_managers:
                    total = proxy_server.client_managers[self.channel_id].get_total_client_count()
                    if total == 0:
                        logger.info(f"Shutting down channel {self.channel_id} as no clients connected")
                        proxy_server.stop_channel(self.channel_id)
                    else:
                        logger.info(f"Not shutting down channel {self.channel_id}, {total} clients still connected")

            import threading
            shutdown_thread = threading.Thread(target=delayed_shutdown)
            shutdown_thread.daemon = True
            shutdown_thread.start()

def create_stream_generator(channel_id, client_id, client_ip, client_user_agent, channel_initializing=False):
    """
    Factory function to create a new stream generator.
    Returns a function that can be passed to StreamingHttpResponse.
    """
    generator = StreamGenerator(channel_id, client_id, client_ip, client_user_agent, channel_initializing)
    return generator.generate
