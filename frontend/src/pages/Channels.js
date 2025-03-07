import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Stack,
  Button,
  Chip,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

// MUI icons used to replicate the Figma design
import AddBox from '@mui/icons-material/AddBox';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank';
import Code from '@mui/icons-material/Code';
import CompareArrows from '@mui/icons-material/CompareArrows';
import IndeterminateCheckBox from '@mui/icons-material/IndeterminateCheckBox';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import PlayArrow from '@mui/icons-material/PlayArrow';
import PlayCircle from '@mui/icons-material/PlayCircle';
import Sort from '@mui/icons-material/Sort';
import Edit from '@mui/icons-material/Edit';

// Zustand stores & API
import useChannelsStore from '../store/channels';
import useStreamsStore from '../store/streams';
import useVideoStore from '../store/useVideoStore';
import useAlertStore from '../store/alerts';
import API from '../api';

// If you have ChannelForm / StreamForm modals, import them:
import ChannelForm from '../components/forms/Channel';
import StreamForm from '../components/forms/Stream';

const ChannelsPage = () => {
  //
  // -----------------------------
  // 1) HOOKS & GLOBAL STORE DATA
  // -----------------------------
  //
  const { channels, fetchChannels } = useChannelsStore();
  const { streams, fetchStreams } = useStreamsStore();
  const { showVideo } = useVideoStore.getState();
  const { showAlert } = useAlertStore();

  // We fetch channels/streams if needed
  useEffect(() => {
    // If not loaded yet, fetch them:
    fetchChannels().catch((err) => console.error('Failed to fetch channels', err));
    fetchStreams().catch((err) => console.error('Failed to fetch streams', err));
    // eslint-disable-next-line
  }, []);

  //
  // -----------------------------
  // 2) LOCAL STATE FOR SELECTION
  // -----------------------------
  //
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  const [selectedStreamIds, setSelectedStreamIds] = useState([]);

  // For opening the Channel/Stream forms
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);

  const [streamFormOpen, setStreamFormOpen] = useState(false);
  const [editingStream, setEditingStream] = useState(null);

  //
  // -----------------------------
  // 3) CHANNEL ACTIONS
  // -----------------------------
  //
  function handleToggleChannel(channelId) {
    setSelectedChannelIds((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  }

  function handleSelectAllChannels() {
    if (selectedChannelIds.length === channels.length) {
      setSelectedChannelIds([]);
    } else {
      setSelectedChannelIds(channels.map((c) => c.id));
    }
  }

  async function handleRemoveChannels() {
    if (selectedChannelIds.length === 0) return;
    // This calls your existing bulk delete method
    try {
      await API.deleteChannels(selectedChannelIds);
      setSelectedChannelIds([]);
      showAlert(`Deleted ${selectedChannelIds.length} channels`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to remove channels', 'error');
    }
  }

  async function handleAssignChannels() {
    // The example calls a reorder method. If you have a different approach, adapt here
    const channelIdsInCurrentOrder = channels.map((ch) => ch.id);
    try {
      await API.assignChannelNumbers(channelIdsInCurrentOrder);
      showAlert('Channels assigned successfully!', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to assign channels', 'error');
    }
  }

  async function handleAutoMatch() {
    // Example "match-epg" call from your code:
    try {
      const resp = await fetch('/api/channels/channels/match-epg/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await API.getAuthToken()}`,
        },
      });
      if (resp.ok) {
        showAlert('EPG matching task started!', 'success');
      } else {
        const text = await resp.text();
        showAlert(`Failed to start EPG matching: ${text}`, 'error');
      }
    } catch (err) {
      showAlert(`Error: ${err.message}`, 'error');
    }
  }

  function handleAddChannel() {
    setEditingChannel(null);
    setChannelFormOpen(true);
  }

  function handleEditChannel(channel) {
    setEditingChannel(channel);
    setChannelFormOpen(true);
  }

  async function handleDeleteChannel(channelId) {
    try {
      await API.deleteChannel(channelId);
      showAlert('Channel deleted', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete channel', 'error');
    }
  }

  function handlePlayChannel(channel) {
    // For your environment logic, adapt as needed
    const vidUrl = `/output/stream/${channel.channel_number}`;
    showVideo(vidUrl);
  }

  //
  // -----------------------------
  // 4) STREAM ACTIONS
  // -----------------------------
  //
  function handleToggleStream(streamId) {
    setSelectedStreamIds((prev) => {
      if (prev.includes(streamId)) {
        return prev.filter((id) => id !== streamId);
      } else {
        return [...prev, streamId];
      }
    });
  }

  function handleSelectAllStreams() {
    if (selectedStreamIds.length === streams.length) {
      setSelectedStreamIds([]);
    } else {
      setSelectedStreamIds(streams.map((s) => s.id));
    }
  }

  async function handleRemoveStreams() {
    if (selectedStreamIds.length === 0) return;
    try {
      await API.deleteStreams(selectedStreamIds);
      setSelectedStreamIds([]);
      showAlert(`Deleted ${selectedStreamIds.length} streams`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to remove streams', 'error');
    }
  }

  // Bulk "create channels" from selected streams
  async function handleCreateChannelsFromStreams() {
    if (selectedStreamIds.length === 0) return;
    // If your API is `createChannelsFromStreams()`, adapt below
    const payload = selectedStreamIds.map((streamId) => {
      const st = streams.find((s) => s.id === streamId);
      return {
        stream_id: st.id,
        channel_name: st.name,
      };
    });
    try {
      await API.createChannelsFromStreams(payload);
      showAlert(`Created channels from ${selectedStreamIds.length} streams`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to create channels', 'error');
    }
  }

  function handleAddStream() {
    setEditingStream(null);
    setStreamFormOpen(true);
  }

  function handleEditStream(stream) {
    setEditingStream(stream);
    setStreamFormOpen(true);
  }

  async function handleDeleteStream(streamId) {
    try {
      await API.deleteStream(streamId);
      showAlert('Stream deleted', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete stream', 'error');
    }
  }

  function handlePlayStream(stream) {
    // If your environment logic differs, adapt as needed
    const vidUrl = `/output/stream/${stream.id}`;
    showVideo(vidUrl);
  }

  //
  // -----------------------------
  // 5) RENDER
  // -----------------------------
  //
  return (
    <Box
      sx={{
        display: 'flex',
        bgcolor: 'background.paper',
        backgroundColor: '#18181b', // Dark background from example
      }}
    >
      {/* We do NOT replicate the example's built-in sidebar here
          because your App.js + <Sidebar /> is already handling that.
          So we skip the sidebar portion from the Figma code. */}

      {/* Main content: 2 columns => Channels (left), Streams (right) */}
      <Grid container spacing={1} sx={{ flex: 1, pt: 1 }}>
        {/* ------------------------ */}
        {/*   CHANNELS SECTION       */}
        {/* ------------------------ */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            sx={{
              mb: 4,
              color: 'text.secondary',
              fontWeight: 500,
            }}
          >
            Channels
          </Typography>

          <Paper
            sx={{
              bgcolor: '#27272a',
              borderRadius: 2,
              overflow: 'hidden',
              height: 'calc(100% - 40px)',
            }}
          >
            {/* Toolbar for Channels */}
            <Box
              sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography color="text.secondary" fontSize={14}>
                  Links:
                </Typography>
                {['HDHR', 'M3U', 'EPG'].map((link) => (
                  <Chip
                    key={link}
                    label={link}
                    variant="outlined"
                    size="small"
                    sx={{
                      borderColor: '#3f3f46',
                      color: 'text.secondary',
                      fontSize: 14,
                      height: 28,
                    }}
                    onClick={() => {
                      // If you have a real link action, put it here
                      showAlert(`Clicked ${link}`, 'info');
                    }}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<IndeterminateCheckBox />}
                  sx={{
                    borderColor: '#3f3f46',
                    color: 'text.secondary',
                    opacity: selectedChannelIds.length === 0 ? 0.4 : 1,
                    textTransform: 'none',
                    fontSize: 14,
                  }}
                  disabled={selectedChannelIds.length === 0}
                  onClick={handleRemoveChannels}
                >
                  Remove
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CompareArrows />}
                  sx={{
                    borderColor: '#3f3f46',
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontSize: 14,
                  }}
                  onClick={handleAssignChannels}
                >
                  Assign
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Code />}
                  sx={{
                    borderColor: '#3f3f46',
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontSize: 14,
                  }}
                  onClick={handleAutoMatch}
                >
                  Auto-match
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddBox sx={{ color: '#05DF72' }} />}
                  sx={{
                    bgcolor: '#0d542b',
                    borderColor: '#00a63e',
                    border: 1,
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontSize: 14,
                    '&:hover': {
                      bgcolor: '#0a4020',
                    },
                  }}
                  onClick={handleAddChannel}
                >
                  Add
                </Button>
              </Stack>
            </Box>

            {/* Channels Table */}
            <TableContainer>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow
                    sx={{
                      bgcolor: '#2f2f33',
                      borderBottom: 1,
                      borderColor: '#3f3f46',
                    }}
                  >
                    <TableCell
                      padding="checkbox"
                      sx={{ borderRight: 1, borderColor: '#3f3f46' }}
                    >
                      {/* "Select All" for Channels */}
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        onClick={handleSelectAllChannels}
                      >
                        <CheckBoxOutlineBlank fontSize="small" />
                      </IconButton>
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 40,
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      #{' '}
                      <ArrowDownward
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      Name{' '}
                      <Sort
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1, opacity: 0.4 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 140,
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      Group{' '}
                      <MoreHoriz
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 80,
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      Logo{' '}
                      <MoreHoriz
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 140,
                        color: 'text.secondary',
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {channels.map((channel) => {
                    const isSelected = selectedChannelIds.includes(channel.id);
                    return (
                      <TableRow
                        key={channel.id}
                        sx={{
                          borderBottom: 1,
                          borderColor: '#3f3f46',
                          '&:hover': { bgcolor: '#2a2a2e' },
                        }}
                      >
                        <TableCell
                          padding="checkbox"
                          sx={{
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          <IconButton
                            size="small"
                            sx={{ color: 'text.secondary' }}
                            onClick={() => handleToggleChannel(channel.id)}
                          >
                            {isSelected ? (
                              <IndeterminateCheckBox fontSize="small" />
                            ) : (
                              <CheckBoxOutlineBlank fontSize="small" />
                            )}
                          </IconButton>
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          {channel.channel_number || channel.id}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {channel.channel_name}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          {channel.channel_group
                            ? channel.channel_group.name
                            : ''}
                        </TableCell>
                        <TableCell
                          sx={{
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          {channel.logo_url ? (
                            <Box
                              component="img"
                              src={channel.logo_url}
                              sx={{
                                width: 28,
                                height: 21,
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <Box
                              sx={{
                                width: 28,
                                height: 21,
                                bgcolor: '#959595',
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={4}
                            alignItems="center"
                          >
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{
                                width: 60,
                                borderRight: 1,
                                borderColor: '#52525c',
                              }}
                            >
                              <IconButton
                                size="small"
                                sx={{ color: 'text.secondary' }}
                                onClick={() => handleEditChannel(channel)}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                sx={{ color: 'text.secondary' }}
                                onClick={() => handlePlayChannel(channel)}
                              >
                                <PlayCircle fontSize="small" />
                              </IconButton>
                            </Stack>
                            <IconButton
                              size="small"
                              sx={{ color: 'text.secondary' }}
                              onClick={() => handleDeleteChannel(channel.id)}
                            >
                              <CancelOutlined fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* ------------------------ */}
        {/*   STREAMS SECTION        */}
        {/* ------------------------ */}
        <Grid item xs={12} md={6}>
          <Typography
            variant="h6"
            sx={{
              mb: 4,
              color: 'text.secondary',
              fontWeight: 500,
            }}
          >
            Streams
          </Typography>

          <Paper
            sx={{
              bgcolor: '#27272a',
              borderRadius: 2,
              border: 1,
              borderColor: '#3f3f46',
              overflow: 'hidden',
              height: 'calc(100% - 40px)',
            }}
          >
            {/* Toolbar for Streams */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<IndeterminateCheckBox />}
                  sx={{
                    borderColor: '#3f3f46',
                    color: 'text.secondary',
                    opacity: selectedStreamIds.length === 0 ? 0.4 : 1,
                    textTransform: 'none',
                    fontSize: 14,
                  }}
                  disabled={selectedStreamIds.length === 0}
                  onClick={handleRemoveStreams}
                >
                  Remove
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddBox />}
                  sx={{
                    borderColor: '#3f3f46',
                    color: 'text.secondary',
                    opacity: selectedStreamIds.length === 0 ? 0.5 : 1,
                    textTransform: 'none',
                    fontSize: 14,
                  }}
                  disabled={selectedStreamIds.length === 0}
                  onClick={handleCreateChannelsFromStreams}
                >
                  Create channels
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  sx={{
                    bgcolor: '#0d542b',
                    borderColor: '#00a63e',
                    border: 1,
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontSize: 14,
                    '&:hover': {
                      bgcolor: '#0a4020',
                    },
                  }}
                  onClick={handleAddStream}
                >
                  Add stream
                </Button>
              </Stack>
            </Box>

            {/* Streams Table */}
            <TableContainer>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow
                    sx={{
                      bgcolor: '#2f2f33',
                      borderBottom: 1,
                      borderColor: '#3f3f46',
                    }}
                  >
                    <TableCell
                      padding="checkbox"
                      sx={{ borderRight: 1, borderColor: '#3f3f46' }}
                    >
                      {/* "Select All" for Streams */}
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        onClick={handleSelectAllStreams}
                      >
                        <CheckBoxOutlineBlank fontSize="small" />
                      </IconButton>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      Name{' '}
                      <Sort
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1, opacity: 0.4 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 140,
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      Group{' '}
                      <MoreHoriz
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 80,
                        color: 'text.secondary',
                        borderRight: 1,
                        borderColor: '#3f3f46',
                      }}
                    >
                      M3U{' '}
                      <MoreHoriz
                        fontSize="small"
                        sx={{ verticalAlign: 'middle', ml: 1 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        width: 140,
                        color: 'text.secondary',
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {streams.map((stream) => {
                    const isSelected = selectedStreamIds.includes(stream.id);
                    return (
                      <TableRow
                        key={stream.id}
                        sx={{
                          borderBottom: 1,
                          borderColor: '#3f3f46',
                          '&:hover': { bgcolor: '#2a2a2e' },
                        }}
                      >
                        <TableCell
                          padding="checkbox"
                          sx={{
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          <IconButton
                            size="small"
                            sx={{ color: 'text.secondary' }}
                            onClick={() => handleToggleStream(stream.id)}
                          >
                            {isSelected ? (
                              <IndeterminateCheckBox fontSize="small" />
                            ) : (
                              <CheckBoxOutlineBlank fontSize="small" />
                            )}
                          </IconButton>
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {stream.name}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          {stream.group_name || ''}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderRight: 1,
                            borderColor: '#3f3f46',
                          }}
                        >
                          {/* If your store uses something else for "m3u" or "m3u_account",
                              adapt this line accordingly */}
                          {stream.m3u_account ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={4}
                            alignItems="center"
                          >
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{
                                width: 60,
                                borderRight: 1,
                                borderColor: '#52525c',
                              }}
                            >
                              <IconButton
                                size="small"
                                sx={{ color: 'text.secondary' }}
                                onClick={() => handleEditStream(stream)}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                sx={{ color: 'text.secondary' }}
                                onClick={() => handlePlayStream(stream)}
                              >
                                <PlayCircle fontSize="small" />
                              </IconButton>
                            </Stack>
                            <IconButton
                              size="small"
                              sx={{ color: 'text.secondary' }}
                              onClick={() => handleDeleteStream(stream.id)}
                            >
                              <CancelOutlined fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Channel Form Modal */}
      {channelFormOpen && (
        <ChannelForm
          channel={editingChannel}
          isOpen={channelFormOpen}
          onClose={() => {
            setChannelFormOpen(false);
            setEditingChannel(null);
          }}
        />
      )}

      {/* Stream Form Modal */}
      {streamFormOpen && (
        <StreamForm
          stream={editingStream}
          isOpen={streamFormOpen}
          onClose={() => {
            setStreamFormOpen(false);
            setEditingStream(null);
          }}
        />
      )}
    </Box>
  );
};

export default ChannelsPage;
