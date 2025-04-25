import React, { useMemo, useState, useEffect } from 'react';
import {
  ActionIcon,
  Box,
  Card,
  Center,
  Container,
  Flex,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
  useMantineTheme,
  Select,
} from '@mantine/core';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { TableHelper } from '../helpers';
import API from '../api';
import useChannelsStore from '../store/channels';
import logo from '../images/logo.png';
import {
  Gauge,
  HardDriveDownload,
  HardDriveUpload,
  SquareX,
  Timer,
  Users,
  Video,
} from 'lucide-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Sparkline } from '@mantine/charts';
import useStreamProfilesStore from '../store/streamProfiles';
import { useLocation } from 'react-router-dom';
import { notifications } from '@mantine/notifications';

dayjs.extend(duration);
dayjs.extend(relativeTime);

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatSpeed(bytes) {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

const getStartDate = (uptime) => {
  // Get the current date and time
  const currentDate = new Date();
  // Calculate the start date by subtracting uptime (in milliseconds)
  const startDate = new Date(currentDate.getTime() - uptime * 1000);
  // Format the date as a string (you can adjust the format as needed)
  return startDate.toLocaleString({
    weekday: 'short', // optional, adds day of the week
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true, // 12-hour format with AM/PM
  });
};

// Create a separate component for each channel card to properly handle the hook
const ChannelCard = ({ channel, clients, stopClient, stopChannel, logos, channelsByUUID }) => {
  const location = useLocation();
  const [availableStreams, setAvailableStreams] = useState([]);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);

  // Safety check - if channel doesn't have required data, don't render
  if (!channel || !channel.channel_id) {
    return null;
  }

  // Fetch available streams for this channel
  useEffect(() => {
    const fetchStreams = async () => {
      setIsLoadingStreams(true);
      try {
        // Get channel ID from UUID
        const channelId = channelsByUUID[channel.channel_id];
        if (channelId) {
          const streamData = await API.getChannelStreams(channelId);
          setAvailableStreams(streamData);
        }
      } catch (error) {
        console.error("Error fetching streams:", error);
      } finally {
        setIsLoadingStreams(false);
      }
    };

    fetchStreams();
  }, [channel.channel_id, channelsByUUID]);

  // Handle stream switching
  const handleStreamChange = async (streamId) => {
    try {
      await API.switchStream(channel.channel_id, streamId);
      notifications.show({
        title: 'Stream switching',
        message: `Switching stream for ${channel.name}`,
        color: 'blue.5',
      });
    } catch (error) {
      notifications.show({
        title: 'Error switching stream',
        message: error.toString(),
        color: 'red.5',
      });
    }
  };

  const clientsColumns = useMemo(
    () => [
      {
        header: 'IP Address',
        accessorKey: 'ip_address',
        size: 50,
      },
    ],
    []
  );

  // This hook is now at the top level of this component
  const channelClientsTable = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns: clientsColumns,
    data: clients.filter(
      (client) => client.channel.channel_id === channel.channel_id
    ),
    enablePagination: false,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enableRowSelection: false,
    enableColumnFilters: false,
    mantineTableBodyCellProps: {
      style: {
        padding: 4,
        borderColor: '#444',
        color: '#E0E0E0',
        fontSize: '0.85rem',
      },
    },
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Center>
          <ActionIcon
            size="sm"
            variant="transparent"
            color="red.9"
            onClick={() =>
              stopClient(row.original.channel.uuid, row.original.client_id)
            }
          >
            <SquareX size="18" />
          </ActionIcon>
        </Center>
      </Box>
    ),
    renderDetailPanel: ({ row }) => <Box>{row.original.user_agent}</Box>,
    mantineExpandButtonProps: ({ row, table }) => ({
      size: 'xs',
      style: {
        transform: row.getIsExpanded() ? 'rotate(180deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s',
      },
    }),
    displayColumnDefOptions: {
      'mrt-row-expand': {
        size: 15,
        header: '',
      },
      'mrt-row-actions': {
        size: 74,
      },
    },
  });

  if (location.pathname != '/stats') {
    return <></>;
  }

  // Get logo URL from the logos object if available
  const logoUrl = channel.logo_id && logos && logos[channel.logo_id] ?
    logos[channel.logo_id].cache_url : null;

  // Ensure these values exist to prevent errors
  const channelName = channel.name || 'Unnamed Channel';
  const uptime = channel.uptime || 0;
  const bitrates = channel.bitrates || [];
  const totalBytes = channel.total_bytes || 0;
  const clientCount = channel.client_count || 0;
  const avgBitrate = channel.avg_bitrate || '0 Kbps';
  const streamProfileName = channel.stream_profile?.name || 'Unknown Profile';

  // Create select options for available streams
  const streamOptions = availableStreams.map(stream => ({
    value: stream.id.toString(),
    label: stream.name || `Stream #${stream.id}`
  }));

  return (
    <Card
      key={channel.channel_id}
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      style={{
        color: '#fff',
        backgroundColor: '#27272A',
      }}
    >
      <Stack style={{ position: 'relative' }}>
        <Group justify="space-between">
          <img src={logoUrl || logo} width="100" alt="channel logo" />

          <Group>
            <Box>
              <Tooltip label={getStartDate(uptime)}>
                <Center>
                  <Timer style={{ paddingRight: 5 }} />
                  {dayjs.duration(uptime, 'seconds').humanize()}
                </Center>
              </Tooltip>
            </Box>
            <Center>
              <Tooltip label="Stop Channel">
                <ActionIcon
                  variant="transparent"
                  color="red.9"
                  onClick={() => stopChannel(channel.channel_id)}
                >
                  <SquareX size="24" />
                </ActionIcon>
              </Tooltip>
            </Center>
          </Group>
        </Group>

        <Flex justify="space-between" align="center">
          <Group>
            <Text fw={500}>{channelName}</Text>
          </Group>

          <Group gap={5}>
            <Video size="18" />
            {streamProfileName}
          </Group>
        </Flex>

        {/* Add stream selection dropdown */}
        {availableStreams.length > 0 && (
          <Select
            size="xs"
            label="Active Stream"
            placeholder={isLoadingStreams ? "Loading streams..." : "Select stream"}
            data={streamOptions}
            value={channel.stream_id ? channel.stream_id.toString() : null}
            onChange={handleStreamChange}
            disabled={isLoadingStreams}
            style={{ marginTop: '8px' }}
          />
        )}

        <Group justify="space-between">
          <Group gap={4}>
            <Gauge style={{ paddingRight: 5 }} size="22" />
            <Text size="sm">{formatSpeed(bitrates.at(-1) || 0)}</Text>
          </Group>

          <Text size="sm">Avg: {avgBitrate}</Text>

          <Group gap={4}>
            <HardDriveDownload size="18" />
            <Text size="sm">{formatBytes(totalBytes)}</Text>
          </Group>

          <Group gap={5}>
            <Users size="18" />
            <Text size="sm">{clientCount}</Text>
          </Group>
        </Group>

        <MantineReactTable table={channelClientsTable} />
      </Stack>
    </Card>
  );
};

