import React, { useState } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Anchor,
  Paper,
  Radio,
  SimpleGrid,
  ThemeIcon,
} from '@mantine/core';
import { Bell, ExternalLink } from 'lucide-react';

const ChoiceCard = ({ value, selected, title, description, onSelect, color }) => (
  <Paper
    withBorder
    shadow={selected ? 'md' : 'xs'}
    p="md"
    radius="md"
    onClick={() => onSelect(value)}
    style={{ cursor: 'pointer', borderColor: selected ? `var(--mantine-color-${color}-6)` : undefined }}
  >
    <Group align="flex-start" gap="sm">
      <Radio checked={selected} onChange={() => onSelect(value)} value={value} aria-label={title} />
      <Stack gap={4} style={{ flex: 1 }}>
        <Text fw={600}>{title}</Text>
        <Text c="dimmed" size="sm">
          {description}
        </Text>
      </Stack>
    </Group>
  </Paper>
);

const UpdateIgnoreDialog = ({ opened, onClose, version, url, onChoice }) => {
  const [selection, setSelection] = useState('later');

  const save = () => {
    onChoice(selection);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      radius="md"
      size="md"
      title={
        <Group gap="xs">
          <ThemeIcon color="blue" radius="xl" variant="light">
            <Bell size={18} />
          </ThemeIcon>
          <Text fw={700}>Update Available</Text>
        </Group>
      }
      overlayProps={{ blur: 2, opacity: 0.35 }}
    >
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={500}>
            Dispatcharr <Badge color="blue" variant="light">{version}</Badge> is available
          </Text>
          {url && (
            <Anchor href={url} target="_blank" rel="noreferrer" size="sm">
              View release <ExternalLink size={14} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
            </Anchor>
          )}
        </Group>

        <Text size="sm" c="dimmed">
          Choose how you want to be notified about this update. You can change this later in Settings → Notifications.
        </Text>

        <Radio.Group value={selection} onChange={setSelection}>
          <SimpleGrid cols={{ base: 1, sm: 1 }} spacing="sm">
            <ChoiceCard
              value="later"
              selected={selection === 'later'}
              title="Remind me next login"
              description="We’ll show this update again the next time you sign in."
              onSelect={setSelection}
              color="blue"
            />
            <ChoiceCard
              value="ignore_version"
              selected={selection === 'ignore_version'}
              title="Ignore this version"
              description="Skip notifications for this specific version. We’ll notify you when a newer version is available."
              onSelect={setSelection}
              color="yellow"
            />
            <ChoiceCard
              value="never"
              selected={selection === 'never'}
              title="Never notify"
              description="Turn off update notifications entirely. You can re-enable them in Settings."
              onSelect={setSelection}
              color="red"
            />
          </SimpleGrid>
        </Radio.Group>

        <Group justify="space-between" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save preference</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default UpdateIgnoreDialog;
