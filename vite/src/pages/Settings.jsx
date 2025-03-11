import React, { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';

import API from '../api';
import useSettingsStore from '../store/settings';
import useUserAgentsStore from '../store/userAgents';
import useStreamProfilesStore from '../store/streamProfiles';
import { Button, Center, Flex, Paper, Select, Title } from '@mantine/core';

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
    <Center
      style={{
        height: '100vh',
      }}
    >
      <Paper
        elevation={3}
        style={{ padding: 30, width: '100%', maxWidth: 400 }}
      >
        <Title order={4} align="center">
          Settings
        </Title>
        <form onSubmit={formik.handleSubmit}>
          <Select
            id={settings['default-user-agent']?.id}
            name={settings['default-user-agent']?.key}
            label={settings['default-user-agent']?.name}
            value={formik.values['default-user-agent'] || ''}
            onChange={formik.handleChange}
            error={formik.touched['default-user-agent']}
            data={userAgents.map((option) => ({
              value: `${option.id}`,
              label: option.user_agent_name,
            }))}
          />

          <Select
            id={settings['default-user-agent']?.id}
            name={settings['default-user-agent']?.key}
            label={settings['default-user-agent']?.name}
            value={formik.values['default-user-agent'] || ''}
            onChange={formik.handleChange}
            error={formik.touched['default-user-agent']}
            data={streamProfiles.map((option) => ({
              value: `${option.id}`,
              label: option.profile_name,
            }))}
          />
          {/* <Select
            labelId="region-label"
            id={settings['preferred-region'].id}
            name={settings['preferred-region'].key}
            label={settings['preferred-region'].name}
            value={formik.values['preferred-region'] || ''}
            onChange={formik.handleChange}
            data={regionChoices.map((r) => ({
              label: r.label,
              value: `${r.value}`,
            }))}
          /> */}

          <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
              size="small"
            >
              Submit
            </Button>
          </Flex>
        </form>
      </Paper>
    </Center>
  );
};

export default SettingsPage;
