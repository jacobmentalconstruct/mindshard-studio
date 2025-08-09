// File: frontend/services/mindshardService.ts

import {
  FileNode,
  KnowledgeBase,
  PromptTemplate,
  Role,
  Scratchpad,
  ContextSelection,
  SystemStatus,
  SystemMetrics,
  Workflow,
  InspectionData,
  MemoryEntry,
  PerformanceKPIs,
  BackendLogEntry,
  OcrOptions,
  Commit,
  CondaEnv,
  ServerStatusResponse,
  TaskList,
  Task,
  // If WorkflowStep exists in your types, keep this import; otherwise remove it.
  WorkflowStep,
} from '../types';

/** Base URL (env-driven; fallback for dev) */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/**
 * Helper to construct standard HTTP headers including API key.
 */
const getHeaders = (apiKey: string): HeadersInit => ({
  'Content-Type': 'application/json',
  // Keeping original header casing to avoid surprises; HTTP headers are case-insensitive.
  'X-API-Key': apiKey,
});

/**
 * Robust fetch wrapper with JSON parsing and error normalization.
 */
const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit,
  apiKey: string
): Promise<T> => {
  const headers = { ...getHeaders(apiKey), ...(options.headers || {}) };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Try to parse JSON error; fall back to status text
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        /* noop */
      }
      const detail =
        (errorData && (errorData.detail || errorData.message)) ||
        response.statusText ||
        `HTTP error! status: ${response.status}`;
      const err = new Error(detail);
      (err as any).status = response.status;
      (err as any).payload = errorData;
      throw err;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error);
    throw error;
  }
};

// ============================================================================
// System & Monitoring
// ============================================================================

export const getSystemMetrics = (apiKey: string): Promise<SystemMetrics> =>
  apiFetch('/system/metrics', { method: 'GET' }, apiKey);

export const getPerformanceKpis = (apiKey: string): Promise<PerformanceKPIs> =>
  apiFetch('/system/kpis', { method: 'GET' }, apiKey);

export const getBackendLogs = (apiKey: string): Promise<BackendLogEntry[]> =>
  apiFetch('/system/logs', { method: 'GET' }, apiKey);

export const getSystemStatus = async (
  apiKey: string
): Promise<SystemStatus> => {
  const backendStatus = await apiFetch<any>(
    '/system/status',
    { method: 'GET' },
    apiKey
  );

  // Preserve original transformation shape
  const frontendStatus: SystemStatus = {
    model_status: backendStatus.llm.status === 'loaded' ? 'loaded' : 'unloaded',
    retriever_status: backendStatus.digestors.some(
      (d: any) => d.vector_count > 0
    )
      ? 'active'
      : 'inactive',
    active_kb_name:
      backendStatus.digestors.find((d: any) => d.name === 'active_project')
        ?.name || null,
    cognition: {
      stm_buffer_size: backendStatus.memory_layers.working_memory_items,
      stm_buffer_threshold:
        backendStatus.memory_layers.short_term_flush_threshold,
      digestor_status: 'Idle', // Placeholder; can enhance when backend exposes more detail
      loaded_knowledge_bases: backendStatus.digestors.map((d: any) => d.name),
    },
  };
  return frontendStatus;
};

// ============================================================================
// Core AI Orchestration
// ============================================================================

