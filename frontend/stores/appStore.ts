import { create } from 'zustand';
import { Role, SystemStatus, SystemMetrics, FileNode } from '../types';
import * as mindshardService from '../services/mindshardService';
import { useNotify } from '../hooks/useNotify';

interface AppState {
  apiKey: string;
  setApiKey: (key: string) => void;

  roles: Role[];
  activeRole: Role | null;
  setRoles: (roles: Role[]) => void;
  setActiveRole: (role: Role | null) => void;

  systemStatus: SystemStatus;
  setSystemStatus: (status: SystemStatus) => void;
  
  metrics: SystemMetrics | null;
  setMetrics: (metrics: SystemMetrics | null) => void;

  projectRoot: string | null;
  setProjectRoot: (path: string | null) => void;

  fileTree: FileNode | null;
  setFileTree: (tree: FileNode | null) => void;
  refreshFileTree: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  apiKey: '',
  setApiKey: (key) => set({ apiKey: key }),

  roles: [],
  activeRole: null,
  setRoles: (roles) => set({ roles }),
  setActiveRole: (role) => set({ activeRole: role }),

  systemStatus: { model_status: 'unloaded', retriever_status: 'inactive' },
  setSystemStatus: (status) => set({ systemStatus: status }),
  
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),

  projectRoot: null,
  setProjectRoot: (path) => {
    const notify = useNotify.getState().success;
    set({ projectRoot: path });
    if(path){
      notify(`Project root set to: ${path}`);
    }
  },

  fileTree: null,
  setFileTree: (tree) => set({ fileTree: tree }),
  refreshFileTree: async () => {
    try {
      const tree = await mindshardService.getFileTree(get().projectRoot);
      set({ fileTree: tree });
    } catch (error) {
      const notify = useNotify.getState().error;
      notify('Failed to refresh project file tree.');
      console.error(error);
    }
  },
}));
