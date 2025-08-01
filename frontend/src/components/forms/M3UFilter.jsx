// Modal.js
import React, { useState, useEffect } from 'react';
import API from '../../api';
import {
  TextInput,
  Button,
  Modal,
  Flex,
  Select,
  PasswordInput,
  Group,
  Stack,
  MultiSelect,
  ActionIcon,
  Switch,
  Box,
} from '@mantine/core';
import { RotateCcwKey, X } from 'lucide-react';
import { useForm } from '@mantine/form';
import useChannelsStore from '../../store/channels';
import {
  M3U_FILTER_TYPES,
  USER_LEVELS,
  USER_LEVEL_LABELS,
} from '../../constants';
import useAuthStore from '../../store/auth';
import usePlaylistsStore from '../../store/playlists';

const M3UFilter = ({ filter = null, m3u, isOpen, onClose }) => {
  const fetchPlaylist = usePlaylistsStore((s) => s.fetchPlaylist);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      filter_type: 'group',
      regex_pattern: '',
      exclude: true,
    },

    validate: (values) => ({}),
  });

  useEffect(() => {
    if (filter) {
      form.setValues({
        filter_type: filter.filter_type,
        regex_pattern: filter.regex_pattern,
        exclude: filter.exclude,
      });
    } else {
      form.reset();
    }
  }, [filter]);

  const onSubmit = async () => {
    const values = form.getValues();

    if (!filter) {
      // By default, new rule will go at the end
      values.order = m3u.filters.length;
      await API.addM3UFilter(m3u.id, values);
    } else {
      await API.updateM3UFilter(m3u.id, filter.id, values);
    }

    fetchPlaylist(m3u.id);

    form.reset();
    onClose();
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="Filter">
      <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack gap="xs" style={{ flex: 1 }}>
          <Select
            label="Field"
            description="Specify which property of the stream object this rule will apply to"
            data={M3U_FILTER_TYPES}
            {...form.getInputProps('filter_type')}
            key={form.key('filter_type')}
          />

          <TextInput
            id="regex_pattern"
            name="regex_pattern"
            label="Regex Pattern"
            description="Regular expression to execute on the value to determine if the filter applies to the item"
            {...form.getInputProps('regex_pattern')}
            key={form.key('regex_pattern')}
          />

          <Group justify="space-between">
            <Box>Exclude</Box>
            <Switch
              id="exclude"
              name="exclude"
              description="Specify if this is an exclusion or inclusion rule"
              key={form.key('exclude')}
              {...form.getInputProps('exclude', {
                type: 'checkbox',
              })}
            />
          </Group>
        </Stack>

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

export default M3UFilter;
