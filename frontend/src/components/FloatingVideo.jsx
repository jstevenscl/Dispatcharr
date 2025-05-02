// frontend/src/components/FloatingVideo.js
import React, { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import useVideoStore from '../store/useVideoStore';
import mpegts from 'mpegts.js';
import { CloseButton, Flex, Loader, Text, Box } from '@mantine/core';

export default function FloatingVideo() {
  const isVisible = useVideoStore((s) => s.isVisible);
  const streamUrl = useVideoStore((s) => s.streamUrl);
  const hideVideo = useVideoStore((s) => s.hideVideo);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const videoContainerRef = useRef(null);
  // Convert ref to state so we can use it for rendering
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Safely destroy the player to prevent errors
  const safeDestroyPlayer = () => {
    try {
      if (playerRef.current) {
        // Set loading to false when destroying player
        setIsLoading(false);
        setLoadError(null);

        // First unload the source to stop any in-progress fetches
        if (videoRef.current) {
          // Remove src attribute and force a load to clear any pending requests
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        }

        // Pause the player first
        try {
          playerRef.current.pause();
        } catch (e) {
          // Ignore pause errors
        }

        // Use a try-catch block specifically for the destroy call
        try {
          playerRef.current.destroy();
        } catch (error) {
          // Ignore expected abort errors
          if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
            console.log("Error during player destruction:", error.message);
          }
        } finally {
          playerRef.current = null;
        }
      }
    } catch (error) {
      console.log("Error during player cleanup:", error);
      playerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isVisible || !streamUrl) {
      safeDestroyPlayer();
      return;
    }

    // Check if we have an existing player and clean it up
    safeDestroyPlayer();

    // Set loading state to true when starting a new stream
    setIsLoading(true);
    setLoadError(null);

    // Debug log to help diagnose stream issues
    console.log("Attempting to play stream:", streamUrl);

    try {
      // If the browser supports MSE for live playback, initialize mpegts.js
      if (mpegts.getFeatureList().mseLivePlayback) {
        // Set loading flag
        setIsLoading(true);

        const player = mpegts.createPlayer({
          type: 'mpegts', // MPEG-TS format
          url: streamUrl,
          isLive: true,
          enableWorker: true,
          enableStashBuffer: false, // Try disabling stash buffer for live streams
          liveBufferLatencyChasing: true,
          liveSync: true,
          cors: true, // Enable CORS for cross-domain requests
          // Add error recovery options
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 10,
          autoCleanupMinBackwardDuration: 5,
          reuseRedirectedURL: true,
        });

        player.attachMediaElement(videoRef.current);

        // Add events to track loading state
        player.on(mpegts.Events.LOADING_COMPLETE, () => {
          setIsLoading(false);
        });

        player.on(mpegts.Events.METADATA_ARRIVED, () => {
          setIsLoading(false);
        });

        // Add error event handler
        player.on(mpegts.Events.ERROR, (errorType, errorDetail) => {
          setIsLoading(false);

          // Filter out aborted errors
          if (errorType !== 'NetworkError' || !errorDetail?.includes('aborted')) {
            console.error('Player error:', errorType, errorDetail);
            setLoadError(`Error: ${errorType}${errorDetail ? ` - ${errorDetail}` : ''}`);
          }
        });

        player.load();

        // Don't auto-play until we've loaded properly
        player.on(mpegts.Events.MEDIA_INFO, () => {
          setIsLoading(false);
          try {
            player.play().catch(e => {
              console.log("Auto-play prevented:", e);
              setLoadError("Auto-play was prevented. Click play to start.");
            });
          } catch (e) {
            console.log("Error during play:", e);
            setLoadError(`Playback error: ${e.message}`);
          }
        });

        // Store player instance so we can clean up later
        playerRef.current = player;
      }
    } catch (error) {
      setIsLoading(false);
      setLoadError(`Initialization error: ${error.message}`);
      console.error("Error initializing player:", error);
    }

    // Cleanup when component unmounts or streamUrl changes
    return () => {
      safeDestroyPlayer();
    };
  }, [isVisible, streamUrl]);

  // Modified hideVideo handler to clean up player first
  const handleClose = () => {
    safeDestroyPlayer();
    // Small delay before hiding the video component to ensure cleanup is complete
    setTimeout(() => {
      hideVideo();
    }, 50);
  };

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
          <CloseButton onClick={handleClose} />
        </Flex>

        {/* Video container with relative positioning for the overlay */}
        <Box style={{ position: 'relative' }}>
          {/* The <video> element used by mpegts.js */}
          <video
            ref={videoRef}
            controls
            style={{ width: '100%', height: '180px', backgroundColor: '#000' }}
          />

          {/* Loading overlay */}
          {isLoading && (
            <Box
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
            >
              <Loader color="cyan" size="md" />
              <Text color="white" size="sm" mt={10}>
                Loading stream...
              </Text>
            </Box>
          )}

          {/* Error message overlay */}
          {!isLoading && loadError && (
            <Box
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
                padding: '0 10px',
                textAlign: 'center',
              }}
            >
              <Text color="red" size="sm">
                {loadError}
              </Text>
            </Box>
          )}
        </Box>
      </div>
    </Draggable>
  );
}
