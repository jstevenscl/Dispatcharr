import { create } from 'zustand';
import api from '../api';

const useLogosStore = create((set, get) => ({
    logos: {},
    isLoading: false,
    error: null,

    // Basic CRUD operations
    setLogos: (logos) => {
        set({
            logos: logos.reduce((acc, logo) => {
                acc[logo.id] = { ...logo };
                return acc;
            }, {}),
        });
    },

    addLogo: (newLogo) =>
        set((state) => ({
            logos: {
                ...state.logos,
                [newLogo.id]: { ...newLogo },
            },
        })),

    updateLogo: (logo) =>
        set((state) => ({
            logos: {
                ...state.logos,
                [logo.id]: { ...logo },
            },
        })),

    removeLogo: (logoId) =>
        set((state) => {
            const newLogos = { ...state.logos };
            delete newLogos[logoId];
            return { logos: newLogos };
        }),

    // Smart loading methods
    fetchLogos: async () => {
        set({ isLoading: true, error: null });
        try {
            const logos = await api.getLogos();
            set({
                logos: logos.reduce((acc, logo) => {
                    acc[logo.id] = { ...logo };
                    return acc;
                }, {}),
                isLoading: false,
            });
            return logos;
        } catch (error) {
            console.error('Failed to fetch logos:', error);
            set({ error: 'Failed to load logos.', isLoading: false });
            throw error;
        }
    },

    fetchUsedLogos: async () => {
        set({ isLoading: true, error: null });
        try {
            const logos = await api.getLogos({ used: 'true' });
            set((state) => ({
                logos: {
                    ...state.logos,
                    ...logos.reduce((acc, logo) => {
                        acc[logo.id] = { ...logo };
                        return acc;
                    }, {}),
                },
                isLoading: false,
            }));
            return logos;
        } catch (error) {
            console.error('Failed to fetch used logos:', error);
            set({ error: 'Failed to load used logos.', isLoading: false });
            throw error;
        }
    },

    fetchLogosByIds: async (logoIds) => {
        if (!logoIds || logoIds.length === 0) return [];

        try {
            // Filter out logos we already have
            const missingIds = logoIds.filter(id => !get().logos[id]);
            if (missingIds.length === 0) return [];

            const logos = await api.getLogosByIds(missingIds);
            set((state) => ({
                logos: {
                    ...state.logos,
                    ...logos.reduce((acc, logo) => {
                        acc[logo.id] = { ...logo };
                        return acc;
                    }, {}),
                },
            }));
            return logos;
        } catch (error) {
            console.error('Failed to fetch logos by IDs:', error);
            throw error;
        }
    },

    fetchLogosInBackground: async () => {
        try {
            // Load all remaining logos in background
            const allLogos = await api.getLogos();
            set((state) => ({
                logos: {
                    ...state.logos,
                    ...allLogos.reduce((acc, logo) => {
                        acc[logo.id] = { ...logo };
                        return acc;
                    }, {}),
                },
            }));
        } catch (error) {
            console.error('Background logo loading failed:', error);
            // Don't throw error for background loading
        }
    },

    // Helper methods
    getLogoById: (logoId) => {
        return get().logos[logoId] || null;
    },

    hasLogo: (logoId) => {
        return !!get().logos[logoId];
    },

    getLogosCount: () => {
        return Object.keys(get().logos).length;
    },
}));

export default useLogosStore;
