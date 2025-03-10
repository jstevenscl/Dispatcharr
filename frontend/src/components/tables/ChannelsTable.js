import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MaterialReactTable,
  useMaterialReactTable,
  MRT_ShowHideColumnsButton
} from 'material-react-table';
import {
  Box,
  Grid2,
  Typography,
  Tooltip,
  IconButton,
  Button,
  Snackbar,
  Popover,
  TextField,
  Autocomplete,
  InputAdornment,
  Paper,
} from '@mui/material';
import useChannelsStore from '../../store/channels';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  ContentCopy,
  Clear as ClearIcon,
  IndeterminateCheckBox,
  CompareArrows,
  Code,
  AddBox,
  LiveTv as LiveTvIcon,
} from '@mui/icons-material';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import { TableHelper } from '../../helpers';
import utils from '../../utils';
import logo from '../../images/logo.png';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';
import usePlaylistsStore from '../../store/playlists';
import { Tv2, ScreenShare, Scroll, SquareMinus, Pencil } from 'lucide-react';
import { styled, useTheme } from '@mui/material/styles';
import ghostImage from '../../images/ghost.svg';

/* -----------------------------------------------------------
   Child table for streams
------------------------------------------------------------ */
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

  const channelStreamsTable = useMaterialReactTable({
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
    enableSorting: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enablePagination: false,
    enableRowVirtualization: true,
    enableColumnHeaders: false,
    initialState: { density: 'compact' },
    columnFilterDisplayMode: 'popover',
    enableRowActions: true,
    enableRowOrdering: true,
    muiRowDragHandleProps: ({ table }) => ({
      onDragEnd: async () => {
        const { draggingRow, hoveredRow } = table.getState();
        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );
          const { streams: oldStreams, ...channelUpdate } = channel;
          await API.updateChannel({
            ...channelUpdate,
            stream_ids: channelStreams.map((s) => s.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <IconButton
        size="small"
        color="error"
        onClick={() => removeStream(row.original)}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    ),
  });

  if (!isExpanded) return null;

  return (
    <Box sx={{ backgroundColor: 'primary.main', pt: 1, pb: 1, width: '100%' }}>
      <MaterialReactTable table={channelStreamsTable} />
    </Box>
  );
};

/* -----------------------------------------------------------
   Custom-styled buttons (HDHR, M3U, EPG)
------------------------------------------------------------ */
const HDHRButton = styled(Button)(() => ({
  border: '1px solid #a3d977',
  color: '#a3d977',
  backgroundColor: 'transparent',
  textTransform: 'none',
  fontSize: '0.85rem',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  minWidth: 'auto',
  '&:hover': {
    borderColor: '#c2e583',
    color: '#c2e583',
    backgroundColor: 'rgba(163,217,119,0.1)',
  },
}));

const M3UButton = styled(Button)(() => ({
  border: '1px solid #5f6dc6',
  color: '#5f6dc6',
  backgroundColor: 'transparent',
  textTransform: 'none',
  fontSize: '0.85rem',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  minWidth: 'auto',
  '&:hover': {
    borderColor: '#7f8de6',
    color: '#7f8de6',
    backgroundColor: 'rgba(95,109,198,0.1)',
  },
}));

const EPGButton = styled(Button)(() => ({
  border: '1px solid #707070',
  color: '#a0a0a0',
  backgroundColor: 'transparent',
  textTransform: 'none',
  fontSize: '0.85rem',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  minWidth: 'auto',
  '&:hover': {
    borderColor: '#a0a0a0',
    color: '#c0c0c0',
    backgroundColor: 'rgba(112,112,112,0.1)',
  },
}));

/* -----------------------------------------------------------
   Main ChannelsTable component
------------------------------------------------------------ */
const ChannelsTable = () => {
  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [channelGroupOptions, setChannelGroupOptions] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [textToCopy, setTextToCopy] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [filterValues, setFilterValues] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const theme = useTheme();
  const outputUrlRef = useRef(null);

  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
  } = useChannelsStore();
  const { showVideo } = useVideoStore();
  const {
    environment: { env_mode },
  } = useSettingsStore();

  // Gather unique group names
  useEffect(() => {
    setChannelGroupOptions([
      ...new Set(Object.values(channels).map((ch) => ch.channel_group?.name)),
    ]);
  }, [channels]);

  // Handle filters
  const handleFilterChange = (columnId, value) => {
    setFilterValues((prev) => ({
      ...prev,
      [columnId]: value ? value.toLowerCase() : '',
    }));
  };

  // Close the top-right snackbar
  const closeSnackbar = () => setSnackbarOpen(false);

  // Open the Channel form
  const editChannel = (ch = null) => {
    setChannel(ch);
    setChannelModalOpen(true);
  };

  // Close the Channel form
  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  // Single channel delete
  const deleteChannel = async (id) => {
    await API.deleteChannel(id);
  };

  // Bulk delete channels
  const deleteChannels = async () => {
    setIsLoading(true);
    const selected = table.getRowModel().rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => deleteChannel(chan.original.id))
    );
    setIsLoading(false);
  };

  // Watch stream
  const handleWatchStream = (channelNumber) => {
    let vidUrl = `/output/stream/${channelNumber}/`;
    if (env_mode === 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  };

  // Assign Channels
  const assignChannels = async () => {
    try {
      const rowOrder = table.getRowModel().rows.map((row) => row.original.id);
      setIsLoading(true);
      const result = await API.assignChannelNumbers(rowOrder);
      setIsLoading(false);
      setSnackbarMessage(result.message || 'Channels assigned');
      setSnackbarOpen(true);
      await fetchChannels();
    } catch (err) {
      console.error(err);
      setSnackbarMessage('Failed to assign channels');
      setSnackbarOpen(true);
    }
  };

  // Match EPG
  const matchEpg = async () => {
    try {
      const resp = await fetch('/api/channels/channels/match-epg/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await API.getAuthToken()}`,
        },
      });
      if (resp.ok) {
        setSnackbarMessage('EPG matching task started!');
      } else {
        const text = await resp.text();
        setSnackbarMessage(`Failed to start EPG matching: ${text}`);
      }
    } catch (err) {
      setSnackbarMessage(`Error: ${err.message}`);
    }
    setSnackbarOpen(true);
  };

  // Copy popover logic
  const closePopover = () => {
    setAnchorEl(null);
    setSnackbarMessage('');
  };
  const openPopover = Boolean(anchorEl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setSnackbarMessage('Copied!');
    } catch (err) {
      const inputElement = outputUrlRef.current?.querySelector('input');
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
        document.execCommand('copy');
        setSnackbarMessage('Copied!');
      }
    }
    setSnackbarOpen(true);
  };

  // Copy HDHR/M3U/EPG URL
  const copyM3UUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/m3u`);
  };
  const copyEPGUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/epg`);
  };
  const copyHDHRUrl = (event) => {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/hdhr`);
  };

  // When component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  // Scroll to top on sorting
  const rowVirtualizerInstanceRef = useRef(null);
  useEffect(() => {
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  // Build the columns
  const columns = useMemo(() => [
    {
      header: '#',
      size: 50,
      accessorKey: 'channel_number',
    },
    {
      header: 'Name',
      accessorKey: 'channel_name',
      muiTableHeadCellProps: { sx: { textAlign: 'center' } },
      Header: ({ column }) => (
        <TextField
          variant="standard"
          label="Name"
          value={filterValues[column.id] || ''}
          onChange={(e) => handleFilterChange(column.id, e.target.value)}
          size="small"
          margin="none"
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => handleFilterChange(column.id, '')}
                    edge="end"
                    size="small"
                  >
                    <ClearIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      ),
    },
    {
      header: 'Group',
      accessorFn: (row) => row.channel_group?.name || '',
      Header: ({ column }) => (
        <Autocomplete
          disablePortal
          options={channelGroupOptions}
          size="small"
          sx={{ width: 300 }}
          clearOnEscape
          onChange={(event, newValue) => {
            event.stopPropagation();
            handleFilterChange(column.id, newValue);
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Group"
              size="small"
              variant="standard"
              onClick={(e) => e.stopPropagation()}
              sx={{ pb: 0.8 }}
            />
          )}
        />
      ),
    },
    {
      header: 'Logo',
      accessorKey: 'logo_url',
      enableSorting: false,
      size: 55,
      Cell: ({ cell }) => (
        <Grid2 container direction="row" sx={{ justifyContent: 'center', alignItems: 'center' }}>
          <img src={cell.getValue() || logo} width="20" alt="channel logo" />
        </Grid2>
      ),
    },
  ], [channelGroupOptions, filterValues]);

  // Filter the data
  const filteredData = Object.values(channels).filter((row) =>
    columns.every(({ accessorKey }) =>
      filterValues[accessorKey]
        ? row[accessorKey]?.toLowerCase().includes(filterValues[accessorKey])
        : true
    )
  );

  // Build the MRT instance
  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: filteredData,
    enablePagination: false,
    enableColumnActions: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    enableRowActions: true,
    enableExpandAll: false,
    // Fully disable MRT's built-in top toolbar
    enableTopToolbar: false,
    renderTopToolbar: () => null,
    renderToolbarInternalActions: () => null,

    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading || channelsLoading,
      sorting,
      rowSelection,
    },

    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 },
    initialState: { density: 'compact' },

    displayColumnDefOptions: {
      'mrt-row-select': { size: 50 },
      'mrt-row-expand': {
        size: 10,
        header: '',
        muiTableHeadCellProps: { sx: { width: 38, minWidth: 38, maxWidth: 38 } },
        muiTableBodyCellProps: { sx: { width: 38, minWidth: 38, maxWidth: 38 } },
      },
      'mrt-row-actions': { size: 68 },
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

    // Expand child table
    renderDetailPanel: ({ row }) => (
      <ChannelStreams channel={row.original} isExpanded={row.getIsExpanded()} />
    ),

    // Row actions
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Tooltip title="Edit Channel">
          <IconButton
            size="small"
            color="warning"
            onClick={() => editChannel(row.original)}
            sx={{ py: 0, px: 0.5 }}
          >
            <Pencil size="18" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Channel">
          <IconButton
            size="small"
            color="error"
            onClick={() => deleteChannel(row.original.id)}
            sx={{ py: 0, px: 0.5 }}
          >
            <SquareMinus size="18" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Preview Channel">
          <IconButton
            size="small"
            color="info"
            onClick={() => handleWatchStream(row.original.channel_number)}
            sx={{ py: 0, px: 0.5 }}
          >
            <LiveTvIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    ),

    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 75px)',
        overflowY: 'auto',
      },
    },
  });

  // Sync the selection with your store
  useEffect(() => {
    const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
    setChannelsPageSelection(selectedRows);
  }, [rowSelection, table, setChannelsPageSelection]);

  return (
    <Box>
      {/* Header row, outside the Paper */}
      <Box sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography
          sx={{
            width: 88,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: theme.palette.text.secondary,
            mb: 0,
          }}
        >
          Channels
        </Typography>

        {/* "Links" label and HDHR/M3U/EPG buttons */}
        <Box sx={{ width: 43, height: 25, display: 'flex', alignItems: 'center', ml: 3 }}>
          <Typography
            sx={{
              width: 37,
              height: 17,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              fontSize: '14px',
              lineHeight: 1,
              letterSpacing: '-0.3px',
              color: theme.palette.text.secondary,
            }}
          >
            Links:
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '6px', ml: 0.75 }}>
          <Button
            onClick={copyHDHRUrl}
            sx={{
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
              '&:hover': { backgroundColor: theme.palette.custom.greenHoverBg },
            }}
          >
            <Box sx={{ width: 14, height: 14, display: 'flex', alignItems: 'center' }}>
              <Tv2 size={14} color={theme.palette.custom.greenMain} />
            </Box>
            HDHR
          </Button>
          <Button
            onClick={copyM3UUrl}
            sx={{
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
              '&:hover': { backgroundColor: theme.palette.custom.indigoHoverBg },
            }}
          >
            <Box sx={{ width: 14, height: 14, display: 'flex', alignItems: 'center' }}>
              <ScreenShare size={14} color={theme.palette.custom.indigoMain} />
            </Box>
            M3U
          </Button>
          <Button
            onClick={copyEPGUrl}
            sx={{
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
              '&:hover': { backgroundColor: theme.palette.custom.greyHoverBg },
            }}
          >
            <Box sx={{ width: 14, height: 14, display: 'flex', alignItems: 'center' }}>
              <Scroll size={14} color={theme.palette.custom.greyText} />
            </Box>
            EPG
          </Button>
        </Box>
      </Box>

      {/* Paper with your custom top bar + table */}
      <Paper
        sx={{
          bgcolor: theme.palette.background.paper,
          borderRadius: 2,
          overflow: 'hidden',
          height: 'calc(100vh - 75px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Our own top toolbar to mimic StreamsTable's style */}
        {/*
          define selectedCount in JS, NOT inline:
        */}
        {(() => {
          const selectedCount = table.getSelectedRowModel().rows.length;
          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: theme.palette.background.paper,
                justifyContent: 'flex-end',
                p: 1,
                gap: 1,
              }}
            >
              <Tooltip title="Remove">
                <Button
                  onClick={deleteChannels}
                  variant="outlined"
                  size="small"
                  disabled={selectedCount === 0}
                  startIcon={<IndeterminateCheckBox sx={{ fontSize: 16, color: theme.palette.text.secondary }} />}
                  sx={{
                    borderColor: theme.palette.custom.borderDefault,
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    opacity: selectedCount ? 1 : 0.4,
                    color: theme.palette.text.secondary,
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    '&:hover': { borderColor: theme.palette.custom.borderHover },
                  }}
                >
                  Remove
                </Button>
              </Tooltip>
              <Tooltip title="Assign">
                <Button
                  onClick={assignChannels}
                  variant="outlined"
                  size="small"
                  disabled={selectedCount === 0}
                  startIcon={<CompareArrows sx={{ fontSize: 16, color: theme.palette.text.secondary }} />}
                  sx={{
                    borderColor: theme.palette.custom.borderDefault,
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    opacity: selectedCount ? 1 : 0.4,
                    color: theme.palette.text.secondary,
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    '&:hover': { borderColor: theme.palette.custom.borderHover },
                  }}
                >
                  Assign
                </Button>
              </Tooltip>
              <Tooltip title="Auto-match">
                <Button
                  onClick={matchEpg}
                  variant="outlined"
                  size="small"
                  startIcon={<Code sx={{ fontSize: 16, color: theme.palette.text.secondary }} />}
                  sx={{
                    minWidth: '106px',
                    borderColor: theme.palette.custom.borderDefault,
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    color: theme.palette.text.secondary,
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    '&:hover': { borderColor: theme.palette.custom.borderHover },
                  }}
                >
                  Auto-match
                </Button>
              </Tooltip>
              <Tooltip title="Add Channel">
                <Button
                  onClick={() => editChannel()}
                  variant="contained"
                  size="small"
                  startIcon={<AddBox sx={{ fontSize: 16, color: theme.palette.custom.successIcon }} />}
                  sx={{
                    minWidth: '57px',
                    height: '25px',
                    borderRadius: '4px',
                    borderColor: theme.palette.custom.successBorder,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    backgroundColor: theme.palette.custom.successBg,
                    color: '#fff',
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    '&:hover': { backgroundColor: theme.palette.custom.successBgHover },
                  }}
                >
                  Add
                </Button>
              </Tooltip>
              <Tooltip title="Show/Hide Columns">
                <MRT_ShowHideColumnsButton table={table} />
              </Tooltip>
            </Box>
          );
        })()}

        {/* Table or ghost empty state */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {filteredData.length === 0 ? (
            <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: theme.palette.background.paper }}>
              <Box
                component="img"
                src={ghostImage}
                alt="Ghost"
                sx={{
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
                sx={{
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
                <Typography
                  sx={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: '20px',
                    lineHeight: '28px',
                    letterSpacing: '-0.3px',
                    color: theme.palette.text.secondary,
                    mb: 1,
                  }}
                >
                  It’s recommended to create channels after adding your M3U or streams.
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: '24px',
                    letterSpacing: '-0.2px',
                    color: theme.palette.text.secondary,
                    mb: 2,
                  }}
                >
                  You can still create channels without streams if you’d like, and map them later.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => editChannel()}
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  sx={{
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
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <MaterialReactTable table={table} />
            </Box>
          )}
        </Box>
      </Paper>

      {/* Channel Form */}
      <ChannelForm channel={channel} isOpen={channelModalOpen} onClose={closeChannelForm} />

      {/* Copy popover */}
      <Popover
        open={openPopover}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
          <TextField
            id="output-url"
            value={textToCopy}
            variant="standard"
            size="small"
            sx={{ mr: 1 }}
            inputRef={outputUrlRef}
          />
          <IconButton onClick={handleCopy} color="primary">
            <ContentCopy />
          </IconButton>
        </Box>
      </Popover>

      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default ChannelsTable;
