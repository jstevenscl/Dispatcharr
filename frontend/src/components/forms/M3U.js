// Modal.js
import React, { useState, useEffect } from "react";
import { Box, Modal, Typography, Stack, TextField, Button, Select, MenuItem, Grid2, InputLabel, FormControl, CircularProgress, FormControlLabel, Checkbox } from "@mui/material";
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from "../../api"
import usePlaylistsStore from "../../store/playlists";
import useUserAgentsStore from "../../store/userAgents";

const M3U = ({ playlist = null, isOpen, onClose }) => {
  const userAgents = useUserAgentsStore(state => state.userAgents)
  const [file, setFile] = useState(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file)
    }
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      server_url: '',
      max_streams: 0,
      user_agent: '',
      is_active: true,
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      user_agent: Yup.string().required('User-Agent is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (playlist?.id) {
        await API.updatePlaylist({id: playlist.id, ...values, uploaded_file: file})
      } else {
        await API.addPlaylist({
          ...values,
          uploaded_file: file,
        })
      }

      resetForm();
      setFile(null)
      setSubmitting(false);
      onClose()
    }
  })

  useEffect(() => {
    if (playlist) {
      formik.setValues({
        name: playlist.name,
        server_url: playlist.server_url,
        max_streams: playlist.max_streams,
        user_agent: playlist.user_agent,
        is_active: playlist.is_active,
      });
    } else {
      formik.resetForm();
    }
  }, [playlist]);

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
          M3U Account
        </Typography>

        <form onSubmit={formik.handleSubmit}>
          <TextField
            fullWidth
            id="name"
            name="name"
            label="Name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.name && Boolean(formik.errors.name)}
            helperText={formik.touched.name && formik.errors.name}
            variant="standard"
          />

          <TextField
            fullWidth
            id="server_url"
            name="server_url"
            label="URL"
            value={formik.values.server_url}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.server_url && Boolean(formik.errors.server_url)}
            helperText={formik.touched.server_url && formik.errors.server_url}
            variant="standard"
          />

          <Box mb={2}>
            {/* File upload input */}
            <Stack direction="row" spacing={2}>
              <Typography>File</Typography>
            </Stack>

            <input
              type="file"
              id="uploaded_file"
              name="uploaded_file"
              accept="image/*"
              onChange={(event) => handleFileChange(event)}
              style={{ display: 'none' }}
            />
            <label htmlFor="uploaded_file">
              <Button variant="contained" component="span">
                Browse...
              </Button>
            </label>
          </Box>

          <TextField
            fullWidth
            id="max_streams"
            name="max_streams"
            label="Max Streams"
            value={formik.values.max_streams}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.max_streams && Boolean(formik.errors.max_streams)}
            helperText={formik.touched.max_streams && formik.errors.max_streams}
            variant="standard"
          />

          <FormControl variant="standard" fullWidth>
            <InputLabel id="user-agent-label">User-Agent</InputLabel>
            <Select
              labelId="user-agent-label"
              id="user_agent"
              name="user_agent"
              label="User-Agent"
              value={formik.values.user_agent}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.user_agent && Boolean(formik.errors.user_agent)}
              helperText={formik.touched.user_agent && formik.errors.user_agent}
              variant="standard"
            >
              {userAgents.map((option, index) => (
                <MenuItem key={index} value={option.id}>
                  {option.user_agent_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                name="is_active"
                checked={formik.values.is_active}
                onChange={(e) => formik.setFieldValue('is_active', e.target.checked)}
              />
            } label="Is Active"
          />

          <Box mb={2}>
            {/* Submit button */}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
              fullWidth
              size="small"
            >
              {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          </Box>
        </form>
      </Box>
    </Modal>
  );
};

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
};

export default M3U;
