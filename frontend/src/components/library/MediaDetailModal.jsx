import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Image,
  List,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  CheckCircle2,
  Clock,
  DownloadCloud,
  FolderOpen,
  Info,
  PlayCircle,
  RefreshCcw,
  Undo2,
} from 'lucide-react';

import API from '../../api';
import useMediaLibraryStore from '../../store/mediaLibrary';
import useVideoStore from '../../store/useVideoStore';

const runtimeLabel = (runtimeMs) => {
  if (!runtimeMs) return null;
  const totalSeconds = Math.round(runtimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const MediaDetailModal = ({ opened, onClose }) => {
  const {
    activeItem,
    activeItemLoading,
    activeProgress,
    resumePrompt,
    requestResume,
    clearResumePrompt,
    setActiveProgress,
  } = useMediaLibraryStore((state) => ({
    activeItem: state.activeItem,
    activeItemLoading: state.activeItemLoading,
    activeProgress: state.activeProgress,
    resumePrompt: state.resumePrompt,
    requestResume: state.requestResume,
    clearResumePrompt: state.clearResumePrompt,
    setActiveProgress: state.setActiveProgress,
  }));
  const showVideo = useVideoStore((state) => state.showVideo);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [resumeMode, setResumeMode] = useState('start');
  const [markingWatched, setMarkingWatched] = useState(false);
  const [clearingProgress, setClearingProgress] = useState(false);

  useEffect(() => {
    if (activeItem?.files?.length) {
      setSelectedFileId(activeItem.files[0].id);
    } else {
      setSelectedFileId(null);
    }
  }, [activeItem]);

  const canResume = useMemo(() => {
    if (!activeProgress || !activeProgress.position_ms || !activeProgress.duration_ms) {
      return false;
    }
    const remaining = activeProgress.duration_ms - activeProgress.position_ms;
    return remaining > activeProgress.duration_ms * 0.04;
  }, [activeProgress]);

  useEffect(() => {
    if (canResume && activeProgress?.id) {
      requestResume(activeProgress.id);
    }
  }, [canResume, activeProgress, requestResume]);

  const handleStartPlayback = async (mode = 'start') => {
    if (!activeItem) return;
    if (!selectedFileId && activeItem.files?.length) {
      setSelectedFileId(activeItem.files[0].id);
    }
    const fileId = selectedFileId || activeItem.files?.[0]?.id;
    setResumeMode(mode);
    setStartingPlayback(true);
    try {
      const streamInfo = await API.streamMediaItem(activeItem.id, {
        fileId,
      });
      const playbackUrl = streamInfo?.url || streamInfo?.stream_url;
      if (!playbackUrl) {
        notifications.show({
          title: 'Playback error',
          message: 'Streaming endpoint did not return a playable URL.',
          color: 'red',
        });
        return;
      }

      const resumePositionMs =
        mode === 'resume'
          ? resumePrompt?.position_ms || activeProgress?.position_ms || 0
          : 0;

      showVideo(playbackUrl, 'library', {
        mediaItemId: activeItem.id,
        mediaTitle: activeItem.title,
        name: activeItem.title,
        year: activeItem.release_year,
        logo: activeItem.poster_url ? { url: activeItem.poster_url } : undefined,
        progressId: activeProgress?.id,
        resumePositionMs,
        durationMs:
          resumePrompt?.duration_ms || activeProgress?.duration_ms || activeItem.runtime_ms,
        fileId,
      });

      clearResumePrompt();
      setResumeModalOpen(false);
      onClose();
    } catch (error) {
      console.error('Failed to start playback', error);
      notifications.show({
        title: 'Playback error',
        message: 'Unable to start playback. Check server logs for details.',
        color: 'red',
      });
    } finally {
      setStartingPlayback(false);
    }
  };

  const onPlayClick = () => {
    if (canResume && (resumePrompt || activeProgress)) {
      setResumeMode('resume');
      setResumeModalOpen(true);
    } else {
      handleStartPlayback('start');
    }
  };

  const handleMarkWatched = async () => {
    if (!activeItem) return;
    setMarkingWatched(true);
    try {
      await API.markMediaItemWatched(activeItem.id);
      let duration =
        activeItem.runtime_ms || activeItem.files?.[0]?.duration_ms || 0;
      if (!duration) {
        duration = 1000;
      }
      const progressData = {
        id: activeProgress?.id || null,
        position_ms: duration,
        duration_ms: duration,
        completed: true,
        percentage: duration ? 1 : 0,
      };
      setActiveProgress(progressData);
      notifications.show({
        title: 'Progress updated',
        message: 'Marked as watched.',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to mark watched', error);
      notifications.show({
        title: 'Error',
        message: 'Unable to mark as watched.',
        color: 'red',
      });
    } finally {
      setMarkingWatched(false);
    }
  };

  const handleClearProgress = async () => {
    if (!activeItem) return;
    setClearingProgress(true);
    try {
      await API.clearMediaItemProgress(activeItem.id);
      setActiveProgress(null);
      notifications.show({
        title: 'Progress cleared',
        message: 'Watch progress removed.',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to clear progress', error);
      notifications.show({
        title: 'Error',
        message: 'Unable to clear progress.',
        color: 'red',
      });
    } finally {
      setClearingProgress(false);
    }
  };

  const files = activeItem?.files || [];

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => {
          clearResumePrompt();
          onClose();
        }}
        size="xl"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        padding="md"
        title={activeItem ? activeItem.title : 'Media details'}
      >
        {activeItemLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : !activeItem ? (
          <Text c="dimmed">Select a media item to see its details.</Text>
        ) : (
          <ScrollArea h="70vh" offsetScrollbars>
            <Stack spacing="xl" pr="sm">
              <Group align="flex-start" gap="xl">
                {activeItem.poster_url ? (
                  <Image
                    src={activeItem.poster_url}
                    alt={activeItem.title}
                    radius="md"
                    width={220}
                  />
                ) : null}
                <Stack spacing="sm" style={{ flex: 1 }}>
                  <Group justify="space-between" align="center">
                    <Title order={3}>{activeItem.title}</Title>
                    <Group gap="xs">
                      {activeItem.release_year && (
                        <Badge variant="outline">{activeItem.release_year}</Badge>
                      )}
                      {activeItem.rating && (
                        <Badge color="yellow" variant="outline">
                          {activeItem.rating}
                        </Badge>
                      )}
                      <Badge color="violet" variant="light">
                        {activeItem.item_type}
                      </Badge>
                    </Group>
                  </Group>

                  {activeItem.synopsis && (
                    <Text size="sm" c="dimmed">
                      {activeItem.synopsis}
                    </Text>
                  )}

                  <Group gap="lg" mt="sm">
                    {runtimeLabel(
                      activeItem.runtime_ms || files[0]?.duration_ms
                    ) && (
                      <Group gap={4} align="center">
                        <Clock size={18} />
                        <Text size="sm">
                          {runtimeLabel(
                            activeItem.runtime_ms || files[0]?.duration_ms
                          )}
                        </Text>
                      </Group>
                    )}
                    {activeItem.genres && (
                      <Group gap={6}>
                        {activeItem.genres.map((genre) => (
                          <Badge key={genre} variant="light">
                            {genre}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Group>

                  <Group gap="sm" mt="md">
                    <Button
                      leftSection={<PlayCircle size={18} />}
                      onClick={onPlayClick}
                      loading={startingPlayback}
                    >
                      Play
                    </Button>
                    <Button
                      variant="light"
                      leftSection={<CheckCircle2 size={16} />}
                      onClick={handleMarkWatched}
                      loading={markingWatched}
                    >
                      Mark watched
                    </Button>
                    {activeProgress && (
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={handleClearProgress}
                        loading={clearingProgress}
                        title="Clear watch progress"
                      >
                        <Undo2 size={16} />
                      </ActionIcon>
                    )}
                    {canResume && (
                      <Text size="sm" c="dimmed">
                        Resume available at{' '}
                        {runtimeLabel(
                          resumePrompt?.position_ms ||
                            activeProgress?.position_ms
                        )}{' '}
                        of{' '}
                        {runtimeLabel(
                          resumePrompt?.duration_ms ||
                            activeProgress?.duration_ms
                        )}
                      </Text>
                    )}
                    <ActionIcon
                      variant="light"
                      onClick={() => API.refreshMediaItemMetadata(activeItem.id)}
                      title="Refresh metadata"
                    >
                      <RefreshCcw size={18} />
                    </ActionIcon>
                  </Group>
                </Stack>
              </Group>

              <Divider label="Files" labelPosition="center" />

              {files.length === 0 ? (
                <Text c="dimmed">No media files linked yet.</Text>
              ) : (
                <Table highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>File</Table.Th>
                      <Table.Th>Codec</Table.Th>
                      <Table.Th>Resolution</Table.Th>
                      <Table.Th>Duration</Table.Th>
                      <Table.Th>Bitrate</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {files.map((file) => (
                      <Table.Tr
                        key={file.id}
                        onClick={() => setSelectedFileId(file.id)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor:
                            selectedFileId === file.id
                              ? 'rgba(99, 102, 241, 0.1)'
                              : undefined,
                        }}
                      >
                        <Table.Td>
                          <Stack spacing={2}>
                            <Group gap={6}>
                              <FolderOpen size={16} />
                              <Text size="sm">{file.file_name}</Text>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {file.relative_path}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack spacing={2}>
                            <Text size="xs" c="dimmed">
                              Video: {file.video_codec || 'n/a'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              Audio: {file.audio_codec || 'n/a'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          {file.width && file.height
                            ? `${file.width}x${file.height}`
                            : '—'}
                        </Table.Td>
                        <Table.Td>
                          {runtimeLabel(file.duration_ms) || '—'}
                        </Table.Td>
                        <Table.Td>
                          {file.bit_rate
                            ? `${(file.bit_rate / 1000000).toFixed(2)} Mbps`
                            : '—'}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}

              <Divider label="Metadata" labelPosition="center" />

              <Stack spacing="sm">
                <Group gap="sm">
                  {activeItem.tmdb_id && (
                    <Badge
                      component="a"
                      href={`https://www.themoviedb.org/${
                        activeItem.item_type === 'movie' ? 'movie' : 'tv'
                      }/${activeItem.tmdb_id}`}
                      target="_blank"
                      leftSection={<Info size={14} />}
                    >
                      TMDB {activeItem.tmdb_id}
                    </Badge>
                  )}
                  {activeItem.imdb_id && (
                    <Badge
                      component="a"
                      href={`https://www.imdb.com/title/${activeItem.imdb_id}`}
                      target="_blank"
                      leftSection={<Info size={14} />}
                    >
                      IMDB {activeItem.imdb_id}
                    </Badge>
                  )}
                </Group>

                {activeItem.cast && activeItem.cast.length > 0 && (
                  <Stack spacing={4}>
                    <Text fw={500}>Cast</Text>
                    <List size="sm" spacing={2}>
                      {activeItem.cast.map((person) => (
                        <List.Item key={person}>{person}</List.Item>
                      ))}
                    </List>
                  </Stack>
                )}

                {activeItem.crew && activeItem.crew.length > 0 && (
                  <Stack spacing={4}>
                    <Text fw={500}>Crew</Text>
                    <List size="sm" spacing={2}>
                      {activeItem.crew.map((person) => (
                        <List.Item key={person}>{person}</List.Item>
                      ))}
                    </List>
                  </Stack>
                )}
              </Stack>
            </Stack>
          </ScrollArea>
        )}
      </Modal>

      <Modal
        opened={resumeModalOpen}
        onClose={() => {
          setResumeModalOpen(false);
          setResumeMode('start');
        }}
        title="Resume playback?"
        centered
      >
        <Stack spacing="md">
          <Text>
            Resume from{' '}
            {runtimeLabel(
              resumePrompt?.position_ms || activeProgress?.position_ms
            )}{' '}
            of{' '}
            {runtimeLabel(
              resumePrompt?.duration_ms || activeProgress?.duration_ms
            )}
            ?
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              leftSection={<DownloadCloud size={16} />}
              onClick={() => handleStartPlayback('resume')}
              loading={startingPlayback && resumeMode === 'resume'}
            >
              Resume
            </Button>
            <Button
              leftSection={<PlayCircle size={16} />}
              onClick={() => handleStartPlayback('start')}
              loading={startingPlayback && resumeMode === 'start'}
            >
              Start over
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default MediaDetailModal;
