import { create } from 'zustand';
import api from '../api'; // Your API helper that manages token & requests

const usePlaylistsStore = create((set) => ({
  playlists: [],
  isLoading: false,
  error: null,

  fetchPlaylists: async () => {
    set({ isLoading: true, error: null });
    try {
      const playlists = await api.getPlaylists();
      set({ playlists: playlists, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch playlists:', error);
      set({ error: 'Failed to load playlists.', isLoading: false });
    }
  },

  addPlaylist: (newPlaylist) => set((state) => ({
    playlists: [...state.playlists, newPlaylist],
  })),

  updatePlaylist: (playlist) => set((state) => ({
    playlists: state.playlists.map(pl => pl.id === playlist.id ? playlist : pl),
  })),

  removePlaylists: (playlistIds) => set((state) => ({
    playlists: state.playlists.filter((playlist) => !playlistIds.includes(playlist.id)),
  })),
}));

export default usePlaylistsStore;