export const streamCognitiveLogs = async (
  apiKey: string,
  prompt: string,
  inferenceParams: Record<string, any>,
  contextSelection: ContextSelection,
  onScratchpad: (scratchpad: Scratchpad) => void,
  onEnd: () => void,
  onError: (error: Error) => void
): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/orchestrator/execute`, {
      method: 'POST',
      headers: { ...getHeaders(apiKey), Accept: 'text/event-stream' },
      body: JSON.stringify({
        prompt,
        inference_params: inferenceParams,           // <-- NEW
        context_selection: contextSelection,         // <-- NEW
      }),
    });

    if (!response.ok || !response.body) {
      let errorData: any = null;
      try { errorData = await response.json(); } catch { /* noop */ }
      const detail =
        (errorData && (errorData.detail || errorData.message)) ||
        response.statusText ||
        `HTTP error! status: ${response.status}`;
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr) {
            try {
              const scratchpad = JSON.parse(jsonStr) as Scratchpad;
              onScratchpad(scratchpad);
            } catch (e) {
              console.error('Failed to parse SSE data chunk:', jsonStr, e);
            }
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error('An unknown streaming error occurred'));
  } finally {
    onEnd();
  }
};


    if (!response.ok || !response.body) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        /* noop */
      }
      const detail =
        (errorData && (errorData.detail || errorData.message)) ||
        response.statusText ||
        `HTTP error! status: ${response.status}`;
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the (possibly incomplete) last line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr) {
            try {
              const scratchpad = JSON.parse(jsonStr) as Scratchpad;
              onScratchpad(scratchpad);
            } catch (e) {
              console.error('Failed to parse SSE data chunk:', jsonStr, e);
            }
          }
        }
      }
    }
  } catch (error) {
    onError(
      error instanceof Error
        ? error
        : new Error('An unknown streaming error occurred')
    );
  } finally {
    onEnd();
  }
};

export const infer = (
  apiKey: string,
  data: { prompt: string; use_rag: boolean; system_prompt?: string }
): Promise<{ completion: string; inspection: InspectionData }> =>
  apiFetch('/orchestrator/infer', { method: 'POST', body: JSON.stringify(data) }, apiKey);

// ============================================================================
// Model & Project Management (existing endpoints preserved)
// ============================================================================

export const listModels = (apiKey: string, modelFolder: string): Promise<string> =>
  apiFetch(
    '/tools/project/list-models',
    { method: 'POST', body: JSON.stringify({ path: modelFolder }) },
    apiKey
  );

export const getFileTree = (apiKey: string, path: string = '.'): Promise<FileNode> =>
  apiFetch(
    '/tools/project/get-file-tree',
    { method: 'POST', body: JSON.stringify({ path }) },
    apiKey
  );

export const loadModel = (apiKey: string, model_path: string): Promise<any> =>
  apiFetch(
    '/system/llm/load',
    { method: 'POST', body: JSON.stringify({ model_path }) },
    apiKey
  );

export const unloadModel = (apiKey: string): Promise<any> =>
  apiFetch('/system/llm/unload', { method: 'POST' }, apiKey);

// ============================================================================
// NEW: Decoupled Model Ops (additive; does not replace existing load/unload)
// ============================================================================

export type ModelStatus = {
  status: 'loaded' | 'not_loaded' | 'loading';
  model_path: string;
  n_gpu_layers?: number | null;
  context_window?: number | null;
  name?: string | null;
};

export const getModelStatus = (apiKey: string): Promise<ModelStatus> =>
  apiFetch('/system/model/status', { method: 'GET' }, apiKey);

export const reloadModel = (
  apiKey: string,
  params?: { model_path?: string; gpu_layers?: number; context_window?: number }
): Promise<ModelStatus> =>
  apiFetch(
    '/system/model/reload',
    { method: 'POST', body: JSON.stringify(params ?? {}) },
    apiKey
  );

// ============================================================================
// Knowledge Base & Ingestion
// ============================================================================
export const activateKnowledgeBase = (
  apiKey: string,
  id: string
): Promise<KnowledgeBase[]> =>
  apiFetch(`/knowledge/bases/${id}/activate`, { method: 'POST' }, apiKey);


// CHANGED: returns array
export const getKnowledgeBases = (apiKey: string): Promise<KnowledgeBase[]> =>
  apiFetch('/knowledge/bases', { method: 'GET' }, apiKey);

export const createKnowledgeBase = (apiKey: string, name: string): Promise<KnowledgeBase> =>
  apiFetch('/knowledge/bases', { method: 'POST', body: JSON.stringify({ name }) }, apiKey);

export const deleteKnowledgeBase = (apiKey: string, id: string): Promise<void> =>
  apiFetch(`/knowledge/bases/${id}`, { method: 'DELETE' }, apiKey);

export const ingestUrl = (
  apiKey: string,
  url: string,
  kb_id: string
): Promise<{ status: string; url: string }> =>
  apiFetch(
    '/knowledge/ingest-url',
    { method: 'POST', body: JSON.stringify({ url, kb_id }) },
    apiKey
  );

export const ingestFile = async (
  apiKey: string,
  file: File,
  kb_id: string
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_id', kb_id);

  const response = await fetch(`${API_BASE_URL}/knowledge/ingest-file`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey }, // FormData sets its own Content-Type
    body: formData,
  });

  if (!response.ok) {
    let detail = 'Failed to ingest file';
    try {
      const err = await response.json();
      detail = err?.detail || detail;
    } catch {
      /* noop */
    }
    throw new Error(detail);
  }
  return response.json();
};

// CHANGED: files is an array + correct spread of options
export const ingestFilesWithOcr = async (
  apiKey: string,
  files: Array<{ name: string; content: string }>,
  kb_id: string,
  options: OcrOptions & { ocr: boolean }
): Promise<any> => {
  const body = { files, kb_id, ...options };
  return apiFetch(
    '/knowledge/ingest-files-ocr',
    { method: 'POST', body: JSON.stringify(body) },
    apiKey
  );
};

export const crawlAndDigestSite = (
  apiKey: string,
  baseUrl: string,
  kb_id: string
): Promise<{ pages_crawled: number }> =>
  apiFetch(
    '/knowledge/crawl-and-digest',
    { method: 'POST', body: JSON.stringify({ base_url: baseUrl, kb_id }) },
    apiKey
  );

/** NEW: Project file digestion (paths + content sent to backend) */
export async function digestProjectFiles(
  apiKey: string,
  files: Array<{ path: string; content: string }>,
  kb_id: string
): Promise<{ ingested: number; skipped: number }> {
  return apiFetch(
    '/project/digest',
    { method: 'POST', body: JSON.stringify({ files, kb_id }) },
    apiKey
  );
}

// ============================================================================
// Memory Management
// ============================================================================

export const getScratchpad = (apiKey: string): Promise<MemoryEntry> =>
  apiFetch('/memory/scratch', { method: 'GET' }, apiKey);

export const getLongTermMemory = (apiKey: string): Promise<MemoryEntry> =>
  apiFetch('/memory/long_term', { method: 'GET' }, apiKey);

export const addToScratchpad = (
  apiKey: string,
  entry: { content: string; type?: string }
): Promise<MemoryEntry> =>
  apiFetch(
    '/memory/scratch',
    {
      method: 'POST',
      body: JSON.stringify({ content: entry.content, type: entry.type || 'manual' }),
    },
    apiKey
  );

// ============================================================================
// File System & Project Tools
// ============================================================================

export const getFileContent = (
  apiKey: string,
  path: string
): Promise<{ content: string }> =>
  apiFetch(
    '/tools/project/get-file-content',
    { method: 'POST', body: JSON.stringify({ path }) },
    apiKey
  );

export const saveFileContent = (
  apiKey: string,
  path: string,
  content: string
): Promise<{ success: boolean }> =>
  apiFetch(
    '/tools/project/save-file-content',
    { method: 'POST', body: JSON.stringify({ path, content }) },
    apiKey
  );

export const runOcr = (
  apiKey: string,
  path: string,
  options: OcrOptions
): Promise<{ text: string }> =>
  apiFetch(
    '/tools/project/run-ocr',
    { method: 'POST', body: JSON.stringify({ path, ...options }) },
    apiKey
  );

// ============================================================================
// Prompt, Role, Workflow, Task, Versioning Management (CRUD)
// ============================================================================

// Roles
export const listRoles = (apiKey: string): Promise<Role> =>
  apiFetch('/roles', { method: 'GET' }, apiKey);

export const createRole = (
  apiKey: string,
  roleData: Omit<Role, 'id'>
): Promise<Role> =>
  apiFetch('/roles', { method: 'POST', body: JSON.stringify(roleData) }, apiKey);

export const updateRole = (apiKey: string, roleData: Role): Promise<Role> =>
  apiFetch(`/roles/${roleData.id}`, { method: 'PUT', body: JSON.stringify(roleData) }, apiKey);

export const deleteRole = (apiKey: string, id: string): Promise<void> =>
  apiFetch(`/roles/${id}`, { method: 'DELETE' }, apiKey);

// Workflows
export const getAllWorkflows = (apiKey: string): Promise<Workflow> =>
  apiFetch('/workflows', { method: 'GET' }, apiKey);

export const getWorkflowById = (apiKey: string, id: string): Promise<Workflow> =>
  apiFetch(`/workflows/${id}`, { method: 'GET' }, apiKey);

export const createWorkflow = (
  apiKey: string,
  workflowData: Omit<Workflow, 'id' | 'steps'> & { steps: Omit<WorkflowStep, 'id'> }
): Promise<Workflow> =>
  apiFetch('/workflows', { method: 'POST', body: JSON.stringify(workflowData) }, apiKey);

export const updateWorkflow = (apiKey: string, workflow: Workflow): Promise<Workflow> =>
  apiFetch(`/workflows/${workflow.id}`, { method: 'PUT', body: JSON.stringify(workflow) }, apiKey);

export const deleteWorkflow = (apiKey: string, id: string): Promise<void> =>
  apiFetch(`/workflows/${id}`, { method: 'DELETE' }, apiKey);

// Prompts
export const listPromptTemplates = (apiKey: string): Promise<PromptTemplate> =>
  apiFetch('/prompts', { method: 'GET' }, apiKey);

export const createPromptTemplate = (
  apiKey: string,
  data: Omit<PromptTemplate, 'id'>
): Promise<PromptTemplate> =>
  apiFetch('/prompts', { method: 'POST', body: JSON.stringify(data) }, apiKey);

export const updatePromptTemplate = (
  apiKey: string,
  slug: string,
  data: { content: string; author: string }
): Promise<PromptTemplate> =>
  apiFetch(`/prompts/${slug}/versions`, { method: 'POST', body: JSON.stringify(data) }, apiKey);

export const deletePromptTemplate = (
  apiKey: string,
  slug: string
): Promise<void> =>
  apiFetch(`/prompts/${slug}`, { method: 'DELETE' }, apiKey);

// Tasks
export const getAllTaskLists = (apiKey: string): Promise<TaskList> =>
  apiFetch('/tasks', { method: 'GET' }, apiKey);

export const createTaskList = (apiKey: string, name: string): Promise<TaskList> =>
  apiFetch('/tasks', { method: 'POST', body: JSON.stringify({ name }) }, apiKey);

export const addTask = (apiKey: string, listId: string, text: string): Promise<Task> => {
  const formData = new FormData();
  formData.append('task_text', text);
  return fetch(`${API_BASE_URL}/tasks/${listId}/tasks`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey }, // FormData handles its own Content-Type boundary
    body: formData,
  }).then((res) => res.json());
};
// Additional task functions (update, delete, approve, etc.) would follow a similar pattern.

// Versioning
export const getCommits = (apiKey: string): Promise<Commit> =>
  apiFetch('/versioning/commits', { method: 'GET' }, apiKey);

export const createSnapshot = (apiKey: string, message: string): Promise<Commit> =>
  apiFetch('/versioning/snapshots', { method: 'POST', body: JSON.stringify({ message }) }, apiKey);

export const revertToCommit = (apiKey: string, sha: string): Promise<{ status: string }> =>
  apiFetch('/versioning/revert', { method: 'POST', body: JSON.stringify({ sha }) }, apiKey);

// Stubs
export const commitSingleScratchpadEntry = (
  apiKey: string,
  entryId: string
): Promise<{ success: boolean }> =>
  apiFetch(`/memory/scratch/${entryId}/commit`, { method: 'POST' }, apiKey).then(() => ({ success: true }));

export const deleteScratchpadEntry = (
  apiKey: string,
  entryId: string
): Promise<{ success: boolean }> =>
  apiFetch(`/memory/scratch/${entryId}`, { method: 'DELETE' }, apiKey).then(() => ({ success: true }));

export const updateLongTermEntry = (
  apiKey: string,
  entryId: string,
  updates: Partial<MemoryEntry>
): Promise<MemoryEntry> =>
  apiFetch(`/memory/long_term/${entryId}`, { method: 'PATCH', body: JSON.stringify(updates) }, apiKey);

export const deleteLongTermEntry = (
  apiKey: string,
  entryId: string
): Promise<{ success: boolean }> =>
  apiFetch(`/memory/long_term/${entryId}`, { method: 'DELETE' }, apiKey).then(() => ({ success: true }));

export const injectContextIntoTask = (
  apiKey: string,
  taskId: string,
  context: string
): Promise<void> =>
  apiFetch(`/tasks/inject-context`, { method: 'POST', body: JSON.stringify({ task_id: taskId, context }) }, apiKey);
