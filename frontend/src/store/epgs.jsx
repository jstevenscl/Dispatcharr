import { create } from 'zustand';
import api from '../api';

const useEPGsStore = create((set) => ({
  epgs: [],
  tvgs: [],
  isLoading: false,
  error: null,

  fetchEPGs: async () => {
    set({ isLoading: true, error: null });
    try {
      const epgs = await api.getEPGs();
      set({ epgs: epgs, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch epgs:', error);
      set({ error: 'Failed to load epgs.', isLoading: false });
    }
  },

  fetchEPGData: async () => {
    set({ isLoading: true, error: null });
    try {
      const tvgs = await api.getEPGData();
      set({ tvgs: tvgs, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch tvgs:', error);
      set({ error: 'Failed to load tvgs.', isLoading: false });
    }
  },

  addEPG: (newPlaylist) =>
    set((state) => ({
      epgs: [...state.epgs, newPlaylist],
    })),

  removeEPGs: (epgIds) =>
    set((state) => ({
      epgs: state.epgs.filter((epg) => !epgIds.includes(epg.id)),
    })),
}));

export default useEPGsStore;
