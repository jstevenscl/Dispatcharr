import React, { useEffect } from 'react';
import {
  Badge,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { Timeline } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import useLibraryStore from '../../store/library';

dayjs.extend(relativeTime);

const statusColor = {
  pending: 'gray',
  running: 'blue',
  started: 'blue',
  discovered: 'indigo',
  completed: 'green',
  failed: 'red',
  cancelled: 'yellow',
};

const LibraryScanDrawer = ({ opened, onClose, libraryId }) => {
  const fetchScans = useLibraryStore((s) => s.fetchScans);
  const scansLoading = useLibraryStore((s) => s.scansLoading);
  const scans = useLibraryStore((s) => s.scans[libraryId || 'all'] || []);

  useEffect(() => {
    if (opened) {
      fetchScans(libraryId);
    }
  }, [opened, libraryId, fetchScans]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Library scans"
      position="right"
      size="md"
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }}
    >
      <ScrollArea style={{ height: '100%' }}>
        {scansLoading ? (
          <Group justify="center" py="lg">
            <Loader />
          </Group>
        ) : scans.length === 0 ? (
          <Text c="dimmed">No scans recorded yet.</Text>
        ) : (
          <Timeline active={0} reverseActive bulletSize={20} lineWidth={2}>
            {scans.map((scan) => (
              <Timeline.Item
                key={scan.id}
                title={dayjs(scan.created_at).format('MMM D, YYYY HH:mm')}
                bullet={<Badge color={statusColor[scan.status] || 'gray'}>{scan.status}</Badge>}
              >
                <Stack spacing={4} mt="xs">
                  <Text size="sm">Summary: {scan.summary || 'No summary yet'}</Text>
                  <Text size="xs" c="dimmed">
                    Started {scan.started_at ? dayjs(scan.started_at).fromNow() : 'n/a'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Finished {scan.finished_at ? dayjs(scan.finished_at).fromNow() : 'n/a'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Files processed: {scan.total_files ?? '—'} · New {scan.new_files ?? '—'} · Updated {scan.updated_files ?? '—'} · Removed {scan.removed_files ?? '—'}
                  </Text>
                  {scan.unmatched_files > 0 && (
                    <Text size="xs" c="yellow.4">
                      Unmatched files: {scan.unmatched_files}
                    </Text>
                  )}
                  {scan.log && (
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                      {scan.log}
                    </Text>
                  )}
                </Stack>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </ScrollArea>
    </Drawer>
  );
};

export default LibraryScanDrawer;
