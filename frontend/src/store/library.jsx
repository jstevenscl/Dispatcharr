import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import API from '../api';

const useLibraryStore = create(
  immer((set, get) => ({
    libraries: [],
    loading: false,
    scans: {},
    scansLoading: false,
    error: null,
    selectedLibraryId: null,
    filters: {
      search: '',
      type: 'all',
      autoScan: 'all',
    },

    setSelectedLibrary: (id) =>
      set((state) => {
        state.selectedLibraryId = id;
      }),

    setFilters: (filters) =>
      set((state) => {
        state.filters = { ...state.filters, ...filters };
      }),

    fetchLibraries: async () => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const params = new URLSearchParams();
        const { filters } = get();
        if (filters.type !== 'all') {
          params.append('library_type', filters.type);
        }
        if (filters.autoScan !== 'all') {
          params.append('auto_scan_enabled', filters.autoScan === 'enabled');
        }
        if (filters.search) {
          params.append('search', filters.search);
        }
        const data = await API.getMediaLibraries(params);
        set((state) => {
          state.libraries = Array.isArray(data) ? data : data.results || [];
          state.loading = false;
        });
      } catch (error) {
        console.error('Failed to fetch libraries', error);
        set((state) => {
          state.error = 'Failed to load libraries';
          state.loading = false;
        });
      }
    },

    createLibrary: async (payload) => {
      const response = await API.createMediaLibrary(payload);
      set((state) => {
        state.libraries.push(response);
      });
      return response;
    },

    updateLibrary: async (id, payload) => {
      const response = await API.updateMediaLibrary(id, payload);
      set((state) => {
        const index = state.libraries.findIndex((lib) => lib.id === id);
        if (index >= 0) {
          state.libraries[index] = { ...state.libraries[index], ...response };
        }
      });
      return response;
    },

    deleteLibrary: async (id) => {
      await API.deleteMediaLibrary(id);
      set((state) => {
        state.libraries = state.libraries.filter((lib) => lib.id !== id);
        if (state.selectedLibraryId === id) {
          state.selectedLibraryId = null;
        }
        delete state.scans[id];
      });
    },

    triggerScan: async (id, options = {}) => {
      const response = await API.triggerLibraryScan(id, options);
      set((state) => {
        if (!state.scans[id]) {
          state.scans[id] = [];
        }
        state.scans[id] = [response, ...(state.scans[id] || [])];
        state.scans['all'] = [response, ...(state.scans['all'] || [])];
      });
      return response;
    },

    fetchScans: async (libraryId) => {
      set((state) => {
        state.scansLoading = true;
      });
      try {
        const params = new URLSearchParams();
        if (libraryId) {
          params.append('library', libraryId);
        }
        const response = await API.getLibraryScans(params);
        set((state) => {
          state.scans[libraryId || 'all'] = Array.isArray(response)
            ? response
            : response.results || [];
          state.scansLoading = false;
        });
      } catch (error) {
        console.error('Failed to fetch scans', error);
        set((state) => {
          state.scansLoading = false;
        });
      }
    },

    applyScanUpdate: (event) =>
      set((state) => {
        if (!event?.scan_id) return;
        const scanId = event.scan_id;
        const libraryId = event.library_id || null;

        const updateList = (list) => {
          const items = list ? [...list] : [];
          const index = items.findIndex((scan) => String(scan.id) === String(scanId));
          const updatedEntry = {
            id: scanId,
            library: libraryId,
            library_name: event.library_name || '',
            status: event.status || 'running',
            summary: event.summary || event.message || items[index]?.summary || '',
            matched_items: event.matched ?? items[index]?.matched_items ?? null,
            unmatched_files: event.unmatched ?? items[index]?.unmatched_files ?? null,
            total_files: event.files ?? items[index]?.total_files ?? null,
            new_files: event.new_files ?? items[index]?.new_files ?? null,
            updated_files: event.updated_files ?? items[index]?.updated_files ?? null,
            removed_files: event.removed_files ?? items[index]?.removed_files ?? null,
            created_at:
              (items[index]?.created_at || new Date().toISOString()),
            finished_at:
              event.status === 'completed'
                ? new Date().toISOString()
                : items[index]?.finished_at || null,
            updated_at: new Date().toISOString(),
          };

          if (index >= 0) {
            items[index] = { ...items[index], ...updatedEntry };
          } else {
            items.unshift(updatedEntry);
          }
          return items;
        };

        const keysToUpdate = [libraryId || 'all'];
        if (libraryId && libraryId !== 'all') {
          keysToUpdate.push('all');
        }

        keysToUpdate.forEach((key) => {
          state.scans[key] = updateList(state.scans[key]);
        });
      }),
  }))
);

export default useLibraryStore;
