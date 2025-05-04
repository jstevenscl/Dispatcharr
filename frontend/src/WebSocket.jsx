import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  useCallback,
} from 'react';
import useStreamsStore from './store/streams';
import { notifications } from '@mantine/notifications';
import useChannelsStore from './store/channels';
import usePlaylistsStore from './store/playlists';
import useEPGsStore from './store/epgs';
import { Box, Button, Stack, Alert } from '@mantine/core';
import API from './api';

export const WebsocketContext = createContext([false, () => { }, null]);

export const WebsocketProvider = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [val, setVal] = useState(null);
  const ws = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [connectionError, setConnectionError] = useState(null);
  const maxReconnectAttempts = 5;
  const initialBackoffDelay = 1000; // 1 second initial delay

  // Calculate reconnection delay with exponential backoff
  const getReconnectDelay = useCallback(() => {
    return Math.min(initialBackoffDelay * Math.pow(1.5, reconnectAttempts), 30000); // max 30 seconds
  }, [reconnectAttempts]);

  // Clear any existing reconnect timers
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Function to get WebSocket URL that works with both HTTP and HTTPS
  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;

    // WebSockets always run on port 8001
    return `${protocol}//${host}:8001/ws/`;
  }, []);

  // Function to handle websocket connection
  const connectWebSocket = useCallback(() => {
    // Clear any existing timers to avoid multiple reconnection attempts
    clearReconnectTimer();

    // Clear old websocket if exists
    if (ws.current) {
      // Remove event handlers to prevent duplicate events
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onopen = null;
      ws.current.onmessage = null;

      try {
        ws.current.close();
      } catch (e) {
        console.warn("Error closing existing WebSocket:", e);
      }
    }

    try {
      console.log(`Attempting WebSocket connection (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})...`);

      // Use the function to get the correct WebSocket URL
      const wsUrl = getWebSocketUrl();
      console.log(`Connecting to WebSocket at: ${wsUrl}`);

      // Create new WebSocket connection
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connected successfully");
        setIsReady(true);
        setConnectionError(null);
        setReconnectAttempts(0);
      };

      socket.onerror = (error) => {
        console.error("WebSocket connection error:", error);

        // Don't show error notification on initial page load,
        // only show it after a connection was established then lost
        if (reconnectAttempts > 0 || isReady) {
          setConnectionError("Failed to connect to WebSocket server.");
        } else {
          console.log("Initial connection attempt failed, will retry...");
        }
      };

      socket.onclose = (event) => {
        console.warn("WebSocket connection closed", event);
        setIsReady(false);

        // Only attempt reconnect if we haven't reached max attempts
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = getReconnectDelay();
          setConnectionError(`Connection lost. Reconnecting in ${Math.ceil(delay / 1000)} seconds...`);
          console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})...`);

          // Store timer reference so we can cancel it if needed
          reconnectTimerRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        } else {
          setConnectionError("Maximum reconnection attempts reached. Please reload the page.");
          console.error("Maximum reconnection attempts reached. WebSocket connection failed.");
        }
      };

      // Message handler
      socket.onmessage = async (event) => {
        try {
          const parsedEvent = JSON.parse(event.data);

          // Handle connection_established event
          if (parsedEvent.type === 'connection_established') {
            console.log('WebSocket connection established:', parsedEvent.data?.message);
            // Don't need to do anything else for this event type
            return;
          }

          // Handle standard message format for other event types
          switch (parsedEvent.data?.type) {
            case 'epg_file':
              fetchEPGs();
              notifications.show({
                title: 'EPG File Detected',
                message: `Processing ${parsedEvent.data.filename}`,
              });
              break;

            case 'm3u_file':
              fetchPlaylists();
              notifications.show({
                title: 'M3U File Detected',
                message: `Processing ${parsedEvent.data.filename}`,
              });
              break;

            case 'm3u_group_refresh':
              fetchChannelGroups();
              fetchPlaylists();

              notifications.show({
                title: 'Group processing finished!',
                autoClose: 5000,
                message: (
                  <Stack>
                    Refresh M3U or filter out groups to pull in streams.
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => {
                        API.refreshPlaylist(parsedEvent.data.account);
                        setRefreshProgress(parsedEvent.data.account, 0);
                      }}
                    >
                      Refresh Now
                    </Button>
                  </Stack>
                ),
                color: 'green.5',
              });
              break;

            case 'm3u_refresh':
              setRefreshProgress(parsedEvent.data);
              break;

            case 'channel_stats':
              setChannelStats(JSON.parse(parsedEvent.data.stats));
              break;

            case 'epg_channels':
              notifications.show({
                message: 'EPG channels updated!',
                color: 'green.5',
              });

              // If source_id is provided, update that specific EPG's status
              if (parsedEvent.data.source_id) {
                const epgsState = useEPGsStore.getState();
                const epg = epgsState.epgs[parsedEvent.data.source_id];
                if (epg) {
                  epgsState.updateEPG({
                    ...epg,
                    status: 'success'
                  });
                }
              }

              fetchEPGData();
              break;

            case 'epg_match':
              notifications.show({
                message: parsedEvent.data.message || 'EPG match is complete!',
                color: 'green.5',
              });

              // Check if we have associations data and use the more efficient batch API
              if (parsedEvent.data.associations && parsedEvent.data.associations.length > 0) {
                API.batchSetEPG(parsedEvent.data.associations);
              }
              break;

            case 'm3u_profile_test':
              setProfilePreview(parsedEvent.data.search_preview, parsedEvent.data.result);
              break;

            case 'recording_started':
              notifications.show({
                title: 'Recording started!',
                message: `Started recording channel ${parsedEvent.data.channel}`,
              });
              break;

            case 'recording_ended':
              notifications.show({
                title: 'Recording finished!',
                message: `Stopped recording channel ${parsedEvent.data.channel}`,
              });
              break;

            case 'epg_fetch_error':
              notifications.show({
                title: 'EPG Source Error',
                message: parsedEvent.data.message,
                color: 'orange.5',
                autoClose: 8000,
              });

              // Update EPG status in store
              if (parsedEvent.data.source_id) {
                const epgsState = useEPGsStore.getState();
                const epg = epgsState.epgs[parsedEvent.data.source_id];
                if (epg) {
                  epgsState.updateEPG({
                    ...epg,
                    status: 'error',
                    last_error: parsedEvent.data.message
                  });
                }
              }
              break;

            case 'epg_refresh':
              // Update the store with progress information
              const epgsState = useEPGsStore.getState();
              epgsState.updateEPGProgress(parsedEvent.data);

              // If progress is complete (100%), show a notification and refresh EPG data
              if (parsedEvent.data.progress === 100 && parsedEvent.data.action === "parsing_programs") {
                notifications.show({
                  title: 'EPG Processing Complete',
                  message: 'EPG data has been updated successfully',
                  color: 'green.5',
                });

                fetchEPGData();
              }
              break;

            default:
              console.error(`Unknown websocket event type: ${parsedEvent.data?.type}`);
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error, event.data);
        }
      };

      ws.current = socket;
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setConnectionError(`WebSocket error: ${error.message}`);

      // Schedule a reconnect if we haven't reached max attempts
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = getReconnectDelay();
        reconnectTimerRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }, delay);
      }
    }
  }, [reconnectAttempts, clearReconnectTimer, getReconnectDelay, getWebSocketUrl, isReady]);

  // Initial connection and cleanup
  useEffect(() => {
    connectWebSocket();

    return () => {
      clearReconnectTimer(); // Clear any pending reconnect timers

      if (ws.current) {
        console.log("Closing WebSocket connection due to component unmount");
        ws.current.onclose = null; // Remove handlers to avoid reconnection
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connectWebSocket, clearReconnectTimer]);

  const setChannelStats = useChannelsStore((s) => s.setChannelStats);
  const fetchChannelGroups = useChannelsStore((s) => s.fetchChannelGroups);
  const fetchPlaylists = usePlaylistsStore((s) => s.fetchPlaylists);
  const setRefreshProgress = usePlaylistsStore((s) => s.setRefreshProgress);
  const setProfilePreview = usePlaylistsStore((s) => s.setProfilePreview);
  const fetchEPGData = useEPGsStore((s) => s.fetchEPGData);
  const fetchEPGs = useEPGsStore((s) => s.fetchEPGs);

  const ret = useMemo(() => {
    return [isReady, ws.current?.send.bind(ws.current), val];
  }, [isReady, val]);

  return (
    <WebsocketContext.Provider value={ret}>
      {connectionError && !isReady && reconnectAttempts >= maxReconnectAttempts && (
        <Alert color="red" title="WebSocket Connection Failed" style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 1000, maxWidth: 350 }}>
          {connectionError}
          <Button size="xs" mt={10} onClick={() => {
            setReconnectAttempts(0);
            connectWebSocket();
          }}>
            Try Again
          </Button>
        </Alert>
      )}
      {connectionError && !isReady && reconnectAttempts < maxReconnectAttempts && reconnectAttempts > 0 && (
        <Alert color="orange" title="WebSocket Reconnecting" style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 1000, maxWidth: 350 }}>
          {connectionError}
        </Alert>
      )}
      {children}
    </WebsocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const socket = useContext(WebsocketContext);
  return socket;
};
