import React, { useEffect } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Plus, Trash2 } from 'lucide-react';

const LIBRARY_TYPES = [
  { value: 'movies', label: 'Movies' },
  { value: 'shows', label: 'TV Shows' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
];

const defaultLocation = () => ({
  path: '',
  include_subdirectories: true,
  is_primary: false,
});

const LibraryFormModal = ({ opened, onClose, library, onSubmit, submitting }) => {
  const editing = Boolean(library);

  const form = useForm({
    mode: 'controlled',
    initialValues: {
      name: '',
      description: '',
      library_type: 'mixed',
      metadata_language: 'en',
      metadata_country: 'US',
      scan_interval_minutes: 1440,
      auto_scan_enabled: true,
      metadata_options: {},
      locations: [defaultLocation()],
    },
  });

  useEffect(() => {
    if (library) {
      form.setValues({
        name: library.name || '',
        description: library.description || '',
        library_type: library.library_type || 'mixed',
        metadata_language: library.metadata_language || 'en',
        metadata_country: library.metadata_country || 'US',
        scan_interval_minutes: library.scan_interval_minutes || 1440,
        auto_scan_enabled: library.auto_scan_enabled ?? true,
        metadata_options: library.metadata_options || {},
        locations:
          library.locations?.length > 0
            ? library.locations.map((loc) => ({
                id: loc.id,
                path: loc.path,
                include_subdirectories:
                  loc.include_subdirectories ?? true,
                is_primary: loc.is_primary ?? false,
              }))
            : [defaultLocation()],
      });
    } else {
      form.reset();
      form.setFieldValue('locations', [defaultLocation()]);
    }
  }, [library, opened]);

  const addLocation = () => {
    form.insertListItem('locations', defaultLocation());
  };

  const removeLocation = (index) => {
    const values = form.getValues();
    if (values.locations.length === 1) {
      form.setFieldValue('locations', [defaultLocation()]);
      return;
    }
    form.removeListItem('locations', index);
  };

  const submit = (values) => {
    const payload = {
      ...values,
      locations: values.locations.map((loc, index) => ({
        ...loc,
        is_primary: loc.is_primary || index === 0,
      })),
    };
    onSubmit(payload);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? 'Edit Library' : 'Create Library'}
      size="lg"
      overlayProps={{ backgroundOpacity: 0.6, blur: 4 }}
      zIndex={400}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack spacing="md">
          <TextInput
            label="Name"
            placeholder="My Movies"
            required
            {...form.getInputProps('name')}
          />

          <Textarea
            label="Description"
            placeholder="Optional description for this library"
            autosize
            minRows={2}
            {...form.getInputProps('description')}
          />

          <Group grow>
            <Select
              label="Library Type"
              data={LIBRARY_TYPES}
              {...form.getInputProps('library_type')}
            />
            <NumberInput
              label="Auto-scan Interval (minutes)"
              min={15}
              step={15}
              {...form.getInputProps('scan_interval_minutes')}
            />
          </Group>

          <Group grow>
            <TextInput
              label="Metadata Language"
              placeholder="en"
              {...form.getInputProps('metadata_language')}
            />
            <TextInput
              label="Metadata Country"
              placeholder="US"
              {...form.getInputProps('metadata_country')}
            />
          </Group>

          <Switch
            label="Enable automatic scanning"
            checked={form.values.auto_scan_enabled}
            onChange={(event) =>
              form.setFieldValue('auto_scan_enabled', event.currentTarget.checked)
            }
          />

          <Stack spacing="sm">
            <Group justify="space-between" align="center">
              <Text fw={600}>Locations</Text>
              <Button
                size="xs"
                leftSection={<Plus size={14} />}
                variant="light"
                onClick={addLocation}
                type="button"
              >
                Add Path
              </Button>
            </Group>

            {form.values.locations.map((location, index) => (
              <Stack
                key={location.id || index}
                p="sm"
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 8,
                }}
                spacing="xs"
              >
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Location {index + 1}
                  </Text>
                  <ActionIcon
                    size="sm"
                    color="red"
                    variant="subtle"
                    onClick={() => removeLocation(index)}
                  >
                    <Trash2 size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  placeholder="/path/to/library"
                  required
                  value={location.path}
                  onChange={(event) =>
                    form.setFieldValue(
                      `locations.${index}.path`,
                      event.currentTarget.value
                    )
                  }
                />
                <Group>
                  <Checkbox
                    label="Include subdirectories"
                    checked={location.include_subdirectories}
                    onChange={(event) =>
                      form.setFieldValue(
                        `locations.${index}.include_subdirectories`,
                        event.currentTarget.checked
                      )
                    }
                  />
                  <Checkbox
                    label="Primary"
                    checked={location.is_primary}
                    onChange={(event) =>
                      form.setFieldValue(
                        `locations.${index}.is_primary`,
                        event.currentTarget.checked
                      )
                    }
                  />
                </Group>
              </Stack>
            ))}
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {editing ? 'Save changes' : 'Create library'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default LibraryFormModal;
