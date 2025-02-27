// Modal.js
import React, { useEffect } from 'react';
import {
  TextField,
  Button,
  Select,
  MenuItem,
  Grid2,
  InputLabel,
  FormControl,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';

const Stream = ({ stream = null, isOpen, onClose }) => {
  const streamProfiles = useStreamProfilesStore((state) => state.profiles);

  const formik = useFormik({
    initialValues: {
      name: '',
      url: '',
      stream_profile_id: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      url: Yup.string().required('URL is required').min(0),
      // stream_profile_id: Yup.string().required('Stream profile is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (stream?.id) {
        await API.updateStream({ id: stream.id, ...values });
      } else {
        await API.addStream(values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (stream) {
      formik.setValues({
        name: stream.name,
        url: stream.url,
        stream_profile_id: stream.stream_profile_id,
      });
    } else {
      formik.resetForm();
    }
  }, [stream]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle
        sx={{
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        Stream
      </DialogTitle>

      <form onSubmit={formik.handleSubmit}>
        <DialogContent>
          <Grid2 container spacing={2}>
            <Grid2 size={12}>
              <TextField
                fullWidth
                id="name"
                name="name"
                label="Stream Name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.name && Boolean(formik.errors.name)}
                helperText={formik.touched.name && formik.errors.name}
                variant="standard"
              />

              <TextField
                fullWidth
                id="url"
                name="url"
                label="Stream URL"
                value={formik.values.url}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.url && Boolean(formik.errors.url)}
                helperText={formik.touched.url && formik.errors.url}
                variant="standard"
              />

              <FormControl variant="standard" fullWidth>
                <InputLabel id="stream-profile-label">
                  Stream Profile
                </InputLabel>
                <Select
                  labelId="stream-profile-label"
                  id="stream_profile_id"
                  name="stream_profile_id"
                  label="Stream Profile (optional)"
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
                  {streamProfiles.map((option, index) => (
                    <MenuItem key={index} value={option.id}>
                      {option.profile_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid2>
          </Grid2>
        </DialogContent>

        <DialogActions>
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
  );
};

export default Stream;
