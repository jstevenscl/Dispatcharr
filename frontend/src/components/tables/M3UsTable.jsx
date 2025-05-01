import { useEffect, useMemo, useRef, useState } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import API from '../../api';
import usePlaylistsStore from '../../store/playlists';
import M3UForm from '../forms/M3U';
import { TableHelper } from '../../helpers';
import {
  useMantineTheme,
  Paper,
  Button,
  Flex,
  Text,
  Box,
  ActionIcon,
  Tooltip,
  Switch,
} from '@mantine/core';
import { SquareMinus, SquarePen, RefreshCcw, Check, X } from 'lucide-react';
import { IconSquarePlus } from '@tabler/icons-react'; // Import custom icons
import dayjs from 'dayjs';

const M3UTable = () => {
  const [playlist, setPlaylist] = useState(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [groupFilterModalOpen, setGroupFilterModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [activeFilterValue, setActiveFilterValue] = useState('all');
  const [playlistCreated, setPlaylistCreated] = useState(false);

  const playlists = usePlaylistsStore((s) => s.playlists);
  const refreshProgress = usePlaylistsStore((s) => s.refreshProgress);
  const setRefreshProgress = usePlaylistsStore((s) => s.setRefreshProgress);

  const theme = useMantineTheme();

  const generateStatusString = (data) => {
    if (data.progress == 100) {
      return 'Idle';
    }

    switch (data.action) {
      case 'downloading':
        return buildDownloadingStats(data);

      case 'processing_groups':
        return 'Processing groups...';

      default:
        return buildParsingStats(data);
    }
  };

  const buildDownloadingStats = (data) => {
    if (data.progress == 100) {
      // fetchChannelGroups();
      // fetchPlaylists();
      return 'Download complete!';
    }

    if (data.progress == 0) {
      return 'Downloading...';
    }

    return (
      <Box>
        <Text size="xs">Downloading: {parseInt(data.progress)}%</Text>
        {/* <Text size="xs">Speed: {parseInt(data.speed)} KB/s</Text>
        <Text size="xs">Time Remaining: {parseInt(data.time_remaining)}</Text> */}
      </Box>
    );
  };

  const buildParsingStats = (data) => {
    if (data.progress == 100) {
      // fetchStreams();
      // fetchChannelGroups();
      // fetchEPGData();
      // fetchPlaylists();
      return 'Parsing complete!';
    }

    if (data.progress == 0) {
      return 'Parsing...';
    }

    return `Parsing: ${data.progress}%`;
  };

  const toggleActive = async (playlist) => {
    await API.updatePlaylist({
      ...playlist,
      is_active: !playlist.is_active,
    });
  };

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        size: 150,
        minSize: 100, // Minimum width
      },
      {
        header: 'URL / File',
        accessorKey: 'server_url',
        size: 200,
        minSize: 120,
        Cell: ({ cell }) => (
          <div
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {cell.getValue()}
          </div>
        ),
      },
      {
        header: 'Max Streams',
        accessorKey: 'max_streams',
        size: 120,
        minSize: 80,
      },
      {
        header: 'Status',
        accessorFn: (row) => {
          if (!row.id) {
            return '';
          }
          if (!refreshProgress[row.id]) {
            return 'Idle';
          }

          return generateStatusString(refreshProgress[row.id]);
        },
        size: 150,
        minSize: 80,
      },
      {
        header: 'Active',
        accessorKey: 'is_active',
        size: 80,
        minSize: 60,
        sortingFn: 'basic',
        mantineTableBodyCellProps: {
          align: 'left',
        },
        Cell: ({ row, cell }) => (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Switch
              size="xs"
              checked={cell.getValue()}
              onChange={() => toggleActive(row.original)}
            />
          </Box>
        ),
      },
      {
        header: 'Updated',
        accessorFn: (row) => dayjs(row.updated_at).format('MMMM D, YYYY h:mma'),
        size: 180,
        minSize: 100,
        enableSorting: false,
      },
    ],
    [refreshProgress]
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editPlaylist = async (playlist = null) => {
    if (playlist) {
      setPlaylist(playlist);
    }
    setPlaylistModalOpen(true);
  };

  const refreshPlaylist = async (id) => {
    await API.refreshPlaylist(id);
    setRefreshProgress(id, 0);
  };

  const deletePlaylist = async (id) => {
    setIsLoading(true);
    await API.deletePlaylist(id);
    setIsLoading(false);
  };

  const closeModal = (newPlaylist = null) => {
    if (newPlaylist) {
      setPlaylistCreated(true);
      setPlaylist(newPlaylist);
    } else {
      setPlaylistModalOpen(false);
      setPlaylist(null);
      setPlaylistCreated(false);
    }
  };

  const deletePlaylists = async (ids) => {
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    // await API.deleteStreams(selected.map(stream => stream.original.id))
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    //scroll to the top of the table when the sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: playlists.filter((playlist) => playlist.locked === false),
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: false,
    onRowSelectionChange: setRowSelection,
    renderTopToolbar: false,
    onSortingChange: setSorting,
    state: {
      isLoading,
      sorting,
      rowSelection,
    },
    rowVirtualizerInstanceRef, //optional
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    positionActionsColumn: 'last',
    displayColumnDefOptions: {
      'mrt-row-actions': {
        size: 120, // Make action column wider
        minSize: 120, // Ensure minimum width for action buttons
      },
    },
    renderRowActions: ({ row }) => (
      <>
        <ActionIcon
          variant="transparent"
          size="sm"
          color="yellow.5"
          onClick={() => {
            editPlaylist(row.original);
          }}
        >
          <SquarePen size="18" />
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="sm"
          color="red.9"
          onClick={() => deletePlaylist(row.original.id)}
        >
          <SquareMinus size="18" />
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size="sm"
          color="blue.5"
          onClick={() => refreshPlaylist(row.original.id)}
          disabled={!row.original.is_active}
        >
          <RefreshCcw size="18" />
        </ActionIcon>
      </>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(40vh - 10px)',
        overflowX: 'auto', // Ensure horizontal scrolling works
      },
    },
  });

  return (
    <Box>
      <Flex
        style={{ display: 'flex', alignItems: 'center', paddingBottom: 10 }}
        gap={15}
      >
        <Text
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
          M3U Accounts
        </Text>
      </Flex>

      <Paper
        style={{
          bgcolor: theme.palette.background.paper,
          borderRadius: 2,
        }}
      >
        {/* Top toolbar with Remove, Assign, Auto-match, and Add buttons */}
        <Box
          style={{
            display: 'flex',
            // alignItems: 'center',
            // backgroundColor: theme.palette.background.paper,
            justifyContent: 'flex-end',
            padding: 10,
            // gap: 1,
          }}
        >
          <Flex gap={6}>
            <Tooltip label="Assign">
              <Button
                leftSection={<IconSquarePlus size={14} />}
                variant="light"
                size="xs"
                onClick={() => editPlaylist()}
                p={5}
                color="green"
                style={{
                  borderWidth: '1px',
                  borderColor: 'green',
                  color: 'white',
                }}
              >
                Add
              </Button>
            </Tooltip>
          </Flex>
        </Box>
      </Paper>
      <MantineReactTable table={table} />

      <M3UForm
        playlist={playlist}
        isOpen={playlistModalOpen}
        onClose={closeModal}
        playlistCreated={playlistCreated}
      />
    </Box>
  );
};

export default M3UTable;
