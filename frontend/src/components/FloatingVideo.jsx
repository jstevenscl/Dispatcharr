// frontend/src/components/FloatingVideo.js
import React, { useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import useVideoStore from '../store/useVideoStore';
import mpegts from 'mpegts.js';
import { CloseButton, Flex } from '@mantine/core';

export default function FloatingVideo() {
  const isVisible = useVideoStore((s) => s.isVisible);
  const streamUrl = useVideoStore((s) => s.streamUrl);
  const hideVideo = useVideoStore((s) => s.hideVideo);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const videoContainerRef = useRef(null);

  useEffect(() => {
    if (!isVisible || !streamUrl) {
      return;
    }

    // Check if we have an existing player and clean it up
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Debug log to help diagnose stream issues
    console.log("Attempting to play stream:", streamUrl);

    try {
      // If the browser supports MSE for live playback, initialize mpegts.js
      if (mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer({
          type: 'mpegts', // MPEG-TS format
          url: streamUrl,
          isLive: true,
          enableWorker: true,
          enableStashBuffer: false, // Try disabling stash buffer for live streams
          liveBufferLatencyChasing: true,
          liveSync: true,
          cors: true, // Enable CORS for cross-domain requests
        });

        player.attachMediaElement(videoRef.current);

        // Add error event handler
        player.on(mpegts.Events.ERROR, (errorType, errorDetail) => {
          console.error('Player error:', errorType, errorDetail);
          // If it's a format issue, show a helpful message
          if (errorDetail.includes('Unsupported media type')) {
            const message = document.createElement('div');
            message.textContent = "Unsupported stream format. Please try a different stream.";
            message.style.position = 'absolute';
            message.style.top = '50%';
            message.style.left = '50%';
            message.style.transform = 'translate(-50%, -50%)';
            message.style.color = 'white';
            message.style.textAlign = 'center';
            message.style.width = '100%';
            videoRef.current.parentNode.appendChild(message);
          }
        });

        player.load();
        player.play();

        // Store player instance so we can clean up later
        playerRef.current = player;
      }
    } catch (error) {
      console.error("Error initializing player:", error);
    }

    // Cleanup when component unmounts or streamUrl changes
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isVisible, streamUrl]);

  // If the floating video is hidden or no URL is selected, do not render
  if (!isVisible || !streamUrl) {
    return null;
  }

  return (
    <Draggable nodeRef={videoContainerRef}>
      <div
        ref={videoContainerRef}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '320px',
          zIndex: 9999,
          backgroundColor: '#333',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
        }}
      >
        {/* Simple header row with a close button */}
        <Flex justify="flex-end" style={{ padding: 3 }}>
          <CloseButton onClick={hideVideo} />
        </Flex>

        {/* The <video> element used by mpegts.js */}
        <video
          ref={videoRef}
          controls
          style={{ width: '100%', height: '180px', backgroundColor: '#000' }}
        />
      </div>
    </Draggable>
  );
}
