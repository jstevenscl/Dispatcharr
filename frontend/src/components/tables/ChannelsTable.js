import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MaterialReactTable,
  useMaterialReactTable,
} from 'material-react-table';
import {
  Box,
  Grid2,
  Stack,
  Typography,
  Tooltip,
  IconButton,
  Button,
  ButtonGroup,
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
  SwapVert as SwapVertIcon,
  LiveTv as LiveTvIcon,
  ContentCopy,
  Tv as TvIcon,
  Clear as ClearIcon,
  IndeterminateCheckBox,
  CompareArrows,
  Code,
  AddBox,
  Hd as HdIcon,
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

          API.updateChannel({
            ...channelUpdate,
            stream_ids: channelStreams.map((stream) => stream.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small"
          color="error"
          onClick={() => removeStream(row.original)}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </>
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
      <MaterialReactTable table={channelStreamsTable} />
    </Box>
  );
};

/* -----------------------------------------------------------
   2) Custom-styled "chip" buttons for HDHR, M3U, EPG
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

const ChannelsTable = ({}) => {
  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [channelGroupOptions, setChannelGroupOptions] = useState([]);

  const [anchorEl, setAnchorEl] = useState(null);
  const [textToCopy, setTextToCopy] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [filterValues, setFilterValues] = useState({});

  const theme = useTheme();

  const { showVideo } = useVideoStore();
  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
  } = useChannelsStore();

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
          <TextField
            variant="standard"
            label="Name"
            value={filterValues[column.id]}
            onChange={(e) => handleFilterChange(column.id, e.target.value)}
            size="small"
            margin="none"
            fullWidth
            sx={
              {
                // '& .MuiInputBase-root': { fontSize: '0.875rem' },
                // '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                // width: '200px', // Optional: Adjust width
              }
            }
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
        meta: {
          filterVariant: null,
        },
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
                sx={{
                  pb: 0.8,
                  //   '& .MuiInputBase-root': { fontSize: '0.875rem' },
                  //   '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                  //   width: '200px', // Optional: Adjust width
                }}
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
          <Grid2
            container
            direction="row"
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img src={cell.getValue() || logo} width="20" alt="channel logo" />
          </Grid2>
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

  const closeSnackbar = () => setSnackbarOpen(false);

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
      setSnackbarMessage(result.message || 'Channels assigned');
      setSnackbarOpen(true);

      // Refresh the channel list
      await fetchChannels();
    } catch (err) {
      console.error(err);
      setSnackbarMessage('Failed to assign channels');
      setSnackbarOpen(true);
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
      const inputElement = outputUrlRef.current.querySelector('input'); // Get the actual input

      if (inputElement) {
        inputElement.focus();
        inputElement.select();

        // For older browsers
        document.execCommand('copy');
        setSnackbarMessage('Copied!');
      }
    }
    setSnackbarOpen(true);
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

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: filteredData,
    enablePagination: false,
    enableColumnActions: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
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
        size: 50,
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
        size: 68,
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
        <Tooltip title="Edit Channel">
          <IconButton
            size="small"
            color="warning"
            onClick={() => {
              editChannel(row.original);
            }}
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
    muiSearchTextFieldProps: {
      variant: 'standard',
    },
    renderTopToolbarCustomActions: ({ table }) => {
      const selectedRowCount = table.getSelectedRowModel().rows.length;

      return (
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography>Channels</Typography>
          <Tooltip title="Add New Channel">
            <IconButton
              size="small"
              color="success"
              variant="contained"
              onClick={() => editChannel()}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Channels">
            <IconButton
              size="small"
              color="error"
              variant="contained"
              onClick={deleteChannels}
              disabled={selectedRowCount == 0}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Assign Channels">
            <IconButton
              size="small"
              color="warning"
              variant="contained"
              onClick={assignChannels}
              disabled={selectedRowCount == 0}
            >
              <SwapVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Our brand-new button for EPG matching */}
          <Tooltip title="Auto-match EPG with fuzzy logic">
            <IconButton
              size="small"
              color="success"
              variant="contained"
              onClick={matchEpg}
            >
              <TvIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <ButtonGroup sx={{ marginLeft: 1 }}>
            <Button variant="contained" size="small" onClick={copyHDHRUrl}>
              HDHR URL
            </Button>
            <Button variant="contained" size="small" onClick={copyM3UUrl}>
              M3U URL
            </Button>
            <Button variant="contained" size="small" onClick={copyEPGUrl}>
              EPG
            </Button>
          </ButtonGroup>
        </Stack>
      );
    },
  });

  return (
    <Box>
      {/* Header Row: outside the Paper */}
      <Box sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography
          sx={{
            width: 88,
            height: 24,
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
        <Box
          sx={{
            width: 43,
            height: 25,
            display: 'flex',
            alignItems: 'center',
            ml: 3,
          }}
        >
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
          {/* HDHR Button */}
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
              '&:hover': {
                backgroundColor: theme.palette.custom.greenHoverBg,
              },
            }}
          >
            <Box
              sx={{
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

          {/* M3U Button */}
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
              '&:hover': {
                backgroundColor: theme.palette.custom.indigoHoverBg,
              },
            }}
          >
            <Box
              sx={{
                width: 14,
                height: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ScreenShare size={14} color={theme.palette.custom.indigoMain} />
            </Box>
            M3U
          </Button>

          {/* EPG Button */}
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
              '&:hover': {
                backgroundColor: theme.palette.custom.greyHoverBg,
              },
            }}
          >
            <Box
              sx={{
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
        </Box>
      </Box>

      {/* Paper container: contains top toolbar and table (or ghost state) */}
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
        {/* Top toolbar with Remove, Assign, Auto-match, and Add buttons */}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Remove">
              <Button
                onClick={deleteChannels}
                variant="outlined"
                size="small"
                startIcon={
                  <IndeterminateCheckBox
                    sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                  />
                }
                sx={{
                  borderColor: theme.palette.custom.borderDefault,
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  height: '25px',
                  opacity: 0.4,
                  color: theme.palette.text.secondary,
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderHover,
                  },
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
                startIcon={
                  <CompareArrows
                    sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                  />
                }
                sx={{
                  borderColor: theme.palette.custom.borderDefault,
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  height: '25px',
                  opacity: 0.4,
                  color: theme.palette.text.secondary,
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderHover,
                  },
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
                startIcon={
                  <Code
                    sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                  />
                }
                sx={{
                  minWidth: '106px',
                  borderColor: theme.palette.custom.borderDefault,
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  height: '25px',
                  opacity: 0.4,
                  color: theme.palette.text.secondary,
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderHover,
                  },
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
                startIcon={
                  <AddBox
                    sx={{
                      fontSize: 16,
                      color: theme.palette.custom.successIcon,
                    }}
                  />
                }
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
                  '&:hover': {
                    backgroundColor: theme.palette.custom.successBgHover,
                  },
                }}
              >
                Add
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {/* Table or ghost empty state inside Paper */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {filteredData.length === 0 ? (
            <Box
              sx={{
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
                  It’s recommended to create channels after adding your M3U or
                  streams.
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
                  You can still create channels without streams if you’d like,
                  and map them later.
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

      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />

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
