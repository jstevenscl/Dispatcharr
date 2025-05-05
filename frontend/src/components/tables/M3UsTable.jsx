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
  Progress,
  Stack,
  Badge,
  Group,
} from '@mantine/core';
import { SquareMinus, SquarePen, RefreshCcw, Check, X } from 'lucide-react';
import { IconSquarePlus } from '@tabler/icons-react'; // Import custom icons
import dayjs from 'dayjs';
import useSettingsStore from '../../store/settings';
import useLocalStorage from '../../hooks/useLocalStorage';

// Helper function to format status text
const formatStatusText = (status) => {
  switch (status) {
    case 'idle': return 'Idle';
    case 'fetching': return 'Fetching';
    case 'parsing': return 'Parsing';
    case 'error': return 'Error';
    case 'success': return 'Success';
    default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
};

// Helper function to get status text color
const getStatusColor = (status) => {
  switch (status) {
    case 'idle': return 'gray.5';
    case 'fetching': return 'blue.5';
    case 'parsing': return 'indigo.5';
    case 'error': return 'red.5';
    case 'success': return 'green.5';
    default: return 'gray.5';
  }
};

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
  const [tableSize] = useLocalStorage('table-size', 'default');

  const generateStatusString = (data) => {
    if (data.progress == 100) {
      return 'Idle';
    }

    switch (data.action) {
      case 'initializing':
        return buildInitializingStats();

      case 'downloading':
        return buildDownloadingStats(data);

      case 'processing_groups':
        return buildGroupProcessingStats(data);

      case 'parsing':
        return buildParsingStats(data);

      default:
        return data.status === 'error' ? buildErrorStats(data) : `${data.action || 'Processing'}...`;
    }
  };

  const buildDownloadingStats = (data) => {
    if (data.progress == 100) {
      return 'Download complete!';
    }

    if (data.progress == 0) {
      return 'Downloading...';
    }

    // Format time remaining in minutes:seconds
    const timeRemaining = data.time_remaining ?
      `${Math.floor(data.time_remaining / 60)}:${String(Math.floor(data.time_remaining % 60)).padStart(2, '0')}` :
      'calculating...';

    // Format speed with appropriate unit (KB/s or MB/s)
    const speed = data.speed >= 1024 ?
      `${(data.speed / 1024).toFixed(2)} MB/s` :
      `${Math.round(data.speed)} KB/s`;

    return (
      <Box>
        <Flex direction="column" gap={2}>
          <Flex justify="space-between" align="center">
            <Text size="xs" fw={500}>Downloading:</Text>
            <Text size="xs">{parseInt(data.progress)}%</Text>
          </Flex>
          <Flex justify="space-between" align="center">
            <Text size="xs" fw={500}>Speed:</Text>
            <Text size="xs">{speed}</Text>
          </Flex>
          <Flex justify="space-between" align="center">
            <Text size="xs" fw={500}>Time left:</Text>
            <Text size="xs">{timeRemaining}</Text>
          </Flex>
        </Flex>
      </Box>
    );
  };

  const buildGroupProcessingStats = (data) => {
    if (data.progress == 100) {
      return 'Groups processed!';
    }

    if (data.progress == 0) {
      return 'Processing groups...';
    }

    // Format time displays if available
    const elapsedTime = data.elapsed_time ?
      `${Math.floor(data.elapsed_time / 60)}:${String(Math.floor(data.elapsed_time % 60)).padStart(2, '0')}` :
      null;

    return (
      <Box>
        <Flex direction="column" gap={2}>
          <Flex justify="space-between" align="center">
            <Text size="xs" fw={500}>Processing groups:</Text>
            <Text size="xs">{parseInt(data.progress)}%</Text>
          </Flex>
          {elapsedTime && (
            <Flex justify="space-between" align="center">
              <Text size="xs" fw={500}>Elapsed:</Text>
              <Text size="xs">{elapsedTime}</Text>
            </Flex>
          )}
          {data.groups_processed && (
            <Flex justify="space-between" align="center">
              <Text size="xs" fw={500}>Groups:</Text>
              <Text size="xs">{data.groups_processed}</Text>
            </Flex>
          )}
        </Flex>
      </Box>
    );
  };

  const buildErrorStats = (data) => {
    return (
      <Box>
        <Flex direction="column" gap={2}>
          <Flex align="center">
            <Text size="xs" fw={500} color="red">Error:</Text>
          </Flex>
          <Text size="xs" color="red" style={{ lineHeight: 1.3 }}>{data.error || "Unknown error occurred"}</Text>
        </Flex>
      </Box>
    );
  };

  const buildParsingStats = (data) => {
    if (data.progress == 100) {
      return 'Parsing complete!';
    }

    if (data.progress == 0) {
      return 'Parsing...';
    }

    // Format time displays
    const timeRemaining = data.time_remaining ?
      `${Math.floor(data.time_remaining / 60)}:${String(Math.floor(data.time_remaining % 60)).padStart(2, '0')}` :
      'calculating...';

    const elapsedTime = data.elapsed_time ?
      `${Math.floor(data.elapsed_time / 60)}:${String(Math.floor(data.elapsed_time % 60)).padStart(2, '0')}` :
      '0:00';

    return (
      <Box>
        <Flex direction="column" gap={2}>
          <Flex justify="space-between" align="center">
            <Text size="xs" fw={500}>Parsing:</Text>
            <Text size="xs">{parseInt(data.progress)}%</Text>
          </Flex>
          {data.elapsed_time && (
            <Flex justify="space-between" align="center">
              <Text size="xs" fw={500}>Elapsed:</Text>
              <Text size="xs">{elapsedTime}</Text>
            </Flex>
          )}
          {data.time_remaining && (
            <Flex justify="space-between" align="center">
              <Text size="xs" fw={500}>Remaining:</Text>
              <Text size="xs">{timeRemaining}</Text>
            </Flex>
          )}
          {data.streams_processed && (
            <Flex justify="space-between" align="center">
              <Text size="xs" fw={500}>Streams:</Text>
              <Text size="xs">{data.streams_processed}</Text>
            </Flex>
          )}
        </Flex>
      </Box>
    );
  };

  const buildInitializingStats = () => {
    return (
      <Box>
        <Flex direction="column" gap={2}>
          <Flex align="center">
            <Text size="xs" fw={500}>Initializing refresh...</Text>
          </Flex>
        </Flex>
      </Box>
    );
  };

  const editPlaylist = async (playlist = null) => {
    if (playlist) {
      setPlaylist(playlist);
    }
    setPlaylistModalOpen(true);
  };

  const refreshPlaylist = async (id) => {
    // Provide immediate visual feedback before the API call
    setRefreshProgress(id, {
      action: 'initializing',
      progress: 0,
      account: id,
      type: 'm3u_refresh'
    });

    try {
      await API.refreshPlaylist(id);
      // No need to set again since WebSocket will update us once the task starts
    } catch (error) {
      // If the API call fails, show an error state
      setRefreshProgress(id, {
        action: 'error',
        progress: 0,
        account: id,
        type: 'm3u_refresh',
        error: 'Failed to start refresh task',
        status: 'error'
      });
    }
  };

  const deletePlaylist = async (id) => {
    setIsLoading(true);
    await API.deletePlaylist(id);
    setIsLoading(false);
  };

  const toggleActive = async (playlist) => {
    try {
      // Send only the is_active field to trigger our special handling
      await API.updatePlaylist({
        id: playlist.id,
        is_active: !playlist.is_active,
      }, true); // Add a new parameter to indicate this is just a toggle
    } catch (error) {
      console.error('Error toggling active state:', error);
    }
  };

  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        size: 150,
        minSize: 100, // Minimum width
      },
      {
        header: 'Account Type',
        accessorKey: 'account_type',
        size: 100,
        Cell: ({ cell }) => {
          const value = cell.getValue();
          return value === 'XC' ? 'XC' : 'M3U';
        },
      },
      {
        header: 'URL / File',
        accessorKey: 'server_url',
        size: 200,
        minSize: 120,
        Cell: ({ cell, row }) => {
          const value = cell.getValue() || row.original.file_path || '';
          return (
            <Tooltip label={value} disabled={!value}>
              <div
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {value}
              </div>
            </Tooltip>
          );
        },
      },
      {
        header: 'Max Streams',
        accessorKey: 'max_streams',
        size: 100,
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 100,
        Cell: ({ cell }) => {
          const value = cell.getValue();
          if (!value) return null;

          // Match EPG table styling with Text component - always use xs size
          return (
            <Text size="xs" c={getStatusColor(value)}>
              {formatStatusText(value)}
            </Text>
          );
        },
      },
      {
        header: 'Status Message',
        accessorKey: 'last_message',
        size: 250,         // Increase default size
        minSize: 200,      // Set minimum size
        maxSize: 400,      // Allow expansion up to this size
        Cell: ({ cell, row }) => {
          const value = cell.getValue();
          const data = row.original;

          // Get account id to check for refresh progress
          const accountId = data.id;
          const progressData = refreshProgress[accountId];

          // If we have active progress data for this account, show that instead
          if (progressData && progressData.progress < 100) {
            return (
              <Box style={{
                // Use full height of the cell with proper spacing
                height: '100%',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                // Add some padding to give content room to breathe
                padding: '4px 0'
              }}>
                {generateStatusString(progressData)}
              </Box>
            );
          }

          // No progress data, display normal status message
          if (!value) return null;

          // Show error message with red styling for errors
          if (data.status === 'error') {
            return (
              <Tooltip label={value} multiline width={300}>
                <Text c="dimmed" size="xs" lineClamp={2} style={{ color: theme.colors.red[6], lineHeight: 1.3 }}>
                  {value}
                </Text>
              </Tooltip>
            );
          }

          // Show success message with green styling for success
          if (data.status === 'success') {
            return (
              <Tooltip label={value} multiline width={300}>
                <Text c="dimmed" size="xs" style={{ color: theme.colors.green[6], lineHeight: 1.3 }}>
                  {value}
                </Text>
              </Tooltip>
            );
          }

          // For all other status values, just use dimmed text
          return (
            <Tooltip label={value} multiline width={300}>
              <Text c="dimmed" size="xs" lineClamp={2} style={{ lineHeight: 1.3 }}>
                {value}
              </Text>
            </Tooltip>
          );
        },
      },
      {
        header: 'Updated',
        accessorKey: 'updated_at',
        size: 120,
        Cell: ({ cell }) => {
          const value = cell.getValue();
          return value ? <Text size="xs">{new Date(value).toLocaleString()}</Text> : <Text size="xs">Never</Text>;
        },
      },
      {
        header: 'Active',
        accessorKey: 'is_active',
        size: 80,
        Cell: ({ cell, row }) => {
          return (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Switch
                size="xs"
                checked={cell.getValue()}
                onChange={() => toggleActive(row.original)}
              />
            </Box>
          );
        },
      },
      // Remove the custom Actions column here
    ],
    [refreshPlaylist, editPlaylist, deletePlaylist, toggleActive]
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

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

  const tableDensity = tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'xl' : 'md';

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    // Sort data before passing to table: active first, then by name
    data: playlists
      .filter((playlist) => playlist.locked === false)
      .sort((a, b) => {
        // First sort by active status (active items first)
        if (a.is_active !== b.is_active) {
          return a.is_active ? -1 : 1;
        }
        // Then sort by name (case-insensitive)
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      }),
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
      // Use density directly from tableSize
      density: tableDensity,
    },
    rowVirtualizerInstanceRef, //optional
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      // Use density directly from tableSize
      density: tableDensity,
    },
    enableRowActions: true, // Enable row actions
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
          size={tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'md' : 'sm'} // Use standardized icon size
          color="yellow.5"
          onClick={() => {
            editPlaylist(row.original);
          }}
        >
          <SquarePen size={tableSize === 'compact' ? 16 : 18} />
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size={tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'md' : 'sm'} // Use standardized icon size
          color="red.9"
          onClick={() => deletePlaylist(row.original.id)}
        >
          <SquareMinus size={tableSize === 'compact' ? 16 : 18} />
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size={tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'md' : 'sm'} // Use standardized icon size
          color="blue.5"
          onClick={() => refreshPlaylist(row.original.id)}
          disabled={!row.original.is_active}
        >
          <RefreshCcw size={tableSize === 'compact' ? 16 : 18} />
        </ActionIcon>
      </>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(40vh - 10px)',
        overflowX: 'auto', // Ensure horizontal scrolling works
      },
    },
    mantineTableProps: {
      ...TableHelper.defaultProperties.mantineTableProps,
      className: `table-size-${tableSize}`,
    },
    // Add custom cell styles to match CustomTable's sizing
    mantineTableBodyCellProps: ({ cell }) => {
      // Check if this is a status message cell with active progress
      const progressData = cell.column.id === 'last_message' &&
        refreshProgress[cell.row.original.id] &&
        refreshProgress[cell.row.original.id].progress < 100 ?
        refreshProgress[cell.row.original.id] : null;

      // Only expand height for certain actions that need more space
      const needsExpandedHeight = progressData &&
        ['downloading', 'parsing', 'processing_groups'].includes(progressData.action);

      return {
        style: {
          // Apply taller height for progress cells (except initializing), otherwise use standard height
          height: needsExpandedHeight ? '80px' : (
            tableSize === 'compact' ? '28px' : tableSize === 'large' ? '48px' : '40px'
          ),
          fontSize: tableSize === 'compact' ? 'var(--mantine-font-size-xs)' : 'var(--mantine-font-size-sm)',
          padding: tableSize === 'compact' ? '2px 8px' : '4px 10px'
        }
      };
    },
    // Additional text styling to match ChannelsTable
    mantineTableBodyProps: {
      style: {
        fontSize: tableSize === 'compact' ? 'var(--mantine-font-size-xs)' : 'var(--mantine-font-size-sm)',
      }
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
        m3uAccount={playlist}
        isOpen={playlistModalOpen}
        onClose={closeModal}
        playlistCreated={playlistCreated}
      />
    </Box>
  );
};

export default M3UTable;
