import { create } from 'zustand';
import API from '../api';

const host = window.location.origin;

const useVODStore = create((set, get) => ({
    // State
    vods: {},
    series: {},
    categories: {},
    loading: false,
    error: null,

    // Filters and pagination
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    filters: {
        type: 'all', // 'all', 'movies', 'series'
        category: '',
        search: '',
        year: null,
        seriesId: null
    },

    // Actions
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    setFilters: (newFilters) => set((state) => ({
        filters: { ...state.filters, ...newFilters },
        currentPage: 1 // Reset to first page when filters change
    })),

    setPage: (page) => set({ currentPage: page }),

    fetchVODs: async () => {
        const { filters, currentPage, pageSize } = get();
        set({ loading: true, error: null });

        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                page_size: pageSize.toString(),
                ...Object.fromEntries(
                    Object.entries(filters).filter(([_, value]) =>
                        value !== null && value !== '' && value !== 'all'
                    )
                )
            });

            const response = await API.request(`${host}/api/vod/vods/?${params}`);

            set({
                vods: response.results || response,
                totalCount: response.count || response.length || 0,
                loading: false
            });
        } catch (error) {
            set({ error: error.message, loading: false });
        }
    },

    fetchSeries: async () => {
        const { filters, currentPage, pageSize } = get();
        set({ loading: true, error: null });

        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                page_size: pageSize.toString(),
                search: filters.search || ''
            });

            const response = await API.request(`${host}/api/vod/series/?${params}`);

            set({
                series: response.results || response,
                totalCount: response.count || response.length || 0,
                loading: false
            });
        } catch (error) {
            set({ error: error.message, loading: false });
        }
    },

    fetchCategories: async () => {
        set({ loading: true, error: null });

        try {
            const response = await API.request(`${host}/api/vod/categories/`);
            set({
                categories: response.results || response,
                loading: false
            });
        } catch (error) {
            set({ error: error.message, loading: false });
        }
    },

    fetchSeriesEpisodes: async (seriesId) => {
        set({ loading: true, error: null });

        try {
            const response = await API.request(`${host}/api/vod/series/${seriesId}/episodes/`);
            set({
                vods: response.results || response,
                totalCount: response.count || response.length || 0,
                loading: false
            });
        } catch (error) {
            set({ error: error.message, loading: false });
        }
    },

    // Clear data
    clearVODs: () => set({ vods: {}, totalCount: 0 }),
    clearSeries: () => set({ series: {} }),
    clearFilters: () => set({
        filters: {
            type: 'all',
            category: '',
            search: '',
            year: null,
            seriesId: null
        },
        currentPage: 1
    })
}));

export default useVODStore;
