import { create } from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  modalOpen: string | null;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  toggleSidebar: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  modalOpen: null,
  toast: null,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  openModal: (id: string) => set({ modalOpen: id }),
  closeModal: () => set({ modalOpen: null }),
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  clearToast: () => set({ toast: null }),
}));
