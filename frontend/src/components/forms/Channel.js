import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  Select,
  MenuItem,
  Grid2,
  InputLabel,
  FormControl,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormHelperText,
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useChannelsStore from '../../store/channels';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
import useStreamsStore from '../../store/streams';
import {
  MaterialReactTable,
  useMaterialReactTable,
} from 'material-react-table';
import ChannelGroupForm from './ChannelGroup';
import usePlaylistsStore from '../../store/playlists';
import logo from '../../images/logo.png';

const Channel = ({ channel = null, isOpen, onClose }) => {
  const channelGroups = useChannelsStore((state) => state.channelGroups);
  const streams = useStreamsStore((state) => state.streams);
  const { profiles: streamProfiles } = useStreamProfilesStore();
  const { playlists } = usePlaylistsStore();

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(logo);
  const [channelStreams, setChannelStreams] = useState([]);
  const [channelGroupModelOpen, setChannelGroupModalOpen] = useState(false);

  const addStream = (stream) => {
    const streamSet = new Set(channelStreams);
    streamSet.add(stream);
    setChannelStreams(Array.from(streamSet));
  };

  const removeStream = (stream) => {
    const streamSet = new Set(channelStreams);
    streamSet.delete(stream);
    setChannelStreams(Array.from(streamSet));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const formik = useFormik({
    initialValues: {
      channel_name: '',
      channel_number: '',
      channel_group_id: '',
      stream_profile_id: '0',
      tvg_id: '',
      tvg_name: '',
    },
    validationSchema: Yup.object({
      channel_name: Yup.string().required('Name is required'),
      channel_number: Yup.string().required('Invalid channel number').min(0),
      channel_group_id: Yup.string().required('Channel group is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (values.stream_profile_id == '0') {
        values.stream_profile_id = null;
      }

      console.log(values);
      if (channel?.id) {
        await API.updateChannel({
          id: channel.id,
          ...values,
          logo_file: logoFile,
          streams: channelStreams.map((stream) => stream.id),
        });
      } else {
        await API.addChannel({
          ...values,
          logo_file: logoFile,
          streams: channelStreams.map((stream) => stream.id),
        });
      }

      resetForm();
      setLogoFile(null);
      setLogoPreview(logo);
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (channel) {
      formik.setValues({
        channel_name: channel.channel_name,
        channel_number: channel.channel_number,
        channel_group_id: channel.channel_group?.id,
        stream_profile_id: channel.stream_profile_id || '0',
        tvg_id: channel.tvg_id,
        tvg_name: channel.tvg_name,
      });

      console.log(channel);
      const filteredStreams = streams
        .filter((stream) => channel.stream_ids.includes(stream.id))
        .sort(
          (a, b) =>
            channel.stream_ids.indexOf(a.id) - channel.stream_ids.indexOf(b.id)
        );
      setChannelStreams(filteredStreams);
    } else {
      formik.resetForm();
    }
  }, [channel]);

  const activeStreamsTable = useMaterialReactTable({
    data: channelStreams,
    columns: useMemo(
      () => [
        {
          header: 'Name',
          accessorKey: 'name',
        },
        {
          header: 'M3U',
          accessorKey: 'group_name',
        },
      ],
      []
    ),
    enableSorting: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowOrdering: true,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => removeStream(row.original)}
        >
          <RemoveIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: '200px',
      },
    },
    muiRowDragHandleProps: ({ table }) => ({
      onDragEnd: () => {
        const { draggingRow, hoveredRow } = table.getState();

        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );

          setChannelStreams([...channelStreams]);
        }
      },
    }),
  });

  const availableStreamsTable = useMaterialReactTable({
    data: streams,
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
      []
    ),
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="success" // Red color for delete actions
          onClick={() => addStream(row.original)}
        >
          <AddIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    positionActionsColumn: 'last',
    muiTableContainerProps: {
      sx: {
        height: '200px',
      },
    },
  });

  if (!isOpen) {
    return <></>;
  }

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="lg">
        <DialogTitle
          sx={{
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          Channel
        </DialogTitle>

        <form onSubmit={formik.handleSubmit}>
          <DialogContent>
            <Grid2 container spacing={2}>
              <Grid2 size={6}>
                <TextField
                  fullWidth
                  id="channel_name"
                  name="channel_name"
                  label="Channel Name"
                  value={formik.values.channel_name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched.channel_name &&
                    Boolean(formik.errors.channel_name)
                  }
                  helperText={
                    formik.touched.channel_name && formik.errors.channel_name
                  }
                  variant="standard"
                />

                <Grid2
                  container
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <Grid2 size={11}>
                    <FormControl variant="standard" fullWidth>
                      <InputLabel id="channel-group-label">
                        Channel Group
                      </InputLabel>
                      <Select
                        labelId="channel-group-label"
                        id="channel_group_id"
                        name="channel_group_id"
                        label="Channel Group"
                        value={formik.values.channel_group_id}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        error={
                          formik.touched.channel_group_id &&
                          Boolean(formik.errors.channel_group_id)
                        }
                        // helperText={formik.touched.channel_group_id && formik.errors.channel_group_id}
                        variant="standard"
                      >
                        {channelGroups.map((option, index) => (
                          <MenuItem key={index} value={option.id}>
                            {option.name}
                          </MenuItem>
                        ))}
                      </Select>
                      <FormHelperText sx={{ color: 'error.main' }}>
                        {formik.touched.channel_group_id &&
                          formik.errors.channel_group_id}
                      </FormHelperText>
                    </FormControl>
                  </Grid2>
                  <Grid2 size={1}>
                    <IconButton
                      color="success"
                      onClick={() => setChannelGroupModalOpen(true)}
                      title="Create new group"
                      size="small"
                      variant="filled"
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Grid2>
                </Grid2>

                <FormControl variant="standard" fullWidth>
                  <InputLabel id="stream-profile-label">
                    Stream Profile
                  </InputLabel>
                  <Select
                    labelId="stream-profile-label"
                    id="stream_profile_id"
                    name="stream_profile_id"
                    value={formik.values.stream_profile_id}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={
                      formik.touched.stream_profile_id &&
                      Boolean(formik.errors.stream_profile_id)
                    }
                    // helperText={formik.touched.channel_group_id && formik.errors.stream_profile_id}
                    variant="standard"
                  >
                    <MenuItem value="0" selected>
                      <em>Use Default</em>
                    </MenuItem>
                    {streamProfiles.map((option, index) => (
                      <MenuItem key={index} value={option.id}>
                        {option.profile_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  id="channel_number"
                  name="channel_number"
                  label="Channel #"
                  value={formik.values.channel_number}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched.channel_number &&
                    Boolean(formik.errors.channel_number)
                  }
                  helperText={
                    formik.touched.channel_number &&
                    formik.errors.channel_number
                  }
                  variant="standard"
                />
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  id="tvg_name"
                  name="tvg_name"
                  label="TVG Name"
                  value={formik.values.tvg_name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched.tvg_name && Boolean(formik.errors.tvg_name)
                  }
                  helperText={formik.touched.tvg_name && formik.errors.tvg_name}
                  variant="standard"
                />

                <TextField
                  fullWidth
                  id="tvg_id"
                  name="tvg_id"
                  label="TVG ID"
                  value={formik.values.tvg_id}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.tvg_id && Boolean(formik.errors.tvg_id)}
                  helperText={formik.touched.tvg_id && formik.errors.tvg_id}
                  variant="standard"
                />

                <TextField
                  fullWidth
                  id="logo_url"
                  name="logo_url"
                  label="Logo URL (Optional)"
                  variant="standard"
                  sx={{ marginBottom: 2 }}
                  value={formik.values.logo_url}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  helperText="If you have a direct image URL, set it here."
                />

                <Box mt={2} mb={2}>
                  {/* File upload input */}
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                      alignItems: 'center',
                    }}
                  >
                    <Typography>Logo</Typography>
                    {/* Display selected image */}
                    <Box mb={2}>
                      <img
                        src={logoPreview}
                        alt="Selected"
                        style={{ maxWidth: 50, height: 'auto' }}
                      />
                    </Box>
                    <input
                      type="file"
                      id="logo"
                      name="logo"
                      accept="image/*"
                      onChange={(event) => handleLogoChange(event)}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="logo">
                      <Button variant="contained" component="span" size="small">
                        Browse...
                      </Button>
                    </label>
                  </Stack>
                </Box>
              </Grid2>
            </Grid2>

            <Grid2 container spacing={2}>
              <Grid2 size={6}>
                <Typography>Active Streams</Typography>
                <MaterialReactTable table={activeStreamsTable} />
              </Grid2>

              <Grid2 size={6}>
                <Typography>Available Streams</Typography>
                <MaterialReactTable table={availableStreamsTable} />
              </Grid2>
            </Grid2>
          </DialogContent>

          <DialogActions>
            {/* Submit button */}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <ChannelGroupForm
        isOpen={channelGroupModelOpen}
        onClose={() => setChannelGroupModalOpen(false)}
      />
    </>
  );
};

export default Channel;
