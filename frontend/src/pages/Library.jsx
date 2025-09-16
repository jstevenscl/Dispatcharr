import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { Filter, ListChecks, Plus, RefreshCcw, ServerOff } from 'lucide-react';
import { shallow } from 'zustand/shallow';

import useLibraryStore from '../store/library';
import useMediaLibraryStore from '../store/mediaLibrary';
import LibraryCard from '../components/library/LibraryCard';
import LibraryFormModal from '../components/library/LibraryFormModal';
import MediaGrid from '../components/library/MediaGrid';
import MediaDetailModal from '../components/library/MediaDetailModal';
import LibraryScanDrawer from '../components/library/LibraryScanDrawer';

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'matched', label: 'Matched' },
  { value: 'failed', label: 'Needs attention' },
];

const LibraryPage = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState(null);
  const [scanDrawerOpen, setScanDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchTerm, 400);
  const [librarySearch, setLibrarySearch] = useState('');
  const [debouncedLibrarySearch] = useDebouncedValue(librarySearch, 400);
  const [playbackModalOpen, setPlaybackModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const {
    libraries,
    loading: librariesLoading,
    fetchLibraries,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    triggerScan,
    selectedLibraryId,
    setSelectedLibrary,
    filters: libraryFilters,
    setFilters: setLibraryFilters,
  } = useLibraryStore(
    (state) => ({
      libraries: state.libraries,
      loading: state.loading,
      fetchLibraries: state.fetchLibraries,
      createLibrary: state.createLibrary,
      updateLibrary: state.updateLibrary,
      deleteLibrary: state.deleteLibrary,
      triggerScan: state.triggerScan,
      selectedLibraryId: state.selectedLibraryId,
      setSelectedLibrary: state.setSelectedLibrary,
      filters: state.filters,
      setFilters: state.setFilters,
    }),
    shallow
  );

  const {
    items,
    loading: itemsLoading,
    total,
    page,
    pageSize,
    setPage,
    filters: itemFilters,
    setFilters: setItemFilters,
    fetchItems,
    openItem,
    closeItem,
  } = useMediaLibraryStore(
    (state) => ({
      items: state.items,
      loading: state.loading,
      total: state.total,
      page: state.page,
      pageSize: state.pageSize,
      setPage: state.setPage,
      filters: state.filters,
      setFilters: state.setFilters,
      fetchItems: state.fetchItems,
      openItem: state.openItem,
      closeItem: state.closeItem,
    }),
    shallow
  );

  useEffect(() => {
    fetchLibraries();
  }, [fetchLibraries]);

  useEffect(() => {
    setItemFilters({ search: debouncedSearch });
    setPage(1);
  }, [debouncedSearch, setItemFilters, setPage]);

  useEffect(() => {
    setLibraryFilters({ search: debouncedLibrarySearch });
    fetchLibraries();
  }, [debouncedLibrarySearch, setLibraryFilters, fetchLibraries]);

  const selectedLibrary = useMemo(
    () => libraries.find((lib) => lib.id === selectedLibraryId) || null,
    [libraries, selectedLibraryId]
  );

  useEffect(() => {
    if (selectedLibraryId) {
      fetchItems(selectedLibraryId);
    }
  }, [selectedLibraryId, fetchItems, page, pageSize, itemFilters.type, itemFilters.status, itemFilters.year, itemFilters.search]);

  const handleCreateOrUpdate = async (payload) => {
    setFormSubmitting(true);
    try {
      if (editingLibrary) {
        await updateLibrary(editingLibrary.id, payload);
        notifications.show({
          title: 'Library updated',
          message: 'Changes saved successfully.',
          color: 'green',
        });
      } else {
        await createLibrary(payload);
        notifications.show({
          title: 'Library created',
          message: 'New library added.',
          color: 'green',
        });
      }
      setFormOpen(false);
      setEditingLibrary(null);
      fetchLibraries();
    } catch (error) {
      console.error('Failed to save library', error);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (library) => {
    if (!window.confirm(`Delete library "${library.name}"?`)) return;
    try {
      await deleteLibrary(library.id);
      notifications.show({
        title: 'Library removed',
        message: 'The library has been deleted.',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to delete library', error);
    }
  };

  const handleScan = async (id) => {
    try {
      await triggerScan(id, { full: false });
      notifications.show({
        title: 'Scan started',
        message: 'Library scan has been queued.',
        color: 'blue',
      });
      setScanDrawerOpen(true);
    } catch (error) {
      console.error('Failed to start scan', error);
    }
  };

  const onMediaSelect = async (item) => {
    try {
      await openItem(item.id);
      setPlaybackModalOpen(true);
    } catch (error) {
      notifications.show({
        title: 'Error loading media',
        message: 'Unable to open media details.',
        color: 'red',
      });
    }
  };

  return (
    <Box p="md">
      <Stack spacing="xl">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Media Libraries</Title>
            <Text c="dimmed" size="sm">
              Create libraries, trigger scans, and manage your offline media collection.
            </Text>
          </div>
          <Group>
            <Button
              leftSection={<Plus size={16} />}
              onClick={() => {
                setEditingLibrary(null);
                setFormOpen(true);
              }}
            >
              New Library
            </Button>
            <ActionIcon
              variant="light"
              onClick={() => fetchLibraries()}
              title="Refresh libraries"
            >
              <RefreshCcw size={18} />
            </ActionIcon>
            <ActionIcon
              variant="light"
              onClick={() => setScanDrawerOpen(true)}
              title="View recent scans"
            >
              <ListChecks size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Group align="flex-end" grow>
          <TextInput
            label="Search"
            placeholder="Search libraries"
            leftSection={<Filter size={16} />}
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.currentTarget.value)}
          />
          <SegmentedControl
            value={libraryFilters.type}
            onChange={(value) => {
              setLibraryFilters({ type: value });
              fetchLibraries();
            }}
            data={[
              { label: 'All types', value: 'all' },
              { label: 'Movies', value: 'movies' },
              { label: 'Shows', value: 'shows' },
              { label: 'Mixed', value: 'mixed' },
            ]}
          />
          <SegmentedControl
            value={libraryFilters.autoScan}
            onChange={(value) => {
              setLibraryFilters({ autoScan: value });
              fetchLibraries();
            }}
            data={[
              { label: 'Auto + Manual', value: 'all' },
              { label: 'Auto only', value: 'enabled' },
              { label: 'Manual', value: 'disabled' },
            ]}
          />
        </Group>

        {librariesLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : libraries.length === 0 ? (
          <Stack align="center" spacing="md" py="xl">
            <ServerOff size={48} />
            <Text c="dimmed">No libraries yet. Create one to get started.</Text>
            <Button leftSection={<Plus size={16} />} onClick={() => setFormOpen(true)}>
              Create your first library
            </Button>
          </Stack>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {libraries.map((library) => (
              <LibraryCard
                key={library.id}
                library={library}
                selected={library.id === selectedLibraryId}
                onSelect={(id) => {
                  setSelectedLibrary(id);
                  setPage(1);
                }}
                onEdit={(lib) => {
                  setEditingLibrary(lib);
                  setFormOpen(true);
                }}
                onDelete={handleDelete}
                onScan={handleScan}
              />
            ))}
          </SimpleGrid>
        )}

        {selectedLibrary ? (
          <Stack spacing="md">
            <Group justify="space-between" align="center">
              <div>
                <Title order={3}>{selectedLibrary.name}</Title>
                <Text size="sm" c="dimmed">
                  Browsing items in this library.
                </Text>
              </div>
              <Group>
                <TextInput
                  placeholder="Search media"
                  leftSection={<Filter size={16} />}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.currentTarget.value)}
                  maw={260}
                />
                <SegmentedControl
                  value={itemFilters.type}
                  onChange={(value) => {
                    setItemFilters({ type: value });
                    setPage(1);
                  }}
                  data={[
                    { label: 'All', value: 'all' },
                    { label: 'Movies', value: 'movie' },
                    { label: 'Shows', value: 'show' },
                    { label: 'Episodes', value: 'episode' },
                  ]}
                />
                <SegmentedControl
                  value={itemFilters.status}
                  onChange={(value) => {
                    setItemFilters({ status: value });
                    setPage(1);
                  }}
                  data={statusOptions}
                />
              </Group>
            </Group>

            <MediaGrid items={items} loading={itemsLoading} onSelect={onMediaSelect} />

            {total > pageSize ? (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Showing {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, total)} of {total}
                </Text>
                <Pagination
                  total={Math.ceil(total / pageSize)}
                  value={page}
                  onChange={setPage}
                />
              </Group>
            ) : null}
          </Stack>
        ) : (
          <Text c="dimmed" ta="center">
            Select a library to explore its content.
          </Text>
        )}
      </Stack>

      <LibraryFormModal
        opened={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingLibrary(null);
        }}
        library={editingLibrary}
        onSubmit={handleCreateOrUpdate}
        submitting={formSubmitting}
      />

      <LibraryScanDrawer
        opened={scanDrawerOpen}
        onClose={() => setScanDrawerOpen(false)}
        libraryId={selectedLibraryId}
      />

      <MediaDetailModal
        opened={playbackModalOpen}
        onClose={() => {
          setPlaybackModalOpen(false);
          closeItem();
        }}
      />
    </Box>
  );
};

export default LibraryPage;
