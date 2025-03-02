import React, { useEffect, useState } from 'react';
import {
  Grid2,
  Box,
  Container,
  Typography,
  TextField,
  Button,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  InputLabel,
} from '@mui/material';
import useSettingsStore from '../store/settings';
import useUserAgentsStore from '../store/userAgents';
import useStreamProfilesStore from '../store/streamProfiles';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../api';

const SettingsPage = () => {
  const { settings } = useSettingsStore();
  const { userAgents } = useUserAgentsStore();
  const { profiles: streamProfiles } = useStreamProfilesStore();

  const formik = useFormik({
    initialValues: {
      'default-user-agent': '',
      'default-stream-profile': '',
    },
    validationSchema: Yup.object({
      'default-user-agent': Yup.string().required('User-Agent is required'),
      'default-stream-profile': Yup.string().required(
        'Stream Profile is required'
      ),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      const changedSettings = {};
      for (const setting in values) {
        if (values[setting] != settings[setting].value) {
          changedSettings[setting] = values[setting];
        }
      }

      console.log(changedSettings);
      for (const updated in changedSettings) {
        await API.updateSetting({
          ...settings[updated],
          value: values[updated],
        });
      }
    },
  });

  useEffect(() => {
    formik.setValues(
      Object.values(settings).reduce((acc, setting) => {
        acc[setting.key] = parseInt(setting.value) || setting.value;
        return acc;
      }, {})
    );
  }, [settings, streamProfiles, userAgents]);

  return (
    <Container maxWidth="md">
      <Box mt={4}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <form onSubmit={formik.handleSubmit}>
          <Grid2 container spacing={3}>
            <FormControl variant="standard" fullWidth>
              <InputLabel id="user-agent-label">Default User-Agent</InputLabel>
              <Select
                labelId="user-agent-label"
                id={settings['default-user-agent'].id}
                name={settings['default-user-agent'].key}
                label={settings['default-user-agent'].name}
                value={formik.values['default-user-agent']}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={
                  formik.touched['default-user-agent'] &&
                  Boolean(formik.errors['default-user-agent'])
                }
                helperText={
                  formik.touched['default-user-agent'] &&
                  formik.errors['default-user-agent']
                }
                variant="standard"
              >
                {userAgents.map((option, index) => (
                  <MenuItem key={index} value={option.id}>
                    {option.user_agent_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl variant="standard" fullWidth>
              <InputLabel id="stream-profile-label">
                Default Stream Profile
              </InputLabel>
              <Select
                labelId="stream-profile-label"
                id={settings['default-stream-profile'].id}
                name={settings['default-stream-profile'].key}
                label={settings['default-stream-profile'].name}
                value={formik.values['default-stream-profile']}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={
                  formik.touched['default-stream-profile'] &&
                  Boolean(formik.errors['default-stream-profile'])
                }
                helperText={
                  formik.touched['default-stream-profile'] &&
                  formik.errors['default-stream-profile']
                }
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

          <Box mt={4} display="flex" justifyContent="flex-end">
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
              size="small"
            >
              {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          </Box>
        </form>
      </Box>
    </Container>
  );
};

export default SettingsPage;