const ChannelsPage = () => {
  const theme = useMantineTheme();

  const channels = useChannelsStore((s) => s.channels);
  const channelsByUUID = useChannelsStore((s) => s.channelsByUUID);
  const channelStats = useChannelsStore((s) => s.stats);
  const logos = useChannelsStore((s) => s.logos); // Add logos from the store
  const streamProfiles = useStreamProfilesStore((s) => s.profiles);

  const [activeChannels, setActiveChannels] = useState({});
  const [clients, setClients] = useState([]);

  const channelsColumns = useMemo(
    () => [
      {
        id: 'logo',
        header: 'Logo',
        accessorKey: 'logo_url',
        size: 50,
        Cell: ({ cell }) => (
          <Center>
            <img src={cell.getValue() || logo} width="20" alt="channel logo" />
          </Center>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        accessorKey: 'name',
        Cell: ({ cell }) => (
          <div
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cell.getValue()}
          </div>
        ),
      },
      {
        id: 'started',
        header: 'Started',
        accessorFn: (row) => {
          // Get the current date and time
          const currentDate = new Date();
          // Calculate the start date by subtracting uptime (in milliseconds)
          const startDate = new Date(currentDate.getTime() - row.uptime * 1000);
          // Format the date as a string (you can adjust the format as needed)
          return startDate.toLocaleString({
            weekday: 'short', // optional, adds day of the week
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true, // 12-hour format with AM/PM
          });
        },
      },
      {
        id: 'uptime',
        header: 'Uptime',
        size: 50,
        accessorFn: (row) => {
          const days = Math.floor(row.uptime / (3600 * 24)); // Calculate the number of days
          const hours = Math.floor((row.uptime % (3600 * 24)) / 3600); // Calculate remaining hours
          const minutes = Math.floor((row.uptime % 3600) / 60); // Calculate remaining minutes
          const seconds = parseInt(row.uptime % 60); // Remaining seconds

          // Format uptime as "d hh:mm:ss"
          return `${days ? days : ''} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        },
        mantineTableBodyCellProps: {
          align: 'right',
        },
      },
      {
        id: 'num_clients',
        header: 'Clients',
        accessorKey: 'client_count',
        size: 50,
        mantineTableBodyCellProps: {
          align: 'center',
        },
      },
    ],
    []
  );

  const stopChannel = async (id) => {
    await API.stopChannel(id);
  };

  const stopClient = async (channelId, clientId) => {
    await API.stopClient(channelId, clientId);
  };

  // The main clientsTable is no longer needed since each channel card has its own table

  useEffect(() => {
    if (!channelStats || !channelStats.channels || !Array.isArray(channelStats.channels) || channelStats.channels.length === 0) {
      console.log("No channel stats available:", channelStats);
      // Clear active channels when there are no stats
      if (Object.keys(activeChannels).length > 0) {
        setActiveChannels({});
        setClients([]);
      }
      return;
    }

    // Create a completely new object based only on current channel stats
    const stats = {};

    // Track which channels are currently active according to channelStats
    const currentActiveChannelIds = new Set(
      channelStats.channels.map(ch => ch.channel_id).filter(Boolean)
    );

    channelStats.channels.forEach(ch => {
      // Make sure we have a valid channel_id
      if (!ch.channel_id) {
        console.warn("Found channel without channel_id:", ch);
        return;
      }

      let bitrates = [];
      if (activeChannels[ch.channel_id]) {
        bitrates = [...(activeChannels[ch.channel_id].bitrates || [])];
        const bitrate =
          ch.total_bytes - activeChannels[ch.channel_id].total_bytes;
        if (bitrate > 0) {
          bitrates.push(bitrate);
        }

        if (bitrates.length > 15) {
          bitrates = bitrates.slice(1);
        }
      }

      // Find corresponding channel data
      const channelData = channelsByUUID && ch.channel_id ?
        channels[channelsByUUID[ch.channel_id]] : null;

      // Find stream profile
      const streamProfile = streamProfiles.find(
        profile => profile.id == parseInt(ch.stream_profile)
      );

      stats[ch.channel_id] = {
        ...ch,
        ...(channelData || {}), // Safely merge channel data if available
        bitrates,
        stream_profile: streamProfile || { name: 'Unknown' },
      };
    });

    console.log("Processed active channels:", stats);
    setActiveChannels(stats);

    const clientStats = Object.values(stats).reduce((acc, ch) => {
      if (ch.clients && Array.isArray(ch.clients)) {
        return acc.concat(
          ch.clients.map((client) => ({
            ...client,
            channel: ch,
          }))
        );
      }
      return acc;
    }, []);
    setClients(clientStats);
  }, [channelStats, channels, channelsByUUID, streamProfiles]);

  // Add debug output
  useEffect(() => {
    console.log("Channel stats from store:", channelStats);
    console.log("Active channels state:", activeChannels);
  }, [channelStats, activeChannels]);

  return (
    <SimpleGrid cols={3} spacing="md" style={{ padding: 10 }}>
      {Object.keys(activeChannels).length === 0 ? (
        <Box style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
          <Text size="xl" color="dimmed">No active channels currently streaming</Text>
        </Box>
      ) : (
        Object.values(activeChannels).map((channel) => (
          <ChannelCard
            key={channel.channel_id}
            channel={channel}
            clients={clients}
            stopClient={stopClient}
            stopChannel={stopChannel}
            logos={logos} // Pass logos to the component
            channelsByUUID={channelsByUUID} // Pass channelsByUUID to fix the error
          />
        ))
      )}
    </SimpleGrid>
  );
};

export default ChannelsPage;
