import React, { useState, useEffect } from 'react';
import {
  TextField,
  Typography,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';

const RegexFormAndView = ({ profile = null, m3u, isOpen, onClose }) => {
  const [searchPattern, setSearchPattern] = useState('');
  const [replacePattern, setReplacePattern] = useState('');

  console.log(profile);

  let regex;
  try {
    regex = new RegExp(searchPattern, 'g');
  } catch (e) {
    regex = null;
  }

  const highlightedUrl = regex
    ? m3u.server_url.replace(regex, (match) => `<mark>${match}</mark>`)
    : m3u.server_url;

  const resultUrl = regex
    ? m3u.server_url.replace(regex, replacePattern)
    : m3u.server_url;

  const onSearchPatternUpdate = (e) => {
    formik.handleChange(e);
    setSearchPattern(e.target.value);
  };

  const onReplacePatternUpdate = (e) => {
    formik.handleChange(e);
    setReplacePattern(e.target.value);
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      max_streams: 0,
      search_pattern: '',
      replace_pattern: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      search_pattern: Yup.string().required('Search pattern is required'),
      replace_pattern: Yup.string().required('Replace pattern is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      console.log('submiting');
      if (profile?.id) {
        await API.updateM3UProfile(m3u.id, {
          id: profile.id,
          ...values,
        });
      } else {
        await API.addM3UProfile(m3u.id, values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (profile) {
      setSearchPattern(profile.search_pattern);
      setReplacePattern(profile.replace_pattern);
      formik.setValues({
        name: profile.name,
        max_streams: profile.max_streams,
        search_pattern: profile.search_pattern,
        replace_pattern: profile.replace_pattern,
      });
    } else {
      formik.resetForm();
    }
  }, [profile]);

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle
        sx={{ backgroundColor: 'primary.main', color: 'primary.contrastText' }}
      >
        M3U Profile
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
            id="max_streams"
            name="max_streams"
            label="Max Streams"
            value={formik.values.max_streams}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={
              formik.touched.max_streams && Boolean(formik.errors.max_streams)
            }
            helperText={formik.touched.max_streams && formik.errors.max_streams}
            variant="standard"
          />
          <TextField
            fullWidth
            id="search_pattern"
            name="search_pattern"
            label="Search Pattern (Regex)"
            value={searchPattern}
            onChange={onSearchPatternUpdate}
            onBlur={formik.handleBlur}
            error={
              formik.touched.search_pattern &&
              Boolean(formik.errors.search_pattern)
            }
            helperText={
              formik.touched.search_pattern && formik.errors.search_pattern
            }
            variant="standard"
          />
          <TextField
            fullWidth
            id="replace_pattern"
            name="replace_pattern"
            label="Replace Pattern"
            value={replacePattern}
            onChange={onReplacePatternUpdate}
            onBlur={formik.handleBlur}
            error={
              formik.touched.replace_pattern &&
              Boolean(formik.errors.replace_pattern)
            }
            helperText={
              formik.touched.replace_pattern && formik.errors.replace_pattern
            }
            variant="standard"
          />
        </DialogContent>

        <DialogActions>
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

      <Card>
        <CardContent>
          <Typography variant="h6">Search</Typography>
          <Typography
            dangerouslySetInnerHTML={{ __html: highlightedUrl }}
            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Replace</Typography>
          <Typography>{resultUrl}</Typography>
        </CardContent>
      </Card>
    </Dialog>
  );
};

export default RegexFormAndView;
