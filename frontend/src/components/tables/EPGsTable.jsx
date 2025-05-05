import { useEffect, useMemo, useRef, useState } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import API from '../../api';
import useEPGsStore from '../../store/epgs';
import EPGForm from '../forms/EPG';
import { TableHelper } from '../../helpers';
import {
  ActionIcon,
  Text,
  Tooltip,
  Box,
  Paper,
  Button,
  Flex,
  useMantineTheme,
  Switch,
  Badge,
  Progress,
  Stack,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSquarePlus } from '@tabler/icons-react';
import { RefreshCcw, SquareMinus, SquarePen } from 'lucide-react';
import dayjs from 'dayjs';
import useSettingsStore from '../../store/settings';
import useLocalStorage from '../../hooks/useLocalStorage';

// Helper function to format status text
const formatStatusText = (status) => {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
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

const EPGsTable = () => {
  const [epg, setEPG] = useState(null);
  const [epgModalOpen, setEPGModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);

  const epgs = useEPGsStore((s) => s.epgs);
  const refreshProgress = useEPGsStore((s) => s.refreshProgress);

  const theme = useMantineTheme();
  // Get tableSize directly from localStorage instead of the store
  const [tableSize] = useLocalStorage('table-size', 'default');

  // Get proper size for action icons to match ChannelsTable
  const iconSize = tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'md' : 'sm';

  // Calculate density for Mantine Table
  const tableDensity = tableSize === 'compact' ? 'xs' : tableSize === 'large' ? 'xl' : 'md';

  const toggleActive = async (epg) => {
    try {
      // Send only the is_active field to trigger our special handling
      await API.updateEPG({
        id: epg.id,
        is_active: !epg.is_active,
      }, true); // Add a new parameter to indicate this is just a toggle
    } catch (error) {
      console.error('Error toggling active state:', error);
    }
  };

  const buildProgressDisplay = (data) => {
    const progress = refreshProgress[data.id] || null;

    if (!progress) return null;

    let label = '';
    switch (progress.action) {
      case 'downloading':
        label = 'Downloading';
        break;
      case 'parsing_channels':
        label = 'Parsing Channels';
        break;
      case 'parsing_programs':
        label = 'Parsing Programs';
        break;
      default:
        return null;
    }

    return (
      <Stack spacing={5}>
        <Text size="xs">{label}: {parseInt(progress.progress)}%</Text>
        <Progress value={parseInt(progress.progress)} size="xs" />
        {progress.speed && <Text size="xs">Speed: {parseInt(progress.speed)} KB/s</Text>}
      </Stack>
    );
  };

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        size: 150,
        minSize: 100,
      },
      {
        header: 'Source Type',
        accessorKey: 'source_type',
        size: 120,
        minSize: 100,
      },
      {
        header: 'URL / API Key / File Path',
        accessorKey: 'url',
        size: 200,
        minSize: 120,
        enableSorting: false,
        Cell: ({ cell, row }) => {
          const value = cell.getValue() || row.original.api_key || row.original.file_path || '';
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
        header: 'Status',
        accessorKey: 'status',
        size: 100,
        minSize: 80,
        Cell: ({ row }) => {
          const data = row.original;

          // Always show status text, even when there's progress happening
          return (
            <Text
              size="sm"
              fw={500}
              c={getStatusColor(data.status)}
            >
              {formatStatusText(data.status)}
            </Text>
          );
        },
      },
      {
        header: 'Status Message',
        accessorKey: 'last_message',
        size: 250,
        minSize: 150,
        enableSorting: false,
        Cell: ({ row }) => {
          const data = row.original;

          // Check if there's an active progress for this EPG - show progress first if active
          if (refreshProgress[data.id] && refreshProgress[data.id].progress < 100) {
            return buildProgressDisplay(data);
          }

          // Show error message when status is error
          if (data.status === 'error' && data.last_message) {
            return (
              <Tooltip label={data.last_message} multiline width={300}>
                <Text c="dimmed" size="xs" lineClamp={2} style={{ color: theme.colors.red[6] }}>
                  {data.last_message}
                </Text>
              </Tooltip>
            );
          }

          // Show success message for successful sources
          if (data.status === 'success') {
            return (
              <Text c="dimmed" size="xs" style={{ color: theme.colors.green[6] }}>
                EPG data refreshed successfully
              </Text>
            );
          }

          // Otherwise return empty cell
          return null;
        },
      },
      {
        header: 'Updated',
        accessorFn: (row) => dayjs(row.updated_at).format('MMMM D, YYYY h:mma'),
        size: 180,
        minSize: 100,
        enableSorting: false,
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
    ],
    [refreshProgress]
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editEPG = async (epg = null) => {
    setEPG(epg);
    setEPGModalOpen(true);
  };

  const deleteEPG = async (id) => {
    setIsLoading(true);
    await API.deleteEPG(id);
    setIsLoading(false);
  };

  const refreshEPG = async (id) => {
    await API.refreshEPG(id);
    notifications.show({
      title: 'EPG refresh initiated',
    });
  };

  const closeEPGForm = () => {
    setEPG(null);
    setEPGModalOpen(false);
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
    data: Object.values(epgs),
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: false,
    renderTopToolbar: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading,
      sorting,
      rowSelection,
      density: tableDensity,
    },
    rowVirtualizerInstanceRef, //optional
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: tableDensity,
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
          size={iconSize} // Use standardized icon size
          color="yellow.5" // Red color for delete actions
          onClick={() => editEPG(row.original)}
        >
          <SquarePen size={tableSize === 'compact' ? 16 : 18} /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size={iconSize} // Use standardized icon size
          color="red.9" // Red color for delete actions
          onClick={() => deleteEPG(row.original.id)}
        >
          <SquareMinus size={tableSize === 'compact' ? 16 : 18} /> {/* Small icon size */}
        </ActionIcon>
        <ActionIcon
          variant="transparent"
          size={iconSize} // Use standardized icon size
          color="blue.5" // Red color for delete actions
          onClick={() => refreshEPG(row.original.id)}
          disabled={!row.original.is_active}
        >
          <RefreshCcw size={tableSize === 'compact' ? 16 : 18} /> {/* Small icon size */}
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
        ['downloading', 'parsing_channels', 'parsing_programs'].includes(progressData.action);

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
  });

  return (
    <Box>
      <Flex
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingBottom: 10,
        }}
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
          EPGs
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
                leftSection={<IconSquarePlus size={18} />}
                variant="light"
                size="xs"
                onClick={() => editEPG()}
                p={5}
                color="green"
                style={{
                  borderWidth: '1px',
                  borderColor: 'green',
                  color: 'white',
                }}
              >
                Add EPG
              </Button>
            </Tooltip>
          </Flex>
        </Box>
      </Paper>

      <MantineReactTable table={table} />
      <EPGForm epg={epg} isOpen={epgModalOpen} onClose={closeEPGForm} />
    </Box>
  );
};

export default EPGsTable;
