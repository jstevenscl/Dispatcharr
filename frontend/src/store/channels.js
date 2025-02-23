// src/stores/channelsStore.js

import { create } from 'zustand';
import api from '../api'; // Your API helper that manages token & requests

const useChannelsStore = create((set) => ({
  channels: [],
  channelGroups: [],
  isLoading: false,
  error: null,

  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const channels = await api.getChannels();
      set({ channels: channels, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      set({ error: 'Failed to load channels.', isLoading: false });
    }
  },

  fetchChannelGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const channelGroups = await api.getChannelGroups();
      set({ channelGroups: channelGroups, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch channel groups:', error);
      set({ error: 'Failed to load channel groups.', isLoading: false });
    }
  },

  addChannel: (newChannel) => set((state) => ({
    channels: [...state.channels, newChannel],
  })),

  removeChannels: (channelIds) => set((state) => ({
    channels: state.channels.filter((channel) => !channelIds.includes(channel.id)),
  })),
}));

export default useChannelsStore;
