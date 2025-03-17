import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ActionIcon, Box, Center, Grid } from '@mantine/core';
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
  const { channels, stats: channelStats } = useChannelsStore();
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

  const stopClient = async (id) => {
    await API.stopClient(id);
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
  });

  useEffect(() => {
    const stats = channelStats.channels.map((ch) => ({
      ...ch,
      ...Object.values(channels).filter(
        (channel) => channel.uuid === channelStats.channels[0].channel_id
      )[0],
    }));
    setActiveChannels(stats);

    console.log(stats);

    const clientStats = stats.reduce((acc, ch) => {
      return acc.concat(
        ch.clients.map((client) => ({
          ...client,
          channel: ch,
        }))
      );
    }, []);
    setClients(clientStats);
    console.log(clientStats);
  }, [channelStats]);

  // const fetchData = useCallback(async () => {
  //   const response = await API.getChannelStats();
  //   const channelStats = response.channels.map((ch) => ({
  //     ...ch,
  //     ...Object.values(channels).filter(
  //       (channel) => channel.uuid === response.channels[0].channel_id
  //     )[0],
  //   }));
  //   setActiveChannels(channelStats);

  //   console.log(channelStats);

  //   const clientStats = channelStats.reduce((acc, ch) => {
  //     return acc.concat(
  //       ch.clients.map((client) => ({
  //         ...client,
  //         channel: ch,
  //       }))
  //     );
  //   }, []);
  //   setClients(clientStats);
  //   console.log(clientStats);
  // }, [channels]);

  // useEffect(() => {
  //   fetchData();
  // }, [fetchData]);

  return (
    <Grid style={{ padding: 18 }}>
      <Grid.Col span={6}>
        <Box
          style={{
            height: '100vh - 20px', // Full viewport height
            paddingTop: 0, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 0.5,
            paddingLeft: 0,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <MantineReactTable table={channelsTable} />
        </Box>
      </Grid.Col>
      <Grid.Col span={6}>
        <Box
          style={{
            height: '100vh - 20px', // Full viewport height
            paddingTop: 0, // Top padding
            paddingBottom: 1, // Bottom padding
            paddingRight: 0,
            paddingLeft: 0.5,
            boxSizing: 'border-box', // Include padding in height calculation
            overflow: 'hidden', // Prevent parent scrolling
          }}
        >
          <MantineReactTable table={clientsTable} />
        </Box>
      </Grid.Col>
    </Grid>
  );
};

export default ChannelsPage;
