import { create } from 'zustand';
import api from '../api'; // Your API helper that manages token & requests

const useStreamsStore = create((set) => ({
  streams: [],
  isLoading: false,
  error: null,

  fetchStreams: async () => {
    set({ isLoading: true, error: null });
    try {
      const streams = await api.getStreams();
      set({ streams: streams, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch streams:', error);
      set({ error: 'Failed to load streams.', isLoading: false });
    }
  },
}));

export default useStreamsStore;
