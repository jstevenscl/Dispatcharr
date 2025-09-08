import { create } from 'zustand';
import API from '../api';

// Categories we support gating notifications for
export const DEFAULT_CATEGORIES = {
  channel_stream_started: true,
  channel_stream_stopped: true,
  client_stream_started: true,
  client_stream_stopped: true,
  epg_events: true, // group flag for EPG related notifications
};

const defaultPrefs = {
  notifications: {
    updates: {
      policy: 'on_login', // on_login | daily | weekly | never
      ignored_versions: [],
      last_shown_at: null,
    },
    categories: { ...DEFAULT_CATEGORIES },
  },
};

const normalize = (prefs) => {
  const merged = { ...defaultPrefs.notifications, ...(prefs?.notifications || {}) };
  merged.categories = { ...DEFAULT_CATEGORIES, ...(merged.categories || {}) };
  if (!Array.isArray(merged.updates?.ignored_versions)) {
    merged.updates.ignored_versions = merged.updates?.ignored_versions || [];
  }
  return { notifications: merged };
};

const useNotificationsStore = create((set, get) => ({
  prefs: defaultPrefs,

  loadFromUser: (user) => {
    const incoming = user?.custom_properties || {};
    const normalized = normalize(incoming);
    set({ prefs: normalized });
  },

  refreshFromServer: async () => {
    const prefs = await API.getMyPreferences();
    const normalized = normalize(prefs || {});
    set({ prefs: normalized });
  },

  isEnabled: (categoryKey) => {
    const categories = get().prefs.notifications.categories || {};
    return categories[categoryKey] !== false;
  },

  setCategory: (categoryKey, value) => {
    set((state) => ({
      prefs: {
        ...state.prefs,
        notifications: {
          ...state.prefs.notifications,
          categories: {
            ...state.prefs.notifications.categories,
            [categoryKey]: !!value,
          },
        },
      },
    }));
  },

  setUpdatePolicy: (policy) => {
    set((state) => ({
      prefs: {
        ...state.prefs,
        notifications: {
          ...state.prefs.notifications,
          updates: {
            ...state.prefs.notifications.updates,
            policy,
          },
        },
      },
    }));
  },

  addIgnoredVersion: (version) => {
    set((state) => {
      const list = new Set(state.prefs.notifications.updates.ignored_versions || []);
      if (version) list.add(version);
      return {
        prefs: {
          ...state.prefs,
          notifications: {
            ...state.prefs.notifications,
            updates: {
              ...state.prefs.notifications.updates,
              ignored_versions: Array.from(list),
            },
          },
        },
      };
    });
  },

  setLastShownNow: () => {
    set((state) => ({
      prefs: {
        ...state.prefs,
        notifications: {
          ...state.prefs.notifications,
          updates: {
            ...state.prefs.notifications.updates,
            last_shown_at: new Date().toISOString(),
          },
        },
      },
    }));
  },

  save: async () => {
    await API.updateMyPreferences(get().prefs);
  },
}));

export default useNotificationsStore;
