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
  Box,
} from '@mantine/core';
import { Info } from 'lucide-react';
import useChannelsStore from '../../store/channels';
import { CircleCheck, CircleX } from 'lucide-react';
import { notifications } from '@mantine/notifications';

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
      playlist.channel_groups.map((group) => {
        // Parse custom_properties if present
        let customProps = {};
        if (group.custom_properties) {
          try {
            customProps = typeof group.custom_properties === 'string'
              ? JSON.parse(group.custom_properties)
              : group.custom_properties;
          } catch (e) {
            customProps = {};
          }
        }
        return {
          ...group,
          name: channelGroups[group.channel_group].name,
          auto_channel_sync: group.auto_channel_sync || false,
          auto_sync_channel_start: group.auto_sync_channel_start || 1.0,
          custom_properties: customProps,
        };
      })
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

  // Toggle force_dummy_epg in custom_properties for a group
  const toggleForceDummyEPG = (id) => {
    setGroupStates(
      groupStates.map((state) => {
        if (state.channel_group == id) {
          const customProps = { ...(state.custom_properties || {}) };
          customProps.force_dummy_epg = !customProps.force_dummy_epg;
          return {
            ...state,
            custom_properties: customProps,
          };
        }
        return state;
      })
    );
  };

  const submit = async () => {
    setIsLoading(true);
    try {
      // Prepare groupStates for API: custom_properties must be stringified
      const payload = groupStates.map((state) => ({
        ...state,
        custom_properties: state.custom_properties
          ? JSON.stringify(state.custom_properties)
          : undefined,
      }));

      // Update group settings via API endpoint
      await API.updateM3UGroupSettings(playlist.id, payload);

      // Show notification about the refresh process
      notifications.show({
        title: 'Group Settings Updated',
        message: 'Settings saved. Starting M3U refresh to apply changes...',
        color: 'green',
        autoClose: 3000,
      });

      // Refresh the playlist - this will handle channel sync automatically at the end
      await API.refreshPlaylist(playlist.id);

      notifications.show({
        title: 'M3U Refresh Started',
        message: 'The M3U account is being refreshed. Channel sync will occur automatically after parsing completes.',
        color: 'blue',
        autoClose: 5000,
      });

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
      size={1000}
      styles={{ content: { '--mantine-color-body': '#27272A' } }}
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
            size="xs"
          />
          <Button variant="default" size="xs" onClick={selectAll}>
            Select Visible
          </Button>
          <Button variant="default" size="xs" onClick={deselectAll}>
            Deselect Visible
          </Button>
        </Flex>

        <Divider label="Groups & Auto Sync Settings" labelPosition="center" />

        <Box style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <SimpleGrid
            cols={{ base: 1, sm: 2, md: 3 }}
            spacing="xs"
            verticalSpacing="xs"
          >
            {groupStates
              .filter((group) =>
                group.name.toLowerCase().includes(groupFilter.toLowerCase())
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => (
                <Group key={group.channel_group} spacing="xs" style={{
                  padding: '8px',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  backgroundColor: group.enabled ? '#2A2A2E' : '#1E1E22',
                  flexDirection: 'column',
                  alignItems: 'stretch'
                }}>
                  {/* Group Enable/Disable Button */}
                  <Button
                    color={group.enabled ? 'green' : 'gray'}
                    variant="filled"
                    onClick={() => toggleGroupEnabled(group.channel_group)}
                    radius="md"
                    size="xs"
                    leftSection={
                      group.enabled ? (
                        <CircleCheck size={14} />
                      ) : (
                        <CircleX size={14} />
                      )
                    }
                    fullWidth
                  >
                    <Text size="xs" truncate>
                      {group.name}
                    </Text>
                  </Button>

                  {/* Auto Sync Controls */}
                  <Stack spacing={4}>
                    <Checkbox
                      label="Auto Channel Sync"
                      checked={group.auto_channel_sync && group.enabled}
                      disabled={!group.enabled}
                      onChange={() => toggleAutoSync(group.channel_group)}
                      size="xs"
                    />

                    {group.auto_channel_sync && group.enabled && (
                      <>
                        <NumberInput
                          label="Start Channel #"
                          value={group.auto_sync_channel_start}
                          onChange={(value) => updateChannelStart(group.channel_group, value)}
                          min={1}
                          step={1}
                          size="xs"
                          precision={1}
                        />

                        {/* Force Dummy EPG Checkbox */}
                        <Checkbox
                          label="Force Dummy EPG"
                          checked={!!(group.custom_properties && group.custom_properties.force_dummy_epg)}
                          onChange={() => toggleForceDummyEPG(group.channel_group)}
                          size="xs"
                        />

                        {/* Override Channel Group Select */}
                        <Select
                          label="Override Channel Group"
                          placeholder="Select group (optional)"
                          value={group.custom_properties?.group_override?.toString() || null}
                          onChange={(value) => {
                            const newValue = value ? parseInt(value) : null;
                            setGroupStates(
                              groupStates.map((state) => ({
                                ...state,
                                custom_properties: {
                                  ...state.custom_properties,
                                  group_override: newValue,
                                },
                              }))
                            );
                          }}
                          data={Object.values(channelGroups).map((g) => ({
                            value: g.id.toString(),
                            label: g.name,
                          }))}
                          clearable
                          searchable
                          size="xs"
                        />
                      </>
                    )}
                  </Stack>
                </Group>
              ))}
          </SimpleGrid>
        </Box>

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button variant="default" onClick={onClose} size="xs">
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
