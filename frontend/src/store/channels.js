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
      set({
        channels: channels.reduce((acc, channel) => {
          acc[channel.id] = channel;
          return acc;
        }, {}),
        isLoading: false,
      });
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
      channels: {
        ...state.channels,
        [newChannel.id]: newChannel,
      },
    })),

  addChannels: (newChannels) =>
    set((state) => ({
      channels: {
        ...state.channels,
        ...newChannels,
      },
    })),

  updateChannel: (channel) =>
    set((state) => ({
      channels: {
        ...state.channels,
        [channel.id]: channel,
      },
    })),

  removeChannels: (channelIds) =>
    set((state) => {
      const updatedChannels = { ...state.channels };
      for (const id of channelIds) {
        delete updatedChannels[id];
      }

      return { channels: updatedChannels };
    }),

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
