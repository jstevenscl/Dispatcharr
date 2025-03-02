import React, { useEffect } from 'react';
import {
  Grid as Grid2,
  Box,
  Container,
  Typography,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  InputLabel,
  Button,
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';

import API from '../api';
import useSettingsStore from '../store/settings';
import useUserAgentsStore from '../store/userAgents';
import useStreamProfilesStore from '../store/streamProfiles';

const SettingsPage = () => {
  const { settings } = useSettingsStore();
  const { userAgents } = useUserAgentsStore();
  const { profiles: streamProfiles } = useStreamProfilesStore();

  // Add your region choices here:
  const regionChoices = [
    { value: 'us', label: 'US' },
    { value: 'uk', label: 'UK' },
    { value: 'nl', label: 'NL' },
    { value: 'de', label: 'DE' },
    // Add more if needed
  ];

  const formik = useFormik({
    initialValues: {
      'default-user-agent': '',
      'default-stream-profile': '',
      'preferred-region': '',
    },
    validationSchema: Yup.object({
      'default-user-agent': Yup.string().required('User-Agent is required'),
      'default-stream-profile': Yup.string().required(
        'Stream Profile is required'
      ),
      // The region is optional or required as you prefer
      // 'preferred-region': Yup.string().required('Region is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      const changedSettings = {};
      for (const settingKey in values) {
        // If the user changed the setting’s value from what’s in the DB:
        if (String(values[settingKey]) !== String(settings[settingKey].value)) {
          changedSettings[settingKey] = values[settingKey];
        }
      }

      // Update each changed setting in the backend
      for (const updatedKey in changedSettings) {
        await API.updateSetting({
          ...settings[updatedKey],
          value: changedSettings[updatedKey],
        });
      }

      setSubmitting(false);
      // Don’t necessarily resetForm, in case the user wants to see new values
    },
  });

  // Initialize form values once settings / userAgents / profiles are loaded
  useEffect(() => {
    formik.setValues(
      Object.values(settings).reduce((acc, setting) => {
        // If the setting’s value is numeric, parse it
        // Otherwise, just store as string
        const possibleNumber = parseInt(setting.value, 10);
        acc[setting.key] = isNaN(possibleNumber)
          ? setting.value
          : possibleNumber;
        return acc;
      }, {})
    );
    // eslint-disable-next-line
  }, [settings, userAgents, streamProfiles]);

  return (
    <Container maxWidth="md">
      <Box mt={4}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>

        <form onSubmit={formik.handleSubmit}>
          <Grid2 container spacing={3}>
            {/* Default User-Agent */}
            <Grid2 xs={12}>
              <FormControl variant="standard" fullWidth>
                <InputLabel id="user-agent-label">Default User-Agent</InputLabel>
                <Select
                  labelId="user-agent-label"
                  id={settings['default-user-agent']?.id}
                  name={settings['default-user-agent']?.key}
                  label={settings['default-user-agent']?.name}
                  value={formik.values['default-user-agent'] || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched['default-user-agent'] &&
                    Boolean(formik.errors['default-user-agent'])
                  }
                  variant="standard"
                >
                  {userAgents.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.user_agent_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid2>

            {/* Default Stream Profile */}
            <Grid2 xs={12}>
              <FormControl variant="standard" fullWidth>
                <InputLabel id="stream-profile-label">
                  Default Stream Profile
                </InputLabel>
                <Select
                  labelId="stream-profile-label"
                  id={settings['default-stream-profile']?.id}
                  name={settings['default-stream-profile']?.key}
                  label={settings['default-stream-profile']?.name}
                  value={formik.values['default-stream-profile'] || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched['default-stream-profile'] &&
                    Boolean(formik.errors['default-stream-profile'])
                  }
                  variant="standard"
                >
                  {streamProfiles.map((profile) => (
                    <MenuItem key={profile.id} value={profile.id}>
                      {profile.profile_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid2>

            {/* Preferred Region */}
            <Grid2 xs={12}>
              {/* Only render if you do indeed have "preferred-region" in the DB */}
              {settings['preferred-region'] && (
                <FormControl variant="standard" fullWidth>
                  <InputLabel id="region-label">Preferred Region</InputLabel>
                  <Select
                    labelId="region-label"
                    id={settings['preferred-region'].id}
                    name={settings['preferred-region'].key}
                    label={settings['preferred-region'].name}
                    value={formik.values['preferred-region'] || ''}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    variant="standard"
                  >
                    {regionChoices.map((r) => (
                      <MenuItem key={r.value} value={r.value}>
                        {r.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Grid2>
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
