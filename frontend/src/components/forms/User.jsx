// Modal.js
import React, { useState, useEffect } from 'react';
import API from '../../api';
import useEPGsStore from '../../store/epgs';
import {
  LoadingOverlay,
  TextInput,
  Button,
  Checkbox,
  Modal,
  Flex,
  NativeSelect,
  NumberInput,
  Space,
  Select,
  PasswordInput,
  Box,
  Group,
  Stack,
  MultiSelect,
  Switch,
  Text,
  Center,
  ActionIcon,
} from '@mantine/core';
import { RotateCcw, X } from 'lucide-react';
import { isNotEmpty, useForm } from '@mantine/form';
import useChannelsStore from '../../store/channels';
import { USER_LEVELS, USER_LEVEL_LABELS } from '../../constants';
import useAuthStore from '../../store/auth';

const User = ({ user = null, isOpen, onClose }) => {
  const profiles = useChannelsStore((s) => s.profiles);
  const authUser = useAuthStore((s) => s.user);

  const [enableXC, setEnableXC] = useState(false);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      username: '',
      email: '',
      user_level: '0',
      password: '',
      xc_password: '',
      channel_profiles: [],
    },

    validate: (values) => ({
      username: !values.username
        ? 'Username is required'
        : values.user_level == USER_LEVELS.STREAMER &&
            !values.username.match(/^[a-z0-9]+$/i)
          ? 'Streamer username must be alphanumeric'
          : null,
      password:
        !user && !values.password
          ? 'Password is requried'
          : values.user_level == USER_LEVELS.STREAMER &&
              !user &&
              !values.password.match(/^[a-z0-9]+$/i)
            ? 'Streamer password must be alphanumeric'
            : null,
      xc_password:
        values.xc_password && !values.xc_password.match(/^[a-z0-9]+$/i)
          ? 'XC password must be alphanumeric'
          : null,
    }),
  });

  const onSubmit = async () => {
    const values = form.getValues();

    const { xc_password, ...customProps } = JSON.parse(
      user.custom_properties || '{}'
    );

    if (values.xc_password) {
      customProps.xc_password = values.xc_password;
    }

    delete values.xc_password;

    values.custom_properties = JSON.stringify(customProps);

    if (!user) {
      await API.createUser(values);
    } else {
      if (!values.password) {
        delete values.password;
      }

      await API.updateUser(user.id, values);
    }

    form.reset();
    onClose();
  };

  useEffect(() => {
    if (user?.id) {
      const customProps = JSON.parse(user.custom_properties || '{}');

      form.setValues({
        username: user.username,
        email: user.email,
        user_level: `${user.user_level}`,
        channel_profiles: user.channel_profiles.map((id) => `${id}`),
        xc_password: customProps.xc_password || '',
      });

      if (customProps.xc_password) {
        setEnableXC(true);
      }
    } else {
      form.reset();
    }
  }, [user]);

  const generateXCPassword = () => {
    form.setValues({
      xc_password: Math.random().toString(36).slice(2),
    });
  };

  if (!isOpen) {
    return <></>;
  }

  const showPermissions =
    authUser.user_level == USER_LEVELS.ADMIN && authUser.id !== user?.id;

  return (
    <Modal opened={isOpen} onClose={onClose} title="User" size="xl">
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Group justify="space-between" align="top">
          <Stack gap="xs" style={{ flex: 1 }}>
            <TextInput
              id="username"
              name="username"
              label="Username"
              {...form.getInputProps('username')}
              key={form.key('username')}
            />

            <PasswordInput
              label="Password"
              description="Used for UI authentication"
              {...form.getInputProps('password')}
              key={form.key('password')}
            />

            {showPermissions && (
              <Select
                label="User Level"
                data={Object.entries(USER_LEVELS).map(([label, value]) => {
                  return {
                    label: USER_LEVEL_LABELS[value],
                    value: `${value}`,
                  };
                })}
                {...form.getInputProps('user_level')}
                key={form.key('user_level')}
              />
            )}
          </Stack>

          <Stack gap="xs" style={{ flex: 1 }}>
            <TextInput
              id="email"
              name="email"
              label="E-Mail"
              {...form.getInputProps('email')}
              key={form.key('email')}
            />

            <Group align="flex-end">
              <TextInput
                label="XC Password"
                description="Auto-generated - clear to disable XC API"
                {...form.getInputProps('xc_password')}
                key={form.key('xc_password')}
                style={{ flex: 1 }}
                rightSectionWidth={30}
                rightSection={
                  <ActionIcon
                    variant="transparent"
                    size="sm"
                    color="white"
                    onClick={generateXCPassword}
                  >
                    <RotateCcw />
                  </ActionIcon>
                }
              />
            </Group>

            {showPermissions && (
              <MultiSelect
                label="Channel Profiles"
                {...form.getInputProps('channel_profiles')}
                key={form.key('channel_profiles')}
                data={Object.values(profiles)
                  .filter((profile) => profile.id != 0)
                  .map((profile) => ({
                    label: profile.name,
                    value: `${profile.id}`,
                  }))}
              />
            )}
          </Stack>
        </Group>

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            type="submit"
            variant="contained"
            disabled={form.submitting}
            size="small"
          >
            Save
          </Button>
        </Flex>
      </form>
    </Modal>
  );
};

export default User;
