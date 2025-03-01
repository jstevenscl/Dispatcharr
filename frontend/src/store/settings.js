import { create } from 'zustand';
import api from '../api';

const useSettingsStore = create((set) => ({
  settings: {},
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await api.getSettings();
      set({
        settings: settings.reduce((acc, setting) => {
          acc[setting.key] = setting;
          return acc;
        }, {}),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      set({ error: 'Failed to load settings.', isLoading: false });
    }
  },

  updateSetting: (setting) =>
    set((state) => ({
      settings: { ...state.settings, [setting.key]: setting },
    })),
}));

export default useSettingsStore;
