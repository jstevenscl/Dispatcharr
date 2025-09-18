import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import API from '../api';

const METADATA_REFRESH_COOLDOWN_MS = 60 * 1000;
const metadataRequestCache = new Map();

const shouldRefreshMetadata = (item) => {
  if (!item || !item.id) return false;
  return !item.poster_url || !item.metadata_last_synced_at;
};

const queueMetadataRefresh = (items, { force = false } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return;
  const now = Date.now();
  items.forEach((item) => {
    if (!shouldRefreshMetadata(item)) {
      if (item?.id) {
        metadataRequestCache.delete(item.id);
      }
      return;
    }
    const lastRequested = metadataRequestCache.get(item.id) || 0;
    if (!force && now - lastRequested < METADATA_REFRESH_COOLDOWN_MS) return;
    metadataRequestCache.set(item.id, now);
    API.refreshMediaItemMetadata(item.id).catch((error) => {
      console.debug('Auto metadata refresh failed', error);
      metadataRequestCache.delete(item.id);
    });
  });
};

const initialFilters = {
  type: 'all',
  search: '',
  status: 'all',
  year: '',
};

const useMediaLibraryStore = create(
  immer((set, get) => ({
    items: [],
    loading: false,
    error: null,
    total: 0,
    activeItem: null,
    activeProgress: null,
    activeItemLoading: false,
    resumePrompt: null,
    selectedLibraryId: null,
    filters: { ...initialFilters },

    setFilters: (updated) =>
      set((state) => {
        state.filters = { ...state.filters, ...updated };
      }),

    setSelectedLibraryId: (libraryId) =>
      set((state) => {
        state.selectedLibraryId = libraryId;
      }),

    resetFilters: () =>
      set((state) => {
        state.filters = { ...initialFilters };
      }),

    upsertItems: (itemsToUpsert) =>
      set((state) => {
        if (!Array.isArray(itemsToUpsert) || itemsToUpsert.length === 0) {
          return;
        }

        const selectedLibraryId = get().selectedLibraryId;
        if (!selectedLibraryId) {
          return;
        }

        const byId = new Map();
        state.items.forEach((item) => {
          byId.set(item.id, item);
        });

        itemsToUpsert.forEach((incoming) => {
          if (!incoming || typeof incoming !== 'object' || !incoming.id) {
            return;
          }
          if (
            incoming.library &&
            Number(incoming.library) !== Number(selectedLibraryId)
          ) {
            return;
          }
          const existing = byId.get(incoming.id) || {};
          byId.set(incoming.id, { ...existing, ...incoming });
        });

        const sorted = Array.from(byId.values()).sort((a, b) => {
          const aTitle = (a.sort_title || a.title || '').toLowerCase();
          const bTitle = (b.sort_title || b.title || '').toLowerCase();
          return aTitle.localeCompare(bTitle);
        });

        state.items = sorted;
        state.total = sorted.length;
      }),

    removeItems: (ids) =>
      set((state) => {
        const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
        state.items = state.items.filter((item) => !idSet.has(item.id));
        state.total = state.items.length;
      }),

    fetchItems: async (libraryId) => {
      if (!libraryId) {
        set((state) => {
          state.items = [];
          state.total = 0;
        });
        return;
      }
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const { filters } = get();
        const params = new URLSearchParams();
        params.append('library', libraryId);
        if (filters.type !== 'all') {
          params.append('item_type', filters.type);
        }
        if (filters.status !== 'all') {
          params.append('status', filters.status);
        }
        if (filters.year) {
          params.append('release_year', filters.year);
        }
        if (filters.search) {
          params.append('search', filters.search);
        }
        const response = await API.getMediaItems(params);
        const results = response.results || response;
        set((state) => {
          state.items = Array.isArray(results) ? results : [];
          state.total = response.count || results.length || 0;
          state.loading = false;
        });
        const itemsArray = Array.isArray(results) ? results : [];
        queueMetadataRefresh(itemsArray);
      } catch (error) {
        console.error('Failed to fetch media items', error);
        set((state) => {
          state.error = 'Failed to load media items';
          state.loading = false;
        });
      }
    },

    openItem: async (id) => {
      set((state) => {
        state.activeItemLoading = true;
        state.resumePrompt = null;
        state.activeProgress = null;
      });
      try {
        const response = await API.getMediaItem(id);
        const progress = response.watch_progress || null;
        set((state) => {
          state.activeItem = response;
          state.activeItemLoading = false;
          state.activeProgress = progress;
        });
        get().upsertItems([response]);
        queueMetadataRefresh([response], { force: true });
        return response;
      } catch (error) {
        console.error('Failed to load media item', error);
        set((state) => {
          state.activeItemLoading = false;
        });
        throw error;
      }
    },

    closeItem: () =>
      set((state) => {
        state.activeItem = null;
        state.resumePrompt = null;
        state.activeProgress = null;
      }),

    setActiveProgress: (progress) =>
      set((state) => {
        if (state.activeItem) {
          state.activeItem = { ...state.activeItem, watch_progress: progress };
        }
        state.items = state.items.map((item) =>
          item.id === state.activeItem?.id
            ? { ...item, watch_progress: progress }
            : item
        );
        state.activeProgress = progress;
      }),

    requestResume: async (progressId) => {
      if (!progressId) return null;
      try {
        const response = await API.resumeMediaProgress(progressId);
        set((state) => {
          state.resumePrompt = response;
        });
        return response;
      } catch (error) {
        console.error('Failed to get resume info', error);
        return null;
      }
    },

    clearResumePrompt: () =>
      set((state) => {
        state.resumePrompt = null;
      }),
  }))
);

export default useMediaLibraryStore;
