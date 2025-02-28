// frontend/src/store/useVideoStore.js
import { create } from 'zustand';

/**
 * Global store to track whether a floating video is visible and which URL is playing.
 */
const useVideoStore = create((set) => ({
  isVisible: false,
  streamUrl: null,

  showVideo: (url) => set({
    isVisible: true,
    streamUrl: url,
  }),

  hideVideo: () => set({
    isVisible: false,
    streamUrl: null,
  }),
}));

export default useVideoStore;
