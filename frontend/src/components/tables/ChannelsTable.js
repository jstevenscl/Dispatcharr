// src/components/tables/ChannelsTable.js

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Popover,
  Snackbar,
  TextField,
  Autocomplete,
  InputAdornment,
  Paper,
  Grid as Grid2,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  SwapVert as SwapVertIcon,
  Tv as TvIcon,
  LiveTv as LiveTvIcon,
  Edit as EditIcon,
  Clear as ClearIcon,
  ContentCopy,
  Computer as ComputerIcon,
  Description as DescriptionIcon,
  Hd as HdIcon,
  IndeterminateCheckBox,
  CompareArrows,
  Code,
  AddBox,
} from '@mui/icons-material';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import { styled } from '@mui/material/styles';

import ChannelForm from '../forms/Channel';
import useChannelsStore from '../../store/channels';
import useSettingsStore from '../../store/settings';
import useStreamsStore from '../../store/streams';
import usePlaylistsStore from '../../store/playlists';
import useVideoStore from '../../store/useVideoStore';
import API from '../../api';
import utils from '../../utils';
import { TableHelper } from '../../helpers';

import logo from '../../images/logo.png';
import ghostImage from '../../images/ghost.svg';

/* -----------------------------------------------------------
   1) Child component: shows Streams when a channel row expands
------------------------------------------------------------ */
const ChannelStreams = ({ channel, isExpanded }) => {
  const [channelStreams, setChannelStreams] = useState([]);
  const channelStreamIds = useChannelsStore(
    (state) => state.channels[channel.id]?.stream_ids
  );
  const { playlists } = usePlaylistsStore();
  const { streams } = useStreamsStore();

  useEffect(() => {
    if (!channelStreamIds) return;
    const sorted = streams
      .filter((s) => channelStreamIds.includes(s.id))
      .sort(
        (a, b) => channelStreamIds.indexOf(a.id) - channelStreamIds.indexOf(b.id)
      );
    setChannelStreams(sorted);
  }, [streams, channelStreamIds]);

  const removeStream = async (stream) => {
    const newStreamList = channelStreams.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      streams: newStreamList.map((s) => s.id),
    });
  };

  const channelStreamsTable = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    data: channelStreams,
    columns: useMemo(
      () => [
        { header: 'Name', accessorKey: 'name' },
        {
          header: 'M3U',
          accessorFn: (row) =>
            playlists.find((pl) => pl.id === row.m3u_account)?.name,
        },
      ],
      [playlists]
    ),
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableRowActions: true,
    enableRowOrdering: true,
    enableColumnHeaders: false,
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    muiRowDragHandleProps: ({ table }) => ({
      onDragEnd: async () => {
        const { draggingRow, hoveredRow } = table.getState();
        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );
          await API.updateChannel({
            ...channel,
            streams: channelStreams.map((s) => s.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <IconButton size="small" color="error" onClick={() => removeStream(row.original)}>
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

/* -----------------------------------------------------------
   3) Main ChannelsTable component
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
  const [sorting, setSorting] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const rowVirtualizerInstanceRef = useRef(null);
  const outputUrlRef = useRef(null);

  const { showVideo } = useVideoStore();
  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
  } = useChannelsStore();
  const {
    environment: { env_mode },
  } = useSettingsStore();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setChannelGroupOptions([
      ...new Set(Object.values(channels).map((c) => c.channel_group?.name)),
    ]);
  }, [channels]);

  useEffect(() => {
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch {}
  }, [sorting]);

  useEffect(() => {
    const selectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);
    setChannelsPageSelection(selectedRows);
  }, [rowSelection]);

  const handleFilterChange = (columnId, value) => {
    setFilterValues((prev) => ({
      ...prev,
      [columnId]: value ? value.toLowerCase() : '',
    }));
  };

  const editChannel = (ch = null) => {
    setChannel(ch);
    setChannelModalOpen(true);
  };
  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  const deleteChannel = async (id) => {
    await API.deleteChannel(id);
  };

  const handleWatchStream = (channelNumber) => {
    let vidUrl = `/output/stream/${channelNumber}/`;
    if (env_mode === 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  };

  const deleteChannels = async () => {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => deleteChannel(chan.original.id))
    );
    setIsLoading(false);
  };

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

  const closeSnackbar = () => setSnackbarOpen(false);

  // Copy popover logic
  const openPopover = Boolean(anchorEl);
  const closePopover = () => {
    setAnchorEl(null);
    setSnackbarMessage('');
  };

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
    setTextToCopy(`${window.location.protocol}//${window.location.host}/discover.json`);
  };

  /* --------------------------------------
     Table configuration
  --------------------------------------- */
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
            InputProps={{
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
            onChange={(event, newValue) =>
              handleFilterChange(column.id, newValue)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Group"
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
    ],
    [channelGroupOptions, filterValues]
  );

  // Filter data
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
    enableColumnActions: false,
    enableRowSelection: true,
    enableRowVirtualization: true,
    enableExpandAll: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 },
    initialState: { density: 'compact' },
    state: {
      isLoading: isLoading || channelsLoading,
      sorting,
      rowSelection,
    },
    displayColumnDefOptions: {
      'mrt-row-select': { size: 50 },
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
    renderDetailPanel: ({ row }) => (
      <ChannelStreams channel={row.original} isExpanded={row.getIsExpanded()} />
    ),
    renderRowActions: ({ row }) => (
      <Box sx={{ justifyContent: 'right' }}>
        <Tooltip title="Edit Channel">
          <IconButton
            size="small"
            color="warning"
            onClick={() => editChannel(row.original)}
            sx={{ py: 0, px: 0.5 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Channel">
          <IconButton
            size="small"
            color="error"
            onClick={() => deleteChannel(row.original.id)}
            sx={{ py: 0, px: 0.5 }}
          >
            <DeleteIcon fontSize="small" />
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
    // No default MRT top toolbar
    renderTopToolbar: () => null,
    enableTopToolbar: false,
  });

  const hasNoData = filteredData.length === 0;

  /* ------------------------------------------------------------------
     4) Return the layout with a Paper "box" around the table
        (like your old snippet). We'll also show a "Channels" heading.
  ------------------------------------------------------------------- */
  return (
    <Grid2 container spacing={2} sx={{ height: '100%', overflow: 'hidden' }}>
      {/* We only need 1 column, so use Grid2 item xs={12} */}
      <Grid2 item xs={12} sx={{ height: '100%' }}>
        {/* Title above the Paper box */}
        {/* Row with "Channels" text, "Links:" label, and HDHR/M3U/EPG chip buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', paddingBottom: 1 }}>
          {/* "Channels" */}
          <Typography
            variant="h6"
            sx={{ color: 'text.secondary', fontWeight: 500, mb: 0 }}
          >
            Channels
          </Typography>

          {/* "Links:" */}
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', paddingLeft: 3, mb: 0 }}
          >
            Links:
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5, ml: 0.75 }}>
            {/* HDHR chip */}
            <Button
              onClick={copyHDHRUrl}
              variant="outlined"
              size="small"
              startIcon={<HdIcon sx={{ fontSize: 16, color: '#a3d977' }} />}
              sx={{
                minWidth: '64px',
                height: '25px',
                borderRadius: '4px',
                borderColor: '#a3d977',
                borderWidth: '1px',
                borderStyle: 'solid',
                backgroundColor: 'transparent',
                color: '#a3d977',
                textTransform: 'none',
                fontSize: '0.85rem',
                px: '6px',
                py: '4px',
                '&:hover': {
                  borderColor: '#c2e583',
                  color: '#c2e583',
                  backgroundColor: 'rgba(163,217,119,0.1)',
                },
              }}
            >
              HDHR
            </Button>

            {/* M3U chip */}
            <Button
              onClick={copyM3UUrl}
              variant="outlined"
              size="small"
              startIcon={<ComputerIcon sx={{ fontSize: 16, color: '#5f6dc6' }} />}
              sx={{
                minWidth: '71px',
                height: '25px',
                borderRadius: '4px',
                borderColor: '#5f6dc6',
                borderWidth: '1px',
                borderStyle: 'solid',
                backgroundColor: 'transparent',
                color: '#5f6dc6',
                textTransform: 'none',
                fontSize: '0.85rem',
                px: '6px',
                py: '4px',
                '&:hover': {
                  borderColor: '#7f8de6',
                  color: '#7f8de6',
                  backgroundColor: 'rgba(95,109,198,0.1)',
                },
              }}
            >
              M3U
            </Button>

            {/* EPG chip */}
            <Button
              onClick={copyEPGUrl}
              variant="outlined"
              size="small"
              startIcon={<DescriptionIcon sx={{ fontSize: 16, color: '#a0a0a0' }} />}
              sx={{
                minWidth: '60px',
                height: '25px',
                borderRadius: '4px',
                borderColor: '#707070',
                borderWidth: '1px',
                borderStyle: 'solid',
                backgroundColor: 'transparent',
                color: '#a0a0a0',
                textTransform: 'none',
                fontSize: '0.85rem',
                px: '6px',
                py: '4px',
                '&:hover': {
                  borderColor: '#a0a0a0',
                  color: '#c0c0c0',
                  backgroundColor: 'rgba(112,112,112,0.1)',
                },
              }}
            >
              EPG
            </Button>
          </Box>
        </Box>

        {/* The Paper box with dark background, rounding, etc. */}
        <Paper
          sx={{
            bgcolor: '#27272a', // Dark background
            borderRadius: 2, // Rounded corners
            overflow: 'hidden',
            height: 'calc(100% - 40px)', // Adjust if needed
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Toolbar row with "Remove/Assign/Auto-match/Add" */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#27272a',
              justifyContent: 'flex-end',
              p: '8px',
              gap: '8px',
            }}
          >
            {/* Right side: "Remove / Assign / Auto-match / Add" */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Remove */}
              <Tooltip title="Remove">
                <Button
                  onClick={deleteChannels}
                  variant="outlined"
                  size="small"
                  startIcon={
                    <IndeterminateCheckBox sx={{ fontSize: 16, color: '#d4d4d8' }} />
                  }
                  sx={{
                    borderColor: '#3f3f46',
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    opacity: 0.4,
                    color: '#d4d4d8',
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    px: '6px',
                    py: '4px',
                    '&:hover': {
                      borderColor: '#5f5f66',
                    },
                  }}
                >
                  Remove
                </Button>
              </Tooltip>

              {/* Assign */}
              <Tooltip title="Assign">
                <Button
                  onClick={assignChannels}
                  variant="outlined"
                  size="small"
                  startIcon={
                    <CompareArrows sx={{ fontSize: 16, color: '#d4d4d8' }} />
                  }
                  sx={{
                    borderColor: '#3f3f46',
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    opacity: 0.4,
                    color: '#d4d4d8',
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    px: '6px',
                    py: '4px',
                    '&:hover': {
                      borderColor: '#5f5f66',
                    },
                  }}
                >
                  Assign
                </Button>
              </Tooltip>

              {/* Auto-match */}
              <Tooltip title="Auto-match">
                <Button
                  onClick={matchEpg}
                  variant="outlined"
                  size="small"
                  startIcon={<Code sx={{ fontSize: 16, color: '#d4d4d8' }} />}
                  sx={{
                    minWidth: '106px',
                    borderColor: '#3f3f46',
                    borderRadius: '4px',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    height: '25px',
                    opacity: 0.4,
                    color: '#d4d4d8',
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    px: '6px',
                    py: '4px',
                    '&:hover': {
                      borderColor: '#5f5f66',
                    },
                  }}
                >
                  Auto-match
                </Button>
              </Tooltip>

              {/* Add */}
              <Tooltip title="Add Channel">
                <Button
                  onClick={() => editChannel()}
                  variant="contained"
                  size="small"
                  startIcon={<AddBox sx={{ fontSize: 16, color: '#05DF72' }} />}
                  sx={{
                    minWidth: '57px',
                    height: '25px',
                    borderRadius: '4px',
                    borderColor: '#00a63e',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    backgroundColor: '#0d542b',
                    color: '#fff',
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    px: '6px',
                    py: '4px',
                    '&:hover': {
                      backgroundColor: '#0a4020',
                    },
                  }}
                >
                  Add
                </Button>
              </Tooltip>
            </Box>
          </Box>

          {/* Table or ghost empty state */}
          <Box sx={{ flex: 1, position: 'relative' }}>
            {hasNoData ? (
              // Ghost empty state
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  bgcolor: '#27272a',
                }}
              >
                {/* Ghost in the center (behind content) */}
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

                {/* Instructions text & button in front */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: '25%', // adjust as needed to center text above/below ghost
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    zIndex: 2,
                    width: 467, // matches your screenshot's bounding box
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
                      color: 'text.secondary',
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
                      color: 'text.secondary',
                      mb: 2,
                    }}
                  >
                    You can still create channels without streams if you’d like, and map them later.
                  </Typography>

                  <Button
                    variant="contained"
                    onClick={() => editChannel()}
                    sx={{
                      borderColor: '#3f3f46',
                      borderRadius: '4px',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      height: '25px',
                      px: '6px',
                      py: '4px',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '0.85rem',
                      letterSpacing: '-0.2px',
                      color: '#d4d4d8',
                      textTransform: 'none',
                      opacity: 0.4,
                      '&:hover': {
                        borderColor: '#5f5f66',
                      },
                    }}
                  >
                    Create channel
                  </Button>
                </Box>
              </Box>
            ) : (
              // Render the MRT table if data is present
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <MaterialReactTable table={table} />
              </Box>
            )}
          </Box>
        </Paper>
      </Grid2>

      {/* Channel Form Modal */}
      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />

      {/* Popover for copy URLs */}
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
            sx={{ marginRight: 1 }}
            inputRef={outputUrlRef}
          />
          <IconButton onClick={handleCopy} color="primary">
            <ContentCopy />
          </IconButton>
        </Box>
      </Popover>

      {/* Snackbar for feedback */}
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        message={snackbarMessage}
      />
    </Grid2>
  );
};

export default ChannelsTable;
