// Modal.js
import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import M3UProfiles from './M3UProfiles';
import {
  LoadingOverlay,
  TextInput,
  Button,
  Checkbox,
  Modal,
  Flex,
  NativeSelect,
  FileInput,
  Select,
  Space,
  Chip,
  Stack,
  Group,
  Center,
  SimpleGrid,
  Text,
  NumberInput,
  Divider,
  Alert,
} from '@mantine/core';
import { Info } from 'lucide-react';
import useChannelsStore from '../../store/channels';
import { CircleCheck, CircleX } from 'lucide-react';

const M3UGroupFilter = ({ playlist = null, isOpen, onClose }) => {
  const channelGroups = useChannelsStore((s) => s.channelGroups);
  const [groupStates, setGroupStates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');

  useEffect(() => {
    if (Object.keys(channelGroups).length === 0) {
      return;
    }

    setGroupStates(
      playlist.channel_groups.map((group) => ({
        ...group,
        name: channelGroups[group.channel_group].name,
        auto_channel_sync: group.auto_channel_sync || false,
        auto_sync_channel_start: group.auto_sync_channel_start || 1.0,
      }))
    );
  }, [playlist, channelGroups]);

  const toggleGroupEnabled = (id) => {
    setGroupStates(
      groupStates.map((state) => ({
        ...state,
        enabled: state.channel_group == id ? !state.enabled : state.enabled,
      }))
    );
  };

  const toggleAutoSync = (id) => {
    setGroupStates(
      groupStates.map((state) => ({
        ...state,
        auto_channel_sync: state.channel_group == id ? !state.auto_channel_sync : state.auto_channel_sync,
      }))
    );
  };

  const updateChannelStart = (id, value) => {
    setGroupStates(
      groupStates.map((state) => ({
        ...state,
        auto_sync_channel_start: state.channel_group == id ? value : state.auto_sync_channel_start,
      }))
    );
  };

  const submit = async () => {
    setIsLoading(true);
    try {
      // Update group settings via new API endpoint
      await API.updateM3UGroupSettings(playlist.id, groupStates);

      // Refresh the playlist
      API.refreshPlaylist(playlist.id);
      onClose();
    } catch (error) {
      console.error('Error updating group settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectAll = () => {
    setGroupStates(
      groupStates.map((state) => ({
        ...state,
        enabled: state.name.toLowerCase().includes(groupFilter.toLowerCase())
          ? true
          : state.enabled,
      }))
    );
  };

  const deselectAll = () => {
    setGroupStates(
      groupStates.map((state) => ({
        ...state,
        enabled: state.name.toLowerCase().includes(groupFilter.toLowerCase())
          ? false
          : state.enabled,
      }))
    );
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="M3U Group Filter & Auto Channel Sync"
      size={1200}
    >
      <LoadingOverlay visible={isLoading} overlayBlur={2} />
      <Stack>
        <Alert icon={<Info size={16} />} color="blue" variant="light">
          <Text size="sm">
            <strong>Auto Channel Sync:</strong> When enabled, channels will be automatically created for all streams in the group during M3U updates,
            and removed when streams are no longer present. Set a starting channel number for each group to organize your channels.
          </Text>
        </Alert>

        <Flex gap="sm">
          <TextInput
            placeholder="Filter groups..."
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button variant="default" size="sm" onClick={selectAll}>
            Select Visible
          </Button>
          <Button variant="default" size="sm" onClick={deselectAll}>
            Deselect Visible
          </Button>
        </Flex>

        <Divider label="Groups & Auto Sync Settings" labelPosition="center" />

        <Stack spacing="xs" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {groupStates
            .filter((group) =>
              group.name.toLowerCase().includes(groupFilter.toLowerCase())
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => (
              <Group key={group.channel_group} spacing="md" style={{
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                backgroundColor: group.enabled ? '#f8f9fa' : '#f5f5f5'
              }}>
                {/* Group Enable/Disable Button */}
                <Button
                  color={group.enabled ? 'green' : 'gray'}
                  variant="filled"
                  onClick={() => toggleGroupEnabled(group.channel_group)}
                  radius="md"
                  size="sm"
                  leftSection={
                    group.enabled ? (
                      <CircleCheck size={16} />
                    ) : (
                      <CircleX size={16} />
                    )
                  }
                  style={{ minWidth: '140px' }}
                >
                  <Text size="sm" truncate style={{ maxWidth: '120px' }}>
                    {group.name}
                  </Text>
                </Button>

                {/* Auto Sync Checkbox */}
                <Checkbox
                  label="Auto Channel Sync"
                  checked={group.auto_channel_sync && group.enabled}
                  disabled={!group.enabled}
                  onChange={() => toggleAutoSync(group.channel_group)}
                  size="sm"
                />

                {/* Channel Start Number Input */}
                <NumberInput
                  label="Start Channel #"
                  value={group.auto_sync_channel_start}
                  onChange={(value) => updateChannelStart(group.channel_group, value)}
                  disabled={!group.enabled || !group.auto_channel_sync}
                  min={1}
                  step={1}
                  size="sm"
                  style={{ width: '120px' }}
                  precision={1}
                />
              </Group>
            ))}
        </Stack>

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="filled"
            color="blue"
            disabled={isLoading}
            onClick={submit}
          >
            Save and Refresh
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
};

export default M3UGroupFilter;
