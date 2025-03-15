"""Buffer management for TS streams"""

import threading
import logging
import time
from collections import deque
from typing import Optional, Deque
import random
from apps.proxy.config import TSConfig as Config

logger = logging.getLogger("ts_proxy")

class StreamBuffer:
    """Manages stream data buffering with optimized chunk storage"""

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
                    logger.info(f"Initialized buffer from Redis with index {self.index}")
            except Exception as e:
                logger.error(f"Error initializing buffer from Redis: {e}")

        self._write_buffer = bytearray()
        self.target_chunk_size = getattr(Config, 'BUFFER_CHUNK_SIZE', 188 * 5644)  # ~1MB default

    def add_chunk(self, chunk):
        """Add data with optimized Redis storage and TS packet alignment"""
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
                        chunk_index = self.redis_client.incr(self.buffer_index_key)
                        chunk_key = f"{self.buffer_prefix}{chunk_index}"
                        self.redis_client.setex(chunk_key, self.chunk_ttl, bytes(chunk_data))

                        # Update local tracking
                        self.index = chunk_index
                        writes_done += 1

            if writes_done > 0:
                logger.debug(f"Added {writes_done} optimized chunks ({self.target_chunk_size} bytes each) to Redis")

            return True

        except Exception as e:
            logger.error(f"Error adding chunk to buffer: {e}")
            return False

    def get_chunks(self, start_index=None):
        """Get chunks from the buffer with detailed logging"""
        try:
            request_id = f"req_{random.randint(1000, 9999)}"
            logger.debug(f"[{request_id}] get_chunks called with start_index={start_index}")

            if not self.redis_client:
                logger.error("Redis not available, cannot retrieve chunks")
                return []

            # If no start_index provided, use most recent chunks
            if start_index is None:
                start_index = max(0, self.index - 10)  # Start closer to current position
                logger.debug(f"[{request_id}] No start_index provided, using {start_index}")

            # Get current index from Redis
            current_index = int(self.redis_client.get(self.buffer_index_key) or 0)

            # Calculate range of chunks to retrieve
            start_id = start_index + 1
            chunks_behind = current_index - start_id

            # Adaptive chunk retrieval based on how far behind
            if chunks_behind > 100:
                fetch_count = 15
                logger.debug(f"[{request_id}] Client very behind ({chunks_behind} chunks), fetching {fetch_count}")
            elif chunks_behind > 50:
                fetch_count = 10
                logger.debug(f"[{request_id}] Client moderately behind ({chunks_behind} chunks), fetching {fetch_count}")
            elif chunks_behind > 20:
                fetch_count = 5
                logger.debug(f"[{request_id}] Client slightly behind ({chunks_behind} chunks), fetching {fetch_count}")
            else:
                fetch_count = 3
                logger.debug(f"[{request_id}] Client up-to-date (only {chunks_behind} chunks behind), fetching {fetch_count}")

            end_id = min(current_index + 1, start_id + fetch_count)

            if start_id >= end_id:
                logger.debug(f"[{request_id}] No new chunks to fetch (start_id={start_id}, end_id={end_id})")
                return []

            # Log the range we're retrieving
            logger.debug(f"[{request_id}] Retrieving chunks {start_id} to {end_id-1} (total: {end_id-start_id})")

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
                logger.debug(f"[{request_id}] Missing {missing_chunks}/{len(results)} chunks in Redis")

            # Update local tracking
            if chunks:
                self.index = end_id - 1

            # Final log message
            chunk_sizes = [len(c) for c in chunks]
            total_bytes = sum(chunk_sizes) if chunks else 0
            logger.debug(f"[{request_id}] Returning {len(chunks)} chunks ({total_bytes} bytes)")

            return chunks

        except Exception as e:
            logger.error(f"Error getting chunks from buffer: {e}", exc_info=True)
            return []

    def get_chunks_exact(self, start_index, count):
        """Get exactly the requested number of chunks from given index"""
        try:
            if not self.redis_client:
                logger.error("Redis not available, cannot retrieve chunks")
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
            logger.error(f"Error getting exact chunks: {e}", exc_info=True)
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
                                logger.info(f"Flushed final chunk of {len(final_chunk)} bytes to Redis")
                            except Exception as e:
                                logger.error(f"Error flushing final chunk: {e}")

                # Clear buffers
                self._write_buffer = bytearray()
                if hasattr(self, '_partial_packet'):
                    self._partial_packet = bytearray()

        except Exception as e:
            logger.error(f"Error during buffer stop: {e}")