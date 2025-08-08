import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as mindshardService from '../services/mindshardService';
import { useAppStore } from '../stores/appStore';
import { useNotify } from './useNotify';

export const useSystemStatusQuery = () => {
  const apiKey = useAppStore(state => state.apiKey);
  return useQuery({
    queryKey: ['systemStatus', apiKey],
    queryFn: () => mindshardService.getSystemStatus(apiKey),
    enabled: !!apiKey,
    refetchInterval: 5000,
  });
};

export const useSystemMetricsQuery = () => {
    const apiKey = useAppStore(state => state.apiKey);
    return useQuery({
        queryKey: ['systemMetrics', apiKey],
        queryFn: () => mindshardService.getSystemMetrics(apiKey),
        enabled: !!apiKey,
        refetchInterval: 2000,
    });
};

export const useModelsQuery = (modelFolder: string) => {
  const apiKey = useAppStore(state => state.apiKey);
  return useQuery({
    queryKey: ['models', apiKey, modelFolder],
    queryFn: () => mindshardService.listModels(apiKey, modelFolder),
    enabled: !!apiKey && !!modelFolder,
  });
};

export const useKnowledgeBasesQuery = () => {
    const apiKey = useAppStore(state => state.apiKey);
    return useQuery({
        queryKey: ['knowledgeBases', apiKey],
        queryFn: () => mindshardService.getKnowledgeBases(apiKey),
        enabled: !!apiKey,
    });
};

export const useRolesQuery = () => {
    const apiKey = useAppStore(state => state.apiKey);
    return useQuery({
        queryKey: ['roles', apiKey],
        queryFn: () => mindshardService.listRoles(apiKey),
        enabled: !!apiKey,
    });
};


export const usePromptTemplatesQuery = () => {
    const apiKey = useAppStore(state => state.apiKey);
    return useQuery({
        queryKey: ['promptTemplates', apiKey],
        queryFn: () => mindshardService.listPromptTemplates(apiKey),
        enabled: !!apiKey,
    });
};

export const useModelActionMutation = () => {
    const queryClient = useQueryClient();
    const notify = useNotify.getState();
    const apiKey = useAppStore(state => state.apiKey);

    return useMutation({
        mutationFn: async ({ action, model }: { action: 'load' | 'unload'; model?: string }) => {
            if (action === 'load' && model) {
                return mindshardService.loadModel(apiKey, model);
            }
            return mindshardService.unloadModel(apiKey);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['systemStatus'] });
            notify.success(`Model ${variables.action === 'load' ? `"${variables.model}"` : ''} ${variables.action}ed successfully!`);
        },
        onError: (error: Error, variables) => {
            notify.error(`Failed to ${variables.action} model: ${error.message}`);
        },
    });
};
