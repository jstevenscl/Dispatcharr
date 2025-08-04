// frontend/src/store/useVideoStore.js
import { create } from 'zustand';

/**
 * Global store to track whether a floating video is visible and which URL is playing.
 */
const useVideoStore = create((set) => ({
  isVisible: false,
  streamUrl: null,
  contentType: 'live', // 'live' for MPEG-TS streams, 'vod' for MP4/MKV files

  showVideo: (url, type = 'live') =>
    set({
      isVisible: true,
      streamUrl: url,
      contentType: type,
    }),

  hideVideo: () =>
    set({
      isVisible: false,
      streamUrl: null,
      contentType: 'live',
    }),
}));

export default useVideoStore;
