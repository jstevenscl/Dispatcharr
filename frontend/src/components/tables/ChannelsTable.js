// frontend/src/components/tables/ChannelsTable.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import {
  Box,
  Stack,
  Typography,
  Tooltip,
  IconButton,
  ButtonGroup,
  Button,
  Snackbar,
  Popover,
  TextField,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  SwapVert as SwapVertIcon,
  LiveTv as LiveTvIcon,
  Tv as TvIcon,
  ContentCopy,
} from '@mui/icons-material';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import { TableHelper } from '../../helpers';
import utils from '../../utils';
import logo from '../../images/logo.png';
import useChannelsStore from '../../store/channels';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';

const ChannelsTable = () => {
  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);

  const [anchorEl, setAnchorEl] = useState(null);
  const [textToCopy, setTextToCopy] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const { channels, isLoading: channelsLoading } = useChannelsStore();
  const {
    environment: { env_mode },
  } = useSettingsStore();
  const { showVideo } = useVideoStore.getState();

  const rowVirtualizerInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  // Columns
  const columns = useMemo(() => {
    return [
      {
        header: '#',
        size: 50,
        accessorKey: 'channel_number',
      },
      {
        header: 'Name',
        accessorKey: 'channel_name',
      },
      {
        header: 'Group',
        accessorFn: (row) => row.channel_group?.name || '',
      },
      {
        header: 'Logo',
        accessorKey: 'logo_url',
        size: 60,
        Cell: ({ cell }) => (
          <Box sx={{ textAlign: 'center' }}>
            <img
              src={cell.getValue() || logo}
              alt="channel logo"
              style={{ width: 24, height: 'auto' }}
            />
          </Box>
        ),
      },
    ];
  }, []);

  // Common table logic
  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: channels,
    enablePagination: false,
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
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <Stack direction="row" spacing={1}>
        {/* Edit channel */}
        <IconButton
          size="small"
          color="warning"
          onClick={() => editChannel(row.original)}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        {/* Delete channel */}
        <IconButton
          size="small"
          color="error"
          onClick={() => deleteChannel(row.original.id)}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
        {/* Watch now */}
        <IconButton
          size="small"
          color="info"
          onClick={() => handleWatchStream(row.original.channel_number)}
        >
          <LiveTvIcon fontSize="small" />
        </IconButton>
      </Stack>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(100% - 40px)', // fill parent minus a bit for your top row
        overflowY: 'auto',
      },
    },
    renderTopToolbarCustomActions: () => (
      <Stack direction="row" spacing={1} alignItems="center">
        {/* “HDHR URL”, “M3U URL”, “EPG” ButtonGroup like your screenshot */}
        <ButtonGroup variant="outlined" size="small">
          <Button onClick={copyHDHRUrl}>HDHR URL</Button>
          <Button onClick={copyM3UUrl}>M3U URL</Button>
          <Button onClick={copyEPGUrl}>EPG</Button>
        </ButtonGroup>

        {/* Additional actions: auto-assign, auto-match, add, remove, etc. */}
        <Tooltip title="Assign Channels">
          <IconButton color="warning" size="small" onClick={assignChannels}>
            <SwapVertIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Auto-match EPG">
          <IconButton color="success" size="small" onClick={matchEpg}>
            <TvIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Add Channel">
          <IconButton color="success" size="small" onClick={() => editChannel()}>
            <AddIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Delete Channels">
          <IconButton color="error" size="small" onClick={deleteChannels}>
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </Stack>
    ),
  });

  // Lifecycle
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  // Channel actions
  function editChannel(channel = null) {
    setChannel(channel);
    setChannelModalOpen(true);
  }

  async function deleteChannel(id) {
    setIsLoading(true);
    await API.deleteChannel(id);
    setIsLoading(false);
  }

  function handleWatchStream(channelNumber) {
    let vidUrl = `/output/stream/${channelNumber}/`;
    if (env_mode === 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  }

  async function deleteChannels() {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((chan) => () => deleteChannel(chan.original.id))
    );
    setIsLoading(false);
  }

  async function assignChannels() {
    try {
      const rowOrder = table.getRowModel().rows.map((row) => row.original.id);
      setIsLoading(true);
      const result = await API.assignChannelNumbers(rowOrder);
      setIsLoading(false);
      setSnackbarMessage(result.message || 'Channels assigned');
      setSnackbarOpen(true);
      await useChannelsStore.getState().fetchChannels();
    } catch (err) {
      console.error(err);
      setSnackbarMessage('Failed to assign channels');
      setSnackbarOpen(true);
    }
  }

  async function matchEpg() {
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
  }

  // Copy popover
  const openPopover = Boolean(anchorEl);
  function closePopover() {
    setAnchorEl(null);
  }
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setSnackbarMessage('Copied!');
    } catch (err) {
      setSnackbarMessage('Failed to copy');
    }
    setSnackbarOpen(true);
  }
  function copyHDHRUrl(event) {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/hdhr`);
  }
  function copyM3UUrl(event) {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/m3u`);
  }
  function copyEPGUrl(event) {
    setAnchorEl(event.currentTarget);
    setTextToCopy(`${window.location.protocol}//${window.location.host}/output/epg`);
  }

  // Channel form close
  function closeChannelForm() {
    setChannel(null);
    setChannelModalOpen(false);
  }

  // Snackbar
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <Box sx={{ height: '100%' }}>
      <MaterialReactTable table={table} />

      {/* Channel Form Modal */}
      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />

      {/* Popover for "copy" URLs */}
      <Popover
        open={openPopover}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
          <TextField
            value={textToCopy}
            variant="standard"
            disabled
            size="small"
            sx={{ mr: 1 }}
          />
          <IconButton onClick={handleCopy} color="primary">
            <ContentCopy />
          </IconButton>
        </Box>
      </Popover>

      {/* Snackbar messages */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default ChannelsTable;
