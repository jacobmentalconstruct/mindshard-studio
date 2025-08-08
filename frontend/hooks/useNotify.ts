import { toast } from 'react-hot-toast';
import { create } from 'zustand';

interface NotifyStore {
  success: (message: string) => void;
  error: (message: string) => void;
  loading: (message: string) => string;
  dismiss: (id?: string) => void;
  custom: (jsx: React.ReactNode) => void;
}

// Use a store to avoid re-renders when calling notification functions
export const useNotify = create<NotifyStore>(() => ({
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  loading: (message) => toast.loading(message),
  dismiss: (id) => toast.dismiss(id),
  custom: (jsx) => toast(jsx),
}));
