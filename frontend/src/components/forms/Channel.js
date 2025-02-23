// Modal.js
import React, { useState, useEffect } from "react";
import { Box, Modal, Typography, Stack, TextField, Button, Select, MenuItem, Grid2, InputLabel, FormControl, CircularProgress } from "@mui/material";
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useChannelsStore from "../../store/channels";
import API from "../../api"

const Channel = ({ channel = null, isOpen, onClose }) => {
  const channelGroups = useChannelsStore((state) => state.channelGroups);
  const [logo, setLogo] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

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
    },
    validationSchema: Yup.object({
      channel_name: Yup.string().required('Name is required'),
      channel_number: Yup.string().required('Invalid channel number').min(0),
      channel_group_id: Yup.string().required('Channel group is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (channel?.id) {
        await API.updateChannel({id: channel.id, ...values, logo_file: logo})
      } else {
        await API.addChannel({
          ...values,
          logo_file: logo,
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
        channel_group_id: channel.channel_group_id,
      });
    } else {
      formik.resetForm();
    }
  }, [channel]);

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
                  helperText={formik.touched.channel_group_id && formik.errors.channel_group_id}
                  variant="standard"
                >
                  {channelGroups.map((option, index) => (
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
              <Box mb={2}>
                {/* File upload input */}
                <Stack direction="row" spacing={2}>
                  <Typography>Logo</Typography>
                  {/* Display selected image */}
                  <Box mb={2}>
                    {logo && (
                      <img
                        src={logo}
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
      </Box>
    </Modal>
  );
};

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
};

export default Channel;
