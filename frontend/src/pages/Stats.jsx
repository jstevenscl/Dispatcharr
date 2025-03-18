import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ActionIcon, Box, Center, Grid, Text } from '@mantine/core';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { TableHelper } from '../helpers';
import API from '../api';
import useChannelsStore from '../store/channels';
import logo from '../images/logo.png';
import {
  Tv2,
  ScreenShare,
  Scroll,
  SquareMinus,
  CirclePlay,
  SquarePen,
  Binary,
  ArrowDown01,
  SquareX,
} from 'lucide-react';

const ChannelsPage = () => {
  const { channels, channelsByUUID, stats: channelStats } = useChannelsStore();
  const [activeChannels, setActiveChannels] = useState([]);
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
          }); // This will give you a string like: "2025-03-14T14:00:00.000Z"
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

  const channelsTable = useMantineReactTable({
    ...TableHelper.defaultProperties,
    renderTopToolbar: false,
    columns: channelsColumns,
    data: activeChannels,
    enableRowActions: true,
    mantineTableBodyCellProps: {
      style: {
        padding: 4,
        borderColor: '#444',
        color: '#E0E0E0',
        fontSize: '0.85rem',
      },
    },
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Center>
          <ActionIcon
            size="sm"
            variant="transparent"
            color="red.9"
            onClick={() => stopChannel(row.original.uuid)}
          >
            <SquareX size="18" />
          </ActionIcon>
        </Center>
      </Box>
    ),
  });

  const clientsTable = useMantineReactTable({
    ...TableHelper.defaultProperties,
    renderTopToolbar: false,
    data: clients,
    columns: useMemo(
      () => [
        {
          id: 'logo',
          header: 'Logo',
          accessorKey: 'channel.logo_url',
          size: 50,
          Cell: ({ cell }) => (
            <Center>
              <img
                src={cell.getValue() || logo}
                width="20"
                alt="channel logo"
              />
            </Center>
          ),
        },
        {
          header: 'Channel',
          accessorKey: 'channel.name',
          size: 100,
          mantineTableBodyCellProps: {
            style: {
              whiteSpace: 'nowrap',
              maxWidth: 100,
            },
          },
        },
        {
          header: 'User-Agent',
          accessorKey: 'user_agent',
          size: 250,
          mantineTableBodyCellProps: {
            style: {
              whiteSpace: 'nowrap',
              maxWidth: 400,
            },
          },
        },
        {
          header: 'IP Address',
          accessorKey: 'ip_address',
          size: 50,
        },
      ],
      []
    ),
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
    mantineTableContainerProps: {
      style: {
        height: '100%',
        overflowY: 'auto',
      },
    },
  });

  useEffect(() => {
    const stats = channelStats.channels.map((ch) => ({
      ...ch,
      ...channels[channelsByUUID[ch.channel_id]],
    }));
    setActiveChannels(stats);

    const clientStats = stats.reduce((acc, ch) => {
      return acc.concat(
        ch.clients.map((client) => ({
          ...client,
          channel: ch,
        }))
      );
    }, []);
    setClients(clientStats);
  }, [channelStats]);

  return (
    <Grid style={{ padding: 18 }}>
      <Grid.Col span={6}>
        <Text
          w={88}
          h={24}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            marginBottom: 0,
          }}
        >
          Channels
        </Text>
        <Box style={{ paddingTop: 10 }}>
          <MantineReactTable table={channelsTable} />
        </Box>
      </Grid.Col>
      <Grid.Col span={6}>
        <Text
          w={88}
          h={24}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            marginBottom: 0,
          }}
        >
          Clients
        </Text>
        <Box style={{ paddingTop: 10 }}>
          <MantineReactTable table={clientsTable} />
        </Box>
      </Grid.Col>
    </Grid>
  );
};

export default ChannelsPage;
