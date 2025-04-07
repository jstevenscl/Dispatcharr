import { create } from 'zustand';
import api from '../api';
import { notifications } from '@mantine/notifications';

const defaultProfiles = { 0: { id: '0', name: 'All', channels: [] } };

const useChannelsStore = create((set, get) => ({
  channels: [],
  channelsByUUID: {},
  channelGroups: {},
  profiles: {},
  selectedProfileId: '0',
  selectedProfileChannels: [],
  channelsPageSelection: [],
  stats: {},
  activeChannels: {},
  activeClients: {},
  logos: {},
  recordings: [],
  isLoading: false,
  error: null,

  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const channels = await api.getChannels();
      const channelsByUUID = {};
      const channelsByID = channels.reduce((acc, channel) => {
        acc[channel.id] = channel;
        channelsByUUID[channel.uuid] = channel.id;
        return acc;
      }, {});
      set({
        channels: channelsByID,
        channelsByUUID,
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
      set({
        channelGroups: channelGroups.reduce((acc, group) => {
          acc[group.id] = group;
          return acc;
        }, {}),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch channel groups:', error);
      set({ error: 'Failed to load channel groups.', isLoading: false });
    }
  },

  fetchChannelProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const profiles = await api.getChannelProfiles();
      set({
        profiles: profiles.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, defaultProfiles),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch channel profiles:', error);
      set({ error: 'Failed to load channel profiles.', isLoading: false });
    }
  },

  addChannel: (newChannel) => {
    get().fetchChannelProfiles();
    set((state) => {
      const profiles = { ...state.profiles };
      Object.values(profiles).forEach((item) => {
        item.channels.push({
          id: newChannel.id,
          enabled: true,
        });
      });

      return {
        channels: {
          ...state.channels,
          [newChannel.id]: newChannel,
        },
        channelsByUUID: {
          ...state.channelsByUUID,
          [newChannel.uuid]: newChannel.id,
        },
        profiles,
        selectedProfile: profiles[state.selectedProfileId],
        selectedProfileChannels:
          state.selectedProfileId == '0'
            ? []
            : profiles[state.selectedProfileId].channels,
      };
    });
  },

  addChannels: (newChannels) =>
    set((state) => {
      const channelsByUUID = {};
      const logos = {};
      const channelsByID = newChannels.reduce((acc, channel) => {
        acc[channel.id] = channel;
        channelsByUUID[channel.uuid] = channel.id;
        if (channel.logo) {
          logos[channel.logo.id] = channel.logo;
        }
        return acc;
      }, {});
      const profileChannels = newChannels.map((channel) => ({
        id: channel.id,
        enabled: true,
      }));
      const profiles = { ...state.profiles };
      Object.values(profiles).forEach((item) => {
        item.channels.concat(profileChannels); // Append a new channel object
      });

      return {
        channels: {
          ...state.channels,
          ...channelsByID,
        },
        channelsByUUID: {
          ...state.channelsByUUID,
          ...channelsByUUID,
        },
        logos: {
          ...state.logos,
          ...logos,
        },
        profiles,
        selectedProfile: profiles[state.selectedProfileId],
        selectedProfileChannels: profiles[state.selectedProfileId].channels,
      };
    }),

  updateChannel: (channel) =>
    set((state) => ({
      channels: {
        ...state.channels,
        [channel.id]: channel,
      },
      channelsByUUID: {
        ...state.channelsByUUID,
        [channel.uuid]: channel.id,
      },
    })),

  removeChannels: (channelIds) => {
    set((state) => {
      const updatedChannels = { ...state.channels };
      const channelsByUUID = { ...state.channelsByUUID };
      for (const id of channelIds) {
        delete updatedChannels[id];

        for (const uuid in channelsByUUID) {
          if (channelsByUUID[uuid] == id) {
            delete channelsByUUID[uuid];
            break;
          }
        }
      }

      return { channels: updatedChannels, channelsByUUID };
    });
  },

  addChannelGroup: (newChannelGroup) =>
    set((state) => ({
      channelGroups: {
        ...state.channelGroups,
        [newChannelGroup.id]: newChannelGroup,
      },
    })),

  updateChannelGroup: (channelGroup) =>
    set((state) => ({
      ...state.channelGroups,
      [channelGroup.id]: channelGroup,
    })),

  fetchLogos: async () => {
    set({ isLoading: true, error: null });
    try {
      const logos = await api.getLogos();
      set({
        logos: logos.reduce((acc, logo) => {
          acc[logo.id] = {
            ...logo,
            url: logo.url.replace(/^\/data/, ''),
          };
          return acc;
        }, {}),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch logos:', error);
      set({ error: 'Failed to load logos.', isLoading: false });
    }
  },

  addLogo: (newLogo) =>
    set((state) => ({
      logos: {
        ...state.logos,
        [newLogo.id]: {
          ...newLogo,
          url: newLogo.url.replace(/^\/data/, ''),
        },
      },
    })),

  addProfile: (profile) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile.id]: profile,
      },
    })),

  updateProfile: (profile) =>
    set((state) => ({
      channels: {
        ...state.profiles,
        [profile.id]: profile,
      },
    })),

  removeProfiles: (profileIds) =>
    set((state) => {
      const updatedProfiles = { ...state.profiles };
      for (const id of profileIds) {
        delete updatedProfiles[id];
      }

      let additionalUpdates = {};
      if (profileIds.includes(state.selectedProfileId)) {
        additionalUpdates = {
          selectedProfileId: '0',
          selectedProfileChannels: [],
          selectedProfile: {},
        };
      }

      return {
        profiles: updatedProfiles,
        selectedProfileId: profileIds.includes(state.selectedProfileId)
          ? '0'
          : state.selectedProfileId,
        ...additionalUpdates,
      };
    }),

  updateProfileChannels: (channelIds, profileId, enabled) =>
    set((state) => {
      // Get the specific profile
      const profile = state.profiles[profileId];
      if (!profile) return state; // Profile doesn't exist, no update needed

      // Efficiently update only the specific channel
      return {
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            channels: profile.channels.map((channel) =>
              channelIds.includes(channel.id)
                ? { ...channel, enabled } // Update enabled flag
                : channel
            ),
          },
        },
        selectedProfileChannels: state.selectedProfileChannels.map(
          (channel) => ({
            id: channel.id,
            enabled: channelIds.includes(channel.id)
              ? enabled
              : channel.enabled,
          })
        ),
      };
    }),

  setChannelsPageSelection: (channelsPageSelection) =>
    set((state) => ({ channelsPageSelection })),

  setSelectedProfileId: (id) =>
    set((state) => ({
      selectedProfileId: id,
      selectedProfileChannels: id == '0' ? [] : state.profiles[id].channels,
    })),

  setChannelStats: (stats) => {
    return set((state) => {
      const {
        channels,
        stats: currentStats,
        activeChannels: oldChannels,
        activeClients: oldClients,
        channelsByUUID,
      } = state;

      const newClients = {};
      const newChannels = stats.channels.reduce((acc, ch) => {
        acc[ch.channel_id] = ch;

        if (currentStats.channels) {
          if (oldChannels[ch.channel_id] === undefined) {
            notifications.show({
              title: 'New channel streaming',
              message: channels[channelsByUUID[ch.channel_id]].name,
              color: 'blue.5',
            });
          }
        }

        ch.clients.map((client) => {
          newClients[client.client_id] = client;
          // This check prevents the notifications if streams are active on page load
          if (currentStats.channels) {
            if (oldClients[client.client_id] === undefined) {
              notifications.show({
                title: 'New client started streaming',
                message: `Client streaming from ${client.ip_address}`,
                color: 'blue.5',
              });
            }
          }
        });

        return acc;
      }, {});

      // This check prevents the notifications if streams are active on page load
      if (currentStats.channels) {
        for (const uuid in oldChannels) {
          if (newChannels[uuid] === undefined) {
            notifications.show({
              title: 'Channel streaming stopped',
              message: channels[channelsByUUID[uuid]].name,
              color: 'blue.5',
            });
          }
        }

        for (const clientId in oldClients) {
          if (newClients[clientId] === undefined) {
            notifications.show({
              title: 'Client stopped streaming',
              message: `Client stopped streaming from ${oldClients[clientId].ip_address}`,
              color: 'blue.5',
            });
          }
        }
      }

      return {
        stats,
        activeChannels: newChannels,
        activeClients: newClients,
      };
    });
  },

  fetchRecordings: async () => {
    set({ isLoading: true, error: null });
    try {
      set({
        recordings: await api.getRecordings(),
      });
    } catch (error) {
      console.error('Failed to fetch recordings:', error);
      set({ error: 'Failed to load recordings.', isLoading: false });
    }
  },
}));

export default useChannelsStore;
