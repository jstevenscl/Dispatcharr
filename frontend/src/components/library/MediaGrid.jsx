import React from 'react';
import {
  Badge,
  Box,
  Card,
  Group,
  Image,
  Loader,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { Film, Library, Tv2 } from 'lucide-react';

const typeIcon = {
  movie: <Film size={18} />,
  episode: <Tv2 size={18} />,
  show: <Library size={18} />,
};

const MediaGrid = ({ items, loading, onSelect }) => {
  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No media found. Adjust filters or trigger a scan.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 5 }} spacing="lg">
      {items.map((item) => (
        <Card
          key={item.id}
          shadow="sm"
          padding="sm"
          radius="md"
          withBorder
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect(item)}
        >
          <Stack spacing="xs">
            <Box style={{ position: 'relative' }}>
              {item.poster_url ? (
                <Image
                  src={item.poster_url}
                  alt={item.title}
                  height={200}
                  radius="md"
                  fit="cover"
                />
              ) : (
                <Stack
                  align="center"
                  justify="center"
                  h={200}
                  style={{
                    borderRadius: 12,
                    background: 'rgba(30, 41, 59, 0.6)',
                  }}
                >
                  {typeIcon[item.item_type] || <Library size={24} />}
                </Stack>
              )}
              {item.watch_progress && item.watch_progress.percentage ? (
                <RingProgress
                  style={{ position: 'absolute', top: 10, right: 10 }}
                  size={48}
                  thickness={4}
                  sections={[{
                    value: Math.min(100, item.watch_progress.percentage * 100),
                    color: item.watch_progress.completed ? 'green' : 'cyan',
                  }]}
                  label={
                    <Text size="xs" c="white">
                      {Math.round(item.watch_progress.percentage * 100)}%
                    </Text>
                  }
                />
              ) : null}
            </Box>
            <Stack spacing={2}>
              <Group justify="space-between" align="start">
                <Text fw={600} size="sm" lineClamp={2}>
                  {item.title}
                </Text>
                {item.release_year && (
                  <Badge variant="outline" size="xs">
                    {item.release_year}
                  </Badge>
                )}
              </Group>
              <Group gap="xs">
                <Badge size="xs" color="violet" variant="light">
                  {item.item_type}
                </Badge>
                <Badge
                  size="xs"
                  color={item.status === 'matched' ? 'green' : item.status === 'failed' ? 'red' : 'yellow'}
                  variant="outline"
                >
                  {item.status}
                </Badge>
              </Group>
              {item.runtime_ms && (
                <Text size="xs" c="dimmed">
                  {(item.runtime_ms / 60000).toFixed(0)} min
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
};

export default MediaGrid;
