// File: frontend/stores/appStore.ts
import { create } from 'zustand';
import { Role, SystemStatus, SystemMetrics, FileNode } from '../types';
import * as mindshardService from '../services/mindshardService';
import { useNotify } from '../hooks/useNotify';

// Surface the DTO from the service to keep a single source of truth
export type ModelStatusDto = Awaited<ReturnType<typeof mindshardService.getModelStatus>>;

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
  refreshFileTree: (pathOverride?: string | null) => Promise<void>;

  // Model controls
  modelStatus: ModelStatusDto | null;
  fetchModelStatus: () => Promise<void>;
  reloadModel: (params?: { model_path?: string; gpu_layers?: number; context_window?: number }) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ===== base state =====
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
    if (path) notify(`Project root set to: ${path}`);
  },

  fileTree: null,
  setFileTree: (tree) => set({ fileTree: tree }),
  refreshFileTree: async (pathOverride) => {
    const notifyErr = useNotify.getState().error;
    try {
      const { apiKey, projectRoot } = get();
      if (!apiKey) {
        notifyErr('API key is required to fetch the project tree.');
        return;
      }
      const path = pathOverride ?? projectRoot ?? '.';
      const tree = await mindshardService.getFileTree(apiKey, path);
      set({ fileTree: tree });
    } catch (error) {
      notifyErr('Failed to refresh project file tree.');
      console.error(error);
    }
  },

  // ===== model slice =====
  modelStatus: null,

  fetchModelStatus: async () => {
    const { apiKey } = get();
    if (!apiKey) return;
    const status = await mindshardService.getModelStatus(apiKey);
    set({ modelStatus: status });
  },

  reloadModel: async (params) => {
    const { apiKey } = get();
    if (!apiKey) {
      useNotify.getState().error('API key is required to reload the model.');
      return;
    }
    const status = await mindshardService.reloadModel(apiKey, params);
    set({ modelStatus: status });
    useNotify.getState().success(
      status.status === 'loaded'
        ? `Model loaded: ${status.name ?? status.model_path}`
        : `Model status: ${status.status}`
    );
  },
}));
