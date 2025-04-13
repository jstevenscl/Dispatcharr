import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
} from 'react';
import useStreamsStore from './store/streams';
import { notifications } from '@mantine/notifications';
import useChannelsStore from './store/channels';
import usePlaylistsStore from './store/playlists';
import useEPGsStore from './store/epgs';
import { Box, Button, Stack } from '@mantine/core';
import API from './api';

export const WebsocketContext = createContext([false, () => {}, null]);

export const WebsocketProvider = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [val, setVal] = useState(null);

  const { fetchChannels, setChannelStats, fetchChannelGroups } =
    useChannelsStore();
  const { fetchPlaylists, setRefreshProgress, setProfilePreview } =
    usePlaylistsStore();
  const { fetchEPGData, fetchEPGs } = useEPGsStore();

  const ws = useRef(null);

  useEffect(() => {
    let wsUrl = `${window.location.host}/ws/`;
    if (import.meta.env.DEV) {
      wsUrl = `${window.location.hostname}:8001/ws/`;
    }

    if (window.location.protocol.match(/https/)) {
      wsUrl = `wss://${wsUrl}`;
    } else {
      wsUrl = `ws://${wsUrl}`;
    }

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('websocket connected');
      setIsReady(true);
    };

    // Reconnection logic
    socket.onclose = () => {
      setIsReady(false);
      setTimeout(() => {
        const reconnectWs = new WebSocket(wsUrl);
        reconnectWs.onopen = () => setIsReady(true);
      }, 3000); // Attempt to reconnect every 3 seconds
    };

    socket.onmessage = async (event) => {
      event = JSON.parse(event.data);
      switch (event.data.type) {
        case 'epg_file':
          fetchEPGs();
          notifications.show({
            title: 'EPG File Detected',
            message: `Processing ${event.data.filename}`,
          });
          break;

        case 'm3u_file':
          fetchPlaylists();
          notifications.show({
            title: 'M3U File Detected',
            message: `Processing ${event.data.filename}`,
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
                    API.refreshPlaylist(event.data.account);
                    setRefreshProgress(event.data.account, 0);
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
          setRefreshProgress(event.data);
          break;

        case 'channel_stats':
          setChannelStats(JSON.parse(event.data.stats));
          break;

        case 'epg_channels':
          notifications.show({
            message: 'EPG channels updated!',
            color: 'green.5',
          });
          fetchEPGData();
          break;

        case 'epg_match':
          notifications.show({
            message: 'EPG match is complete!',
            color: 'green.5',
          });
          fetchChannels();
          fetchEPGData();
          break;

        case 'm3u_profile_test':
          setProfilePreview(event.data.search_preview, event.data.result);
          break;

        case 'recording_started':
          notifications.show({
            title: 'Recording started!',
            message: `Started recording channel ${event.data.channel}`,
          });
          break;

        case 'recording_ended':
          notifications.show({
            title: 'Recording finished!',
            message: `Stopped recording channel ${event.data.channel}`,
          });
          break;

        default:
          console.error(`Unknown websocket event type: ${event.type}`);
          break;
      }
    };

    ws.current = socket;

    return () => {
      socket.close();
    };
  }, []);

  const ret = useMemo(() => {
    return [isReady, ws.current?.send.bind(ws.current), val];
  }, [isReady, val]);

  return (
    <WebsocketContext.Provider value={ret}>
      {children}
    </WebsocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const socket = useContext(WebsocketContext);
  return socket;
};
