import { create } from 'zustand';

const useUpdatePromptStore = create((set) => ({
  open: false,
  version: null,
  url: null,
  openWith: (version, url) => set({ open: true, version, url }),
  close: () => set({ open: false }),
}));

export default useUpdatePromptStore;

