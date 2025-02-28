// Modal.js
import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Select,
  MenuItem,
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
import useEPGsStore from '../../store/epgs';

const EPG = ({ epg = null, isOpen, onClose }) => {
  const epgs = useEPGsStore((state) => state.epgs);
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file);
    }
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      source_type: '',
      url: '',
      api_key: '',
      is_active: true,
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      source_type: Yup.string().required('Source type is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (epg?.id) {
        await API.updateEPG({ id: epg.id, ...values, epg_file: file });
      } else {
        await API.addEPG({
          ...values,
          epg_file: file,
        });
      }

      resetForm();
      setFile(null);
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (epg) {
      formik.setValues({
        name: epg.name,
        source_type: epg.source_type,
        url: epg.url,
        api_key: epg.api_key,
        is_active: epg.is_active,
      });
    } else {
      formik.resetForm();
    }
  }, [epg]);

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
        EPG Source
      </DialogTitle>
      <form onSubmit={formik.handleSubmit}>
        <DialogContent>
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
            id="url"
            name="url"
            label="URL"
            value={formik.values.url}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.url && Boolean(formik.errors.url)}
            helperText={formik.touched.url && formik.errors.url}
            variant="standard"
          />

          <TextField
            fullWidth
            id="api_key"
            name="api_key"
            label="API Key"
            value={formik.values.api_key}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.api_key && Boolean(formik.errors.api_key)}
            helperText={formik.touched.api_key && formik.errors.api_key}
            variant="standard"
          />

          <FormControl variant="standard" fullWidth>
            <InputLabel id="source-type-label">Source Type</InputLabel>
            <Select
              labelId="source-type-label"
              id="source_type"
              name="source_type"
              label="Source Type"
              value={formik.values.source_type}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={
                formik.touched.source_type && Boolean(formik.errors.source_type)
              }
              helperText={
                formik.touched.source_type && formik.errors.source_type
              }
              variant="standard"
            >
              <MenuItem key="0" value="xmltv">
                XMLTV
              </MenuItem>
              <MenuItem key="1" value="schedules_direct">
                Schedules Direct
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>

        <DialogActions>
          {/* Submit button */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={formik.isSubmitting}
            size="small"
          >
            {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EPG;
