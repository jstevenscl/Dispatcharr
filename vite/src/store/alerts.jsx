// frontend/src/store/useAlertStore.js
import { create } from 'zustand';

/**
 * Global store to track whether a floating video is visible and which URL is playing.
 */
const useAlertStore = create((set) => ({
  open: false,
  message: '',
  severity: 'info',

  showAlert: (message, severity = 'info') =>
    set({
      open: true,
      message,
      severity,
    }),

  hideAlert: () => {
    set({ open: false });
  },
}));

export default useAlertStore;
