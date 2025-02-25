// Modal.js
import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Modal,
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
} from "@mui/material";
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useChannelsStore from "../../store/channels";
import API from "../../api"
import useStreamProfilesStore from "../../store/streamProfiles";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
 } from "@mui/icons-material";
import useStreamsStore from "../../store/streams";
import usePlaylistsStore from "../../store/playlists";
import { MaterialReactTable, useMaterialReactTable } from "material-react-table";

const Channel = ({ channel = null, isOpen, onClose }) => {
  const channelGroups = useChannelsStore((state) => state.channelGroups);
  const streams = useStreamsStore(state => state.streams)
  const playlists = usePlaylistsStore(state => state.playlists)
  const streamProfiles = useStreamProfilesStore((state) => state.profiles);

  const [logo, setLogo] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  const [channelStreams, setChannelStreams] = useState([])

  const addStream = (stream) => {
    const streamSet = new Set(channelStreams)
    streamSet.add(stream)
    setChannelStreams(Array.from(streamSet))
  }

  const removeStream = (stream) => {
    const streamSet = new Set(channelStreams)
    streamSet.delete(stream)
    setChannelStreams(Array.from(streamSet))
  }

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogo(file)
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const formik = useFormik({
    initialValues: {
      channel_name: '',
      channel_number: '',
      channel_group_id: '',
      stream_profile_id: '',
      tvg_id: '',
      tvg_name: '',
    },
    validationSchema: Yup.object({
      channel_name: Yup.string().required('Name is required'),
      channel_number: Yup.string().required('Invalid channel number').min(0),
      channel_group_id: Yup.string().required('Channel group is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (channel?.id) {
        await API.updateChannel({id: channel.id, ...values, logo_file: logo, streams: channelStreams.map(stream => stream.id)})
      } else {
        await API.addChannel({
          ...values,
          logo_file: logo,
          streams: channelStreams.map(stream => stream.id),
        })
      }

      resetForm();
      setLogo(null)
      setLogoPreview(null)
      setSubmitting(false);
      onClose()
    }
  })

  useEffect(() => {
    if (channel) {
      formik.setValues({
        channel_name: channel.channel_name,
        channel_number: channel.channel_number,
        channel_group_id: channel.channel_group?.id,
        tvg_id: channel.tvg_id,
        tvg_name: channel.tvg_name,
      });

      setChannelStreams(streams.filter(stream => channel.streams.includes(stream.id)))
    } else {
      formik.resetForm();
    }
  }, [channel]);

  const activeStreamsTable = useMaterialReactTable({
    data: channelStreams,
    columns: useMemo(() => [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'M3U',
        accessorKey: 'group_name',
      },
    ], []),
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => removeStream(row.original)}
        >
          <DeleteIcon fontSize="small" /> {/* Small icon size */}
        </IconButton>
      </>
    ),
    positionActionsColumn: 'last',
    muiTableContainerProps: {
      sx: {
        height: '200px',
      },
    },
  })

  const availableStreamsTable = useMaterialReactTable({
    data: streams,
    columns: useMemo(() => [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'M3U',
        accessorKey: 'group_name',
      },
    ], []),
    enableBottomToolbar: false,
    enableTopToolbar: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
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
  })

  if (!isOpen) {
    return <></>
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
    >
      <Box sx={style}>
        <Typography id="form-modal-title" variant="h6" mb={2}>
          Channel
        </Typography>

        <form onSubmit={formik.handleSubmit}>
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
                error={formik.touched.channel_name && Boolean(formik.errors.channel_name)}
                helperText={formik.touched.channel_name && formik.errors.channel_name}
                variant="standard"
              />

              <FormControl variant="standard" fullWidth>
                <InputLabel id="channel-group-label">Channel Group</InputLabel>
                <Select
                  labelId="channel-group-label"
                  id="channel_group_id"
                  name="channel_group_id"
                  label="Channel Group"
                  value={formik.values.channel_group_id}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.channel_group_id && Boolean(formik.errors.channel_group_id)}
                  // helperText={formik.touched.channel_group_id && formik.errors.channel_group_id}
                  variant="standard"
                >
                  {channelGroups.map((option, index) => (
                    <MenuItem key={index} value={option.id}>
                      {option.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl variant="standard" fullWidth>
                <InputLabel id="stream-profile-label">Stream Profile</InputLabel>
                <Select
                  labelId="stream-profile-label"
                  id="stream_profile_id"
                  name="stream_profile_id"
                  label="Stream Profile (optional)"
                  value={formik.values.stream_profile_id}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.stream_profile_id && Boolean(formik.errors.stream_profile_id)}
                  // helperText={formik.touched.channel_group_id && formik.errors.stream_profile_id}
                  variant="standard"
                >
                  {streamProfiles.map((option, index) => (
                    <MenuItem key={index} value={option.id}>
                      {option.name}
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
                error={formik.touched.channel_number && Boolean(formik.errors.channel_number)}
                helperText={formik.touched.channel_number && formik.errors.channel_number}
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
                error={formik.touched.tvg_name && Boolean(formik.errors.tvg_name)}
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

              <Box mb={2}>
                {/* File upload input */}
                <Stack direction="row" spacing={2}>
                  <Typography>Logo</Typography>
                  {/* Display selected image */}
                  <Box mb={2}>
                    {logo && (
                      <img
                        src={logoPreview}
                        alt="Selected"
                        style={{ maxWidth: 50, height: 'auto' }}
                      />
                    )}
                  </Box>
                </Stack>

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
              </Box>
            </Grid2>
          </Grid2>
          <Box mb={2}>
            {/* Submit button */}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
              fullWidth
            >
              {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          </Box>
        </form>

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
      </Box>
    </Modal>
  );
};

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: "1200px",
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
};

export default Channel;
