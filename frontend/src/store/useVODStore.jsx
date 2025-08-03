import { create } from 'zustand';
import api from '../api';

const useVODStore = create((set, get) => ({
    vods: {},
    series: {},
    categories: {},
    loading: false,
    error: null,
    filters: {
        type: 'all', // 'all', 'movies', 'series'
        search: '',
        category: '',
    },
    currentPage: 1,
    totalCount: 0,
    pageSize: 20,

    setFilters: (newFilters) =>
        set((state) => ({
            filters: { ...state.filters, ...newFilters },
            currentPage: 1, // Reset to first page when filters change
        })),

    setPage: (page) =>
        set(() => ({
            currentPage: page,
        })),

    fetchVODs: async () => {
        set({ loading: true, error: null });
        try {
            const state = get();
            const params = new URLSearchParams();

            params.append('page', state.currentPage);
            params.append('page_size', state.pageSize);

            if (state.filters.search) {
                params.append('search', state.filters.search);
            }

            if (state.filters.category) {
                params.append('category', state.filters.category);
            }

            if (state.filters.type === 'movies') {
                params.append('type', 'movie');
            }

            const response = await api.getVODs(params);

            // Handle both paginated and non-paginated responses
            const results = response.results || response;
            const count = response.count || results.length;

            set({
                vods: results.reduce((acc, vod) => {
                    acc[vod.id] = vod;
                    return acc;
                }, {}),
                totalCount: count,
                loading: false,
            });
        } catch (error) {
            console.error('Failed to fetch VODs:', error);
            set({ error: 'Failed to load VODs.', loading: false });
        }
    },

    fetchSeries: async () => {
        set({ loading: true, error: null });
        try {
            const state = get();
            const params = new URLSearchParams();

            params.append('page', state.currentPage);
            params.append('page_size', state.pageSize);

            if (state.filters.search) {
                params.append('search', state.filters.search);
            }

            if (state.filters.category) {
                params.append('category', state.filters.category);
            }

            const response = await api.getVODSeries(params);

            // Handle both paginated and non-paginated responses
            const results = response.results || response;
            const count = response.count || results.length;

            set({
                series: results.reduce((acc, series) => {
                    acc[series.id] = series;
                    return acc;
                }, {}),
                totalCount: count,
                loading: false,
            });
        } catch (error) {
            console.error('Failed to fetch series:', error);
            set({ error: 'Failed to load series.', loading: false });
        }
    },

    fetchSeriesEpisodes: async (seriesId) => {
        set({ loading: true, error: null });
        try {
            const response = await api.getSeriesEpisodes(seriesId);

            set((state) => ({
                vods: {
                    ...state.vods,
                    ...response.reduce((acc, episode) => {
                        acc[episode.id] = episode;
                        return acc;
                    }, {}),
                },
                loading: false,
            }));
        } catch (error) {
            console.error('Failed to fetch series episodes:', error);
            set({ error: 'Failed to load episodes.', loading: false });
        }
    },

    fetchCategories: async () => {
        try {
            const response = await api.getVODCategories();
            // Handle both array and paginated responses
            const results = response.results || response;

            set({
                categories: results.reduce((acc, category) => {
                    acc[category.id] = category;
                    return acc;
                }, {}),
            });
        } catch (error) {
            console.error('Failed to fetch VOD categories:', error);
            set({ error: 'Failed to load categories.' });
        }
    },

    addVOD: (vod) =>
        set((state) => ({
            vods: { ...state.vods, [vod.id]: vod },
        })),

    updateVOD: (vod) =>
        set((state) => ({
            vods: { ...state.vods, [vod.id]: vod },
        })),

    removeVOD: (vodId) =>
        set((state) => {
            const updatedVODs = { ...state.vods };
            delete updatedVODs[vodId];
            return { vods: updatedVODs };
        }),

    addSeries: (series) =>
        set((state) => ({
            series: { ...state.series, [series.id]: series },
        })),

    updateSeries: (series) =>
        set((state) => ({
            series: { ...state.series, [series.id]: series },
        })),

    removeSeries: (seriesId) =>
        set((state) => {
            const updatedSeries = { ...state.series };
            delete updatedSeries[seriesId];
            return { series: updatedSeries };
        }),
}));

export default useVODStore;
