// Modal.js
import React, { useState, useEffect } from 'react';
import API from '../../api';
import useUserAgentsStore from '../../store/userAgents';
import M3UProfiles from './M3UProfiles';
import {
  LoadingOverlay,
  TextInput,
  Button,
  Checkbox,
  Modal,
  Flex,
  Select,
  FileInput,
  useMantineTheme,
  NumberInput,
  Divider,
  Stack,
  Group,
  Switch,
} from '@mantine/core';
import M3UGroupFilter from './M3UGroupFilter';
import useChannelsStore from '../../store/channels';
import usePlaylistsStore from '../../store/playlists';
import { notifications } from '@mantine/notifications';
import { isNotEmpty, useForm } from '@mantine/form';

const M3U = ({ playlist = null, isOpen, onClose, playlistCreated = false }) => {
  const theme = useMantineTheme();

  const { userAgents } = useUserAgentsStore();
  const { fetchChannelGroups } = useChannelsStore();

  const [file, setFile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [groupFilterModalOpen, setGroupFilterModalOpen] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const handleFileChange = (file) => {
    console.log(file);
    if (file) {
      setFile(file);
    }
  };

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: '',
      server_url: '',
      user_agent: `${userAgents[0].id}`,
      is_active: true,
      max_streams: 0,
      refresh_interval: 24,
    },

    validate: {
      name: isNotEmpty('Please select a name'),
      user_agent: isNotEmpty('Please select a user-agent'),
      refresh_interval: isNotEmpty('Please specify a refresh interval'),
    },
  });

  useEffect(() => {
    if (playlist) {
      form.setValues({
        name: playlist.name,
        server_url: playlist.server_url,
        max_streams: playlist.max_streams,
        user_agent: `${playlist.user_agent}`,
        is_active: playlist.is_active,
        refresh_interval: playlist.refresh_interval,
      });
    } else {
      form.reset();
    }
  }, [playlist]);

  const onSubmit = async () => {
    const values = form.getValues();

    let newPlaylist;
    if (playlist?.id) {
      await API.updatePlaylist({
        id: playlist.id,
        ...values,
        file,
      });
    } else {
      newPlaylist = await API.addPlaylist({
        ...values,
        file,
      });

      notifications.show({
        title: 'Fetching M3U Groups',
        message: 'Filter out groups or refresh M3U once complete.',
        // color: 'green.5',
      });

      // Don't prompt for group filters, but keeping this here
      // in case we want to revive it
      newPlaylist = null;
    }

    form.reset();
    setFile(null);
    onClose(newPlaylist);
  };

  const closeGroupFilter = () => {
    setGroupFilterModalOpen(false);
    if (playlistCreated) {
      form.reset();
      setFile(null);
      onClose();
    }
  };

  useEffect(() => {
    if (playlistCreated) {
      setGroupFilterModalOpen(true);
    }
  }, [playlist, playlistCreated]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal size={700} opened={isOpen} onClose={onClose} title="M3U Account">
      <LoadingOverlay
        visible={form.submitting}
        overlayBlur={2}
        loaderProps={loadingText ? { children: loadingText } : {}}
      />

      <form onSubmit={form.onSubmit(onSubmit)}>
        <Group justify="space-between" align="top">
          <Stack gap="5" style={{ flex: 1 }}>
            <TextInput
              fullWidth
              id="name"
              name="name"
              label="Name"
              {...form.getInputProps('name')}
              key={form.key('name')}
            />

            <TextInput
              fullWidth
              id="server_url"
              name="server_url"
              label="URL"
              {...form.getInputProps('server_url')}
              key={form.key('server_url')}
            />

            <FileInput
              id="file"
              label="Upload files"
              placeholder="Upload files"
              // value={formik.file}
              onChange={handleFileChange}
            />
          </Stack>

          <Divider size="sm" orientation="vertical" />

          <Stack gap="5" style={{ flex: 1 }}>
            <TextInput
              fullWidth
              id="max_streams"
              name="max_streams"
              label="Max Streams"
              placeholder="0 = Unlimited"
              {...form.getInputProps('max_streams')}
              key={form.key('max_streams')}
            />

            <Select
              id="user_agent"
              name="user_agent"
              label="User-Agent"
              {...form.getInputProps('user_agent')}
              key={form.key('user_agent')}
              data={userAgents.map((ua) => ({
                label: ua.name,
                value: `${ua.id}`,
              }))}
            />

            <NumberInput
              label="Refresh Interval (hours)"
              {...form.getInputProps('refresh_interval')}
              key={form.key('refresh_interval')}
            />

            <Checkbox
              label="Is Active"
              {...form.getInputProps('is_active', { type: 'checkbox' })}
              key={form.key('is_active')}
            />
          </Stack>
        </Group>

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          {playlist && (
            <>
              <Button
                variant="filled"
                // color={theme.custom.colors.buttonPrimary}
                size="sm"
                onClick={() => setGroupFilterModalOpen(true)}
              >
                Groups
              </Button>
              <Button
                variant="filled"
                // color={theme.custom.colors.buttonPrimary}
                size="sm"
                onClick={() => setProfileModalOpen(true)}
              >
                Profiles
              </Button>
            </>
          )}

          <Button
            type="submit"
            variant="filled"
            disabled={form.submitting}
            size="sm"
          >
            Save
          </Button>
        </Flex>
        {playlist && (
          <>
            <M3UProfiles
              playlist={playlist}
              isOpen={profileModalOpen}
              onClose={() => setProfileModalOpen(false)}
            />
            <M3UGroupFilter
              isOpen={groupFilterModalOpen}
              playlist={playlist}
              onClose={closeGroupFilter}
            />
          </>
        )}
      </form>
    </Modal>
  );
};

export default M3U;
