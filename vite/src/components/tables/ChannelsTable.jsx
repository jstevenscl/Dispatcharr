import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import useChannelsStore from '../../store/channels';
import useAlertStore from '../../store/alerts';
import {
  Add as AddIcon,
  LiveTv as LiveTvIcon,
  ContentCopy,
  IndeterminateCheckBox,
  CompareArrows,
  Code,
  AddBox,
} from '@mui/icons-material';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import { TableHelper } from '../../helpers';
import utils from '../../utils';
import logo from '../../images/logo.png';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';
import usePlaylistsStore from '../../store/playlists';
import {
  Tv2,
  ScreenShare,
  Scroll,
  SquareMinus,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TvMinimalPlay,
} from 'lucide-react';
import ghostImage from '../../images/ghost.svg';
import {
  Box,
  TextInput,
  Popover,
  ActionIcon,
  Select,
  Button,
  Paper,
  Flex,
  Center,
  Text,
  Tooltip,
  Grid,
  Group,
  useMantineTheme,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconDeviceDesktopSearch,
  IconSelector,
  IconSortAscendingNumbers,
  IconSquarePlus,
} from '@tabler/icons-react'; // Import custom icons

const ChannelStreams = ({ channel, isExpanded }) => {
  const channelStreams = useChannelsStore(
    (state) => state.channels[channel.id]?.streams
  );
  const { playlists } = usePlaylistsStore();

  const removeStream = async (stream) => {
    const newStreamList = channelStreams.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      stream_ids: newStreamList.map((s) => s.id),
    });
  };

  const channelStreamsTable = useMantineReactTable({
    ...TableHelper.defaultProperties,
    data: channelStreams,
    columns: useMemo(
      () => [
        {
          header: 'Name',
          accessorKey: 'name',
        },
        {
          header: 'M3U',
          accessorFn: (row) =>
            playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
        },
      ],
      [playlists]
    ),
    enableKeyboardShortcuts: false,
    enableColumnFilters: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableColumnHeaders: false,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    enableRowOrdering: true,
    mantineRowDragHandleProps: ({ table }) => ({
      onDragEnd: async () => {
        const { draggingRow, hoveredRow } = table.getState();

        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );

          const { streams: _, ...channelUpdate } = channel;

          API.updateChannel({
            ...channelUpdate,
            stream_ids: channelStreams.map((stream) => stream.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <Tooltip label="Remove stream">
        <ActionIcon
          size="sm"
          color="red.9"
          variant="transparent"
          onClick={() => removeStream(row.original)}
        >
          <SquareMinus size="18" fontSize="small" />
        </ActionIcon>
      </Tooltip>
    ),
  });

  if (!isExpanded) {
    return <></>;
  }

  return (
    <Box
      sx={{
        backgroundColor: 'primary.main',
        pt: 1,
        pb: 1,
        width: '100%',
      }}
    >
      <MantineReactTable table={channelStreamsTable} />
    </Box>
  );
};

// /* -----------------------------------------------------------
//    2) Custom-styled "chip" buttons for HDHR, M3U, EPG
// ------------------------------------------------------------ */
// const HDHRButton = styled(Button)(() => ({
//   border: '1px solid #a3d977',
//   color: '#a3d977',
//   backgroundColor: 'transparent',
//   textTransform: 'none',
//   fontSize: '0.85rem',
//   display: 'flex',
//   alignItems: 'center',
//   gap: '4px',
//   padding: '2px 8px',
//   minWidth: 'auto',
//   '&:hover': {
//     borderColor: '#c2e583',
//     color: '#c2e583',
//     backgroundColor: 'rgba(163,217,119,0.1)',
//   },
// }));

// const M3UButton = styled(Button)(() => ({
//   border: '1px solid #5f6dc6',
//   color: '#5f6dc6',
//   backgroundColor: 'transparent',
//   textTransform: 'none',
//   fontSize: '0.85rem',
//   display: 'flex',
//   alignItems: 'center',
//   gap: '4px',
//   padding: '2px 8px',
//   minWidth: 'auto',
//   '&:hover': {
//     borderColor: '#7f8de6',
//     color: '#7f8de6',
//     backgroundColor: 'rgba(95,109,198,0.1)',
//   },
// }));

// const EPGButton = styled(Button)(() => ({
//   border: '1px solid #707070',
//   color: '#a0a0a0',
//   backgroundColor: 'transparent',
//   textTransform: 'none',
//   fontSize: '0.85rem',
//   display: 'flex',
//   alignItems: 'center',
//   gap: '4px',
//   padding: '2px 8px',
//   minWidth: 'auto',
//   '&:hover': {
//     borderColor: '#a0a0a0',
//     color: '#c0c0c0',
//     backgroundColor: 'rgba(112,112,112,0.1)',
//   },
// }));

const ChannelsTable = ({}) => {
  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [channelGroupOptions, setChannelGroupOptions] = useState([]);

  const [anchorEl, setAnchorEl] = useState(null);
  const [textToCopy, setTextToCopy] = useState('');

  const [filterValues, setFilterValues] = useState({});

  // const theme = useTheme();
  const theme = useMantineTheme();

  const { showVideo } = useVideoStore();
  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
  } = useChannelsStore();
  const { showAlert } = useAlertStore();

  useEffect(() => {
    setChannelGroupOptions([
      ...new Set(
        Object.values(channels).map((channel) => channel.channel_group?.name)
      ),
    ]);
  }, [channels]);

  const handleFilterChange = (columnId, value) => {
    console.log(columnId);
    console.log(value);
    setFilterValues((prev) => ({
      ...prev,
      [columnId]: value ? value.toLowerCase() : '',
    }));
  };

  const outputUrlRef = useRef(null);

  const {
    environment: { env_mode },
  } = useSettingsStore();

  // Configure columns
  const columns = useMemo(
    () => [
      {
        header: '#',
        size: 50,
        accessorKey: 'channel_number',
      },
      {
        header: 'Name',
        accessorKey: 'channel_name',
        muiTableHeadCellProps: {
          sx: { textAlign: 'center' },
        },
        Header: ({ column }) => (
          <TextInput
            placeholder="Name"
            value={filterValues[column.id]}
            onChange={(e) => handleFilterChange(column.id, e.target.value)}
            size="xs"
          />
        ),
        meta: {
          filterVariant: null,
        },
      },
      {
        header: 'Group',
        accessorFn: (row) => row.channel_group?.name || '',
        Header: ({ column }) => (
          <Select
            placeholder="Group"
            searchable
            size="xs"
            nothingFound="No options"
            // onChange={(e, value) => {
            //   e.stopPropagation();
            //   handleGroupChange(value);
            // }}
            data={channelGroupOptions}
          />
        ),
      },
      {
        header: 'Logo',
        accessorKey: 'logo_url',
        enableSorting: false,
        size: 55,
        Cell: ({ cell }) => (
          <Grid
            container
            direction="row"
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img src={cell.getValue() || logo} width="20" alt="channel logo" />
          </Grid>
        ),
        meta: {
          filterVariant: null,
        },
      },
    ],
    [channelGroupOptions, filterValues]
  );

  // Access the row virtualizer instance (optional)
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const editChannel = async (ch = null) => {
    setChannel(ch);
    setChannelModalOpen(true);
  };

  const deleteChannel = async (id) => {
    await API.deleteChannel(id);
  };

  function handleWatchStream(channelNumber) {
    let vidUrl = `/output/stream/${channelNumber}/`;
    if (env_mode == 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  }

  // (Optional) bulk delete, but your endpoint is @TODO
  const deleteChannels = async () => {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => deleteChannel(chan.original.id))
    );
    // If you have a real bulk-delete endpoint, call it here:
    // await API.deleteChannels(selected.map((sel) => sel.id));
    setIsLoading(false);
  };

  // ─────────────────────────────────────────────────────────
  // The "Assign Channels" button logic
  // ─────────────────────────────────────────────────────────
  const assignChannels = async () => {
    try {
      // Get row order from the table
      const rowOrder = table.getRowModel().rows.map((row) => row.original.id);

      // Call our custom API endpoint
      setIsLoading(true);
      const result = await API.assignChannelNumbers(rowOrder);
      setIsLoading(false);

      // We might get { message: "Channels have been auto-assigned!" }
      showAlert(result.message || 'Channels assigned');

      // Refresh the channel list
      await fetchChannels();
    } catch (err) {
      console.error(err);
      showAlert('Failed to assign channels');
    }
  };

  // ─────────────────────────────────────────────────────────
  // The new "Match EPG" button logic
  // ─────────────────────────────────────────────────────────
  const matchEpg = async () => {
    try {
      // Hit our new endpoint that triggers the fuzzy matching Celery task
      const resp = await fetch('/api/channels/channels/match-epg/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await API.getAuthToken()}`,
        },
      });

      if (resp.ok) {
        showAlert('EPG matching task started!');
      } else {
        const text = await resp.text();
        showAlert(`Failed to start EPG matching: ${text}`);
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`);
    }
  };

  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Scroll to the top of the table when sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      showAlert('Copied!');
    } catch (err) {
      const inputElement = outputUrlRef.current.querySelector('input'); // Get the actual input

      if (inputElement) {
        inputElement.focus();
        inputElement.select();

        // For older browsers
        document.execCommand('copy');
        showAlert('Copied!');
      }
    }
  };

  // Example copy URLs
  const copyM3UUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(
      `${window.location.protocol}//${window.location.host}/output/m3u`
    );
  };
  const copyEPGUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(
      `${window.location.protocol}//${window.location.host}/output/epg`
    );
  };
  const copyHDHRUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(
      `${window.location.protocol}//${window.location.host}/output/hdhr`
    );
  };

  useEffect(() => {
    const selectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);
    setChannelsPageSelection(selectedRows);
  }, [rowSelection]);

  const filteredData = Object.values(channels).filter((row) =>
    columns.every(({ accessorKey }) =>
      filterValues[accessorKey]
        ? row[accessorKey]?.toLowerCase().includes(filterValues[accessorKey])
        : true
    )
  );

  const table = useMantineReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: filteredData,
    enablePagination: false,
    enableColumnActions: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    renderTopToolbar: false,
    icons: {
      IconSortAscending: IconArrowUp, // Upward arrow for ascending sort
      IconSortDescending: IconArrowDown, // Downward arrow for descending sort
      IconSort: IconSelector, // Default sort icon (unsorted state)
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading || channelsLoading,
      sorting,
      rowSelection,
    },
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 },
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    enableExpandAll: false,
    displayColumnDefOptions: {
      'mrt-row-select': {
        size: 20,
      },
      'mrt-row-expand': {
        size: 10,
        header: '',
        muiTableHeadCellProps: {
          sx: { width: 38, minWidth: 38, maxWidth: 38, height: '100%' },
        },
        muiTableBodyCellProps: {
          sx: { width: 38, minWidth: 38, maxWidth: 38 },
        },
      },
      'mrt-row-actions': {
        size: 74,
      },
    },
    muiExpandButtonProps: ({ row, table }) => ({
      onClick: () => {
        setRowSelection({ [row.index]: true });
        table.setExpanded({ [row.id]: !row.getIsExpanded() });
      },
      sx: {
        transform: row.getIsExpanded() ? 'rotate(180deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s',
      },
    }),
    renderDetailPanel: ({ row }) => (
      <ChannelStreams channel={row.original} isExpanded={row.getIsExpanded()} />
    ),
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Tooltip label="Edit Channel">
          <ActionIcon
            size="sm"
            variant="transparent"
            color="yellow.5"
            onClick={() => {
              editChannel(row.original);
            }}
          >
            <Pencil size="14" />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Delete Channel">
          <ActionIcon
            size="sm"
            variant="transparent"
            color="red.9"
            onClick={() => deleteChannel(row.original.id)}
          >
            <SquareMinus size="14" />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Preview Channel">
          <ActionIcon
            size="sm"
            variant="transparent"
            color="green.5"
            onClick={() => handleWatchStream(row.original.channel_number)}
          >
            <TvMinimalPlay size="14" />
          </ActionIcon>
        </Tooltip>
      </Box>
    ),
    mantineTableContainerProps: {
      style: {
        height: 'calc(100vh - 125px)',
        overflowY: 'auto',
      },
    },
    muiSearchTextFieldProps: {
      variant: 'standard',
    },
  });

  return (
    <Box>
      {/* Header Row: outside the Paper */}
      <Flex style={{ display: 'flex', alignItems: 'center', pb: 1 }} gap={15}>
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
        <Box
          style={{
            width: 43,
            height: 25,
            display: 'flex',
            alignItems: 'center',
            ml: 3,
          }}
        >
          <Text
            w={37}
            h={17}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              fontSize: '14px',
              lineHeight: 1,
              letterSpacing: '-0.3px',
              color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            }}
          >
            Links:
          </Text>
        </Box>
        <Box
          style={{
            display: 'flex',
            gap: '6px',
            ml: 0.75,
            alignItems: 'center',
          }}
        >
          <Popover withArrow shadow="md">
            <Popover.Target>
              <Button
                onClick={copyHDHRUrl}
                style={{
                  width: '71px',
                  height: '25px',
                  borderRadius: '4px',
                  border: `1px solid ${theme.palette.custom.greenMain}`,
                  backgroundColor: 'transparent',
                  color: theme.palette.custom.greenMain,
                  fontSize: '14px',
                  lineHeight: 1,
                  letterSpacing: '-0.3px',
                  textTransform: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: 0,
                  minWidth: 0,
                  '&:hover': {
                    backgroundColor: theme.palette.custom.greenHoverBg,
                  },
                }}
              >
                <Box
                  style={{
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Tv2 size={14} color={theme.palette.custom.greenMain} />
                </Box>
                HDHR
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Group>
                <TextInput value={textToCopy} size="small" sx={{ mr: 1 }} />
                <ActionIcon
                  onClick={handleCopy}
                  size="sm"
                  variant="transparent"
                >
                  <ContentCopy size="18" fontSize="small" />
                </ActionIcon>
              </Group>
            </Popover.Dropdown>
          </Popover>

          <Popover withArrow shadow="md">
            <Popover.Target>
              <Button
                onClick={copyM3UUrl}
                style={{
                  width: '64px',
                  height: '25px',
                  borderRadius: '4px',
                  border: `1px solid ${theme.palette.custom.indigoMain}`,
                  backgroundColor: 'transparent',
                  color: theme.palette.custom.indigoMain,
                  fontSize: '14px',
                  lineHeight: 1,
                  letterSpacing: '-0.3px',
                  textTransform: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: 0,
                  minWidth: 0,
                  '&:hover': {
                    backgroundColor: theme.palette.custom.indigoHoverBg,
                  },
                }}
              >
                <Box
                  style={{
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ScreenShare
                    size={14}
                    color={theme.palette.custom.indigoMain}
                  />
                </Box>
                M3U
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Group>
                <TextInput value={textToCopy} size="small" sx={{ mr: 1 }} />
                <ActionIcon
                  onClick={handleCopy}
                  size="sm"
                  variant="transparent"
                >
                  <ContentCopy size="18" fontSize="small" />
                </ActionIcon>
              </Group>
            </Popover.Dropdown>
          </Popover>

          <Popover withArrow shadow="md">
            <Popover.Target>
              <Button
                onClick={copyEPGUrl}
                style={{
                  width: '60px',
                  height: '25px',
                  borderRadius: '4px',
                  border: `1px solid ${theme.palette.custom.greyBorder}`,
                  backgroundColor: 'transparent',
                  color: theme.palette.custom.greyText,
                  fontSize: '14px',
                  lineHeight: 1,
                  letterSpacing: '-0.3px',
                  textTransform: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: 0,
                  minWidth: 0,
                  '&:hover': {
                    backgroundColor: theme.palette.custom.greyHoverBg,
                  },
                }}
              >
                <Box
                  style={{
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Scroll size={14} color={theme.palette.custom.greyText} />
                </Box>
                EPG
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Group>
                <TextInput value={textToCopy} size="small" sx={{ mr: 1 }} />
                <ActionIcon
                  onClick={handleCopy}
                  size="sm"
                  variant="transparent"
                >
                  <ContentCopy size="18" fontSize="small" />
                </ActionIcon>
              </Group>
            </Popover.Dropdown>
          </Popover>
        </Box>
      </Flex>

      {/* Paper container: contains top toolbar and table (or ghost state) */}
      <Paper
        style={{
          bgcolor: theme.palette.background.paper,
          borderRadius: 2,
          overflow: 'hidden',
          height: 'calc(100vh - 75px)',
          display: 'flex',
          flexDirection: 'column',
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
            <Tooltip label="Remove Channels">
              <Button
                leftSection={<SquareMinus size={14} />}
                variant="default"
                size="xs"
                onClick={deleteChannels}
              >
                Remove
              </Button>
            </Tooltip>

            <Tooltip label="Assign Channel #s">
              <Button
                leftSection={<IconSortAscendingNumbers size={14} />}
                variant="default"
                size="xs"
                onClick={assignChannels}
                p={5}
              >
                Assign
              </Button>
            </Tooltip>

            <Tooltip label="Auto-Match EPG">
              <Button
                leftSection={<IconDeviceDesktopSearch size={14} />}
                variant="default"
                size="xs"
                onClick={matchEpg}
                p={5}
              >
                Auto-Match
              </Button>
            </Tooltip>

            <Tooltip label="Assign">
              <Button
                leftSection={<IconSquarePlus size={14} />}
                variant="light"
                size="xs"
                onClick={matchEpg}
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

        {/* Table or ghost empty state inside Paper */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {filteredData.length === 0 ? (
            <Box
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                bgcolor: theme.palette.background.paper,
              }}
            >
              <Box
                component="img"
                src={ghostImage}
                alt="Ghost"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '120px',
                  height: 'auto',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.2,
                  pointerEvents: 'none',
                }}
              />
              <Box
                style={{
                  position: 'absolute',
                  top: '25%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  zIndex: 2,
                  width: 467,
                  px: 2,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: '20px',
                    lineHeight: '28px',
                    letterSpacing: '-0.3px',
                    color: theme.palette.text.secondary,
                    mb: 1,
                  }}
                >
                  It’s recommended to create channels after adding your M3U or
                  streams.
                </Text>
                <Text
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: '24px',
                    letterSpacing: '-0.2px',
                    color: theme.palette.text.secondary,
                    mb: 2,
                  }}
                >
                  You can still create channels without streams if you’d like,
                  and map them later.
                </Text>
                <Button
                  variant="contained"
                  onClick={() => editChannel()}
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  style={{
                    minWidth: '127px',
                    height: '25px',
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: theme.palette.text.secondary,
                    borderColor: theme.palette.custom.borderHover,
                    backgroundColor: '#1f1f23',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: '0.85rem',
                    letterSpacing: '-0.2px',
                    textTransform: 'none',
                    px: 1,
                    py: 0.5,
                    '&:hover': {
                      borderColor: theme.palette.custom.borderDefault,
                      backgroundColor: '#17171B',
                    },
                  }}
                >
                  Create channel
                </Button>
              </Box>
            </Box>
          ) : (
            <Box style={{ flex: 1, overflow: 'auto' }}>
              <MantineReactTable table={table} />
            </Box>
          )}
        </Box>
      </Paper>

      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />
    </Box>
  );
};

export default ChannelsTable;
