// frontend/src/components/FloatingVideo.js
import React, { useEffect, useState } from 'react';
import usePlaylistsStore from '../store/playlists';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import useStreamsStore from '../store/streams';
import useChannelsStore from '../store/channels';
import useEPGsStore from '../store/epgs';

export default function M3URefreshNotification() {
  const playlists = usePlaylistsStore((s) => s.playlists);
  const refreshProgress = usePlaylistsStore((s) => s.refreshProgress);
  const fetchStreams = useStreamsStore((s) => s.fetchStreams);
  const fetchChannelGroups = useChannelsStore((s) => s.fetchChannelGroups);
  const fetchPlaylists = usePlaylistsStore((s) => s.fetchPlaylists);
  const fetchEPGData = useEPGsStore((s) => s.fetchEPGData);

  const [notificationStatus, setNotificationStatus] = useState({});

  const handleM3UUpdate = (data) => {
    if (
      JSON.stringify(notificationStatus[data.account]) == JSON.stringify(data)
    ) {
      return;
    }

    const playlist = playlists.find((pl) => pl.id == data.account);
    if (!playlist) {
      return;
    }

    setNotificationStatus({
      ...notificationStatus,
      [data.account]: data,
    });

    const taskProgress = data.progress;

    if (data.progress != 0 && data.progress != 100) {
      console.log('not 0 or 100');
      return;
    }

    let message = '';
    switch (data.action) {
      case 'downloading':
        message = 'Downloading';
        break;

      case 'parsing':
        message = 'Stream parsing';
        break;

      case 'processing_groups':
        message = 'Group parsing';
        break;
    }

    if (taskProgress == 0) {
      message = `${message} starting...`;
    } else if (taskProgress == 100) {
      message = `${message} complete!`;

      if (data.action == 'parsing') {
        fetchStreams();
      } else if (data.action == 'processing_groups') {
        fetchStreams();
        fetchChannelGroups();
        fetchEPGData();
        fetchPlaylists();
      }
    }

    notifications.show({
      title: `M3U Processing: ${playlist.name}`,
      message,
      loading: taskProgress == 0,
      autoClose: 2000,
      icon: taskProgress == 100 ? <IconCheck /> : null,
    });
  };

  useEffect(() => {
    Object.values(refreshProgress).map((data) => handleM3UUpdate(data));
  }, [playlists, refreshProgress]);

  return <></>;
}
