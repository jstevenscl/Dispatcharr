import React, { useMemo, useState, useEffect } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  Container,
  Flex,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {
  Gauge,
  HardDriveDownload,
  HardDriveUpload,
  SquarePlus,
  SquareX,
  Timer,
  Users,
  Video,
} from 'lucide-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import useChannelsStore from '../store/channels';
import RecordingForm from '../components/forms/Recording';
import API from '../api';

dayjs.extend(duration);
dayjs.extend(relativeTime);

const RecordingCard = ({ recording }) => {
  const { channels } = useChannelsStore();

  const deleteRecording = (id) => {
    API.deleteRecording(id);
  };

  const customProps = JSON.parse(recording.custom_properties);
  let recordingName = 'Custom Recording';
  if (customProps.program) {
    recordingName = customProps.program.title;
  }

  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      style={{
        color: '#fff',
        backgroundColor: '#27272A',
      }}
    >
      <Flex justify="space-between" align="center">
        <Group>
          <Text fw={500}>{recordingName}</Text>
        </Group>

        <Center>
          <Tooltip label="Delete / Cancel">
            <ActionIcon
              variant="transparent"
              color="red.9"
              onClick={() => deleteRecording(recording.id)}
            >
              <SquareX size="24" />
            </ActionIcon>
          </Tooltip>
        </Center>
      </Flex>

      <Text size="sm">Channel: {channels[recording.channel].name}</Text>
      <Text size="sm">
        Start: {dayjs(recording.start_time).format('MMMM D, YYYY h:MMa')}
        End: {dayjs(recording.end_time).format('MMMM D, YYYY h:MMa')}
      </Text>
    </Card>
  );
};

const DVRPage = () => {
  const theme = useMantineTheme();

  const { recordings } = useChannelsStore();

  const [recordingModalOpen, setRecordingModalOpen] = useState(false);

  const openRecordingModal = () => {
    setRecordingModalOpen(true);
  };

  const closeRecordingModal = () => {
    setRecordingModalOpen(false);
  };

  return (
    <Box style={{ padding: 10 }}>
      <Button
        leftSection={<SquarePlus size={18} />}
        variant="light"
        size="sm"
        onClick={openRecordingModal}
        p={5}
        color={theme.tailwind.green[5]}
        style={{
          borderWidth: '1px',
          borderColor: theme.tailwind.green[5],
          color: 'white',
        }}
      >
        New Recording
      </Button>
      <SimpleGrid cols={5} spacing="md" style={{ paddingTop: 10 }}>
        {Object.values(recordings).map((recording) => (
          <RecordingCard recording={recording} />
        ))}
      </SimpleGrid>

      <RecordingForm
        isOpen={recordingModalOpen}
        onClose={closeRecordingModal}
      />
    </Box>
  );
};

export default DVRPage;
