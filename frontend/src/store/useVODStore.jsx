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
        try {
            set({ loading: true, error: null });
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

    fetchVODDetails: async (vodId) => {
        set({ loading: true, error: null });
        try {
            const response = await api.getVODInfo(vodId);

            // Transform the response data to match our expected format
            const vodDetails = {
                id: response.id || vodId,
                name: response.name || '',
                description: response.description || '',
                year: response.year || null,
                genre: response.genre || '',
                rating: response.rating || '',
                duration: response.duration || null,
                stream_url: response.stream_url || '',
                logo: response.logo || null,
                type: 'movie',
                director: response.director || '',
                actors: response.actors || '',
                country: response.country || '',
                tmdb_id: response.tmdb_id || '',
                youtube_trailer: response.youtube_trailer || '',
            };

            set((state) => ({
                vods: {
                    ...state.vods,
                    [vodDetails.id]: vodDetails,
                },
                loading: false,
            }));

            return vodDetails;
        } catch (error) {
            console.error('Failed to fetch VOD details:', error);
            set({ error: 'Failed to load VOD details.', loading: false });
            throw error;
        }
    },

    fetchVODDetailsFromProvider: async (vodId) => {
        set({ loading: true, error: null });
        try {
            const response = await api.getVODInfoFromProvider(vodId);

            // Transform the response data to match our expected format
            const vodDetails = {
                id: response.id || vodId,
                name: response.name || '',
                description: response.description || response.plot || '',
                year: response.year || null,
                genre: response.genre || '',
                rating: response.rating || '',
                duration: response.duration || null,
                stream_url: response.stream_url || '',
                logo: response.logo || response.cover || null,
                type: 'movie',
                director: response.director || '',
                actors: response.actors || response.cast || '',
                country: response.country || '',
                tmdb_id: response.tmdb_id || '',
                youtube_trailer: response.youtube_trailer || '',
                // Additional provider fields
                backdrop_path: response.backdrop_path || [],
                release_date: response.release_date || response.releasedate || '',
                movie_image: response.movie_image || null,
                o_name: response.o_name || '',
                age: response.age || '',
                episode_run_time: response.episode_run_time || null,
                bitrate: response.bitrate || 0,
                video: response.video || {},
                audio: response.audio || {},
            };

            set((state) => ({
                vods: {
                    ...state.vods,
                    [vodDetails.id]: vodDetails,
                },
                loading: false,
            }));

            return vodDetails;
        } catch (error) {
            console.error('Failed to fetch VOD details from provider:', error);
            set({ error: 'Failed to load VOD details from provider.', loading: false });
            throw error;
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
