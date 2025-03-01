import { create } from 'zustand';
import api from '../api';

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

  addChannel: (newChannel) =>
    set((state) => ({
      channels: [...state.channels, newChannel],
    })),

  addChannels: (newChannels) =>
    set((state) => ({
      channels: state.channels.concat(newChannels),
    })),

  updateChannel: (userAgent) =>
    set((state) => ({
      channels: state.channels.map((chan) =>
        chan.id === userAgent.id ? userAgent : chan
      ),
    })),

  removeChannels: (channelIds) =>
    set((state) => ({
      channels: state.channels.filter(
        (channel) => !channelIds.includes(channel.id)
      ),
    })),

  addChannelGroup: (newChannelGroup) =>
    set((state) => ({
      channelGroups: [...state.channelGroups, newChannelGroup],
    })),

  updateChannelGroup: (channelGroup) =>
    set((state) => ({
      channelGroups: state.channelGroups.map((group) =>
        group.id === channelGroup.id ? channelGroup : group
      ),
    })),
}));

export default useChannelsStore;
