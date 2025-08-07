// File: src/services/mindshardService.ts (Complete & Fortified with Review)

import { 
    ContextSelection, FileNode, KnowledgeBase, PromptTemplate, Role, Scratchpad, 
    SystemStatus, SystemMetrics, Workflow, WorkflowStep, InspectionData, MemoryEntry, PerformanceKPIs,
    BackendLogEntry, OcrOptions, Commit, CondaEnv, ServerStatusResponse, TaskList, Task
} from '../types';

const API_BASE_URL = 'http://localhost:8000';

/**
 * Helper function to construct standard HTTP headers including Authorization.
 * @param apiKey The API key for authentication.
 * @param acceptStream If true, sets the 'Accept' header for Server-Sent Events.
 * @returns HeadersInit object.
 */
const getHeaders = (apiKey: string, acceptStream: boolean = false): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (acceptStream) {
        headers['Accept'] = 'text/event-stream';
    }
    return headers;
};

/**
 * Fetches detailed system resource metrics from the backend.
 * Corresponds to GET /api/system/metrics.
 * @param apiKey The API key.
 * @returns A promise that resolves to SystemMetrics.
 */
export const getSystemMetrics = async (apiKey: string): Promise<SystemMetrics> => {
    const response = await fetch(`${API_BASE_URL}/api/system/metrics`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Could not fetch system metrics");
    return response.json();
};

/**
 * Streams the cognitive cycle execution from the backend using Server-Sent Events (SSE).
 * This function handles parsing each data chunk as JSON and provides callbacks for data, end, and errors.
 * Corresponds to POST /api/orchestrator/execute.
 * @param apiKey The API key.
 * @param prompt The user's prompt.
 * @param inferenceParams Parameters for LLM inference (e.g., model, temperature, max_tokens).
 * @param contextSelection Parameters for context retrieval (e.g., RAG, memory usage flags).
 * @param onData Callback function for each received Scratchpad data chunk.
 * @param onEnd Callback function when the stream completes.
 * @param onError Callback function if an error occurs during streaming.
 * @returns A promise that resolves when the stream ends or an error occurs.
 */
export const streamCognitiveLogs = async (
  apiKey: string, prompt: string, inferenceParams: any, contextSelection: ContextSelection,
  onData: (data: Scratchpad) => void, onEnd: () => void, onError: (error: Error) => void
): Promise<void> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/orchestrator/execute`, {
            method: 'POST',
            headers: getHeaders(apiKey, true), // Request SSE by setting Accept: text/event-stream
            body: JSON.stringify({ prompt, inference_params: inferenceParams, context_selection: contextSelection }),
        });
        if (!response.ok || !response.body) {
            const errorData = await response.json().catch(() => ({ detail: "Unknown server error" }));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer to accumulate partial lines from the stream

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            // Process buffer line by line, looking for 'data: ' prefix as per SSE standard
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.startsWith('data: ')) {
                    const jsonString = line.substring(6); // Extract JSON part after 'data: '
                    if (jsonString) {
                        try { 
                            onData(JSON.parse(jsonString)); // Parse JSON and send data to callback
                        } 
                        catch (e) { 
                            // Log parsing errors, but continue processing the stream if possible
                            console.error("Failed to parse stream chunk:", jsonString, e); 
                            onError(e instanceof Error ? e : new Error("Failed to parse stream data"));
                        }
                    }
                }
            }
        }
        onEnd(); // Signal end of stream
    } catch (error) {
        // Catch network errors or errors thrown before stream starts
        onError(error instanceof Error ? error : new Error("An unknown streaming error occurred"));
    }
};

/**
 * Executes a direct, single-shot inference request to the backend.
 * Used primarily by Workflow execution, where a full stream is not needed.
 * Corresponds to POST /api/orchestrator/infer.
 * @param apiKey The API key.
 * @param data Inference request data (prompt, RAG usage, system prompt).
 * @returns A promise resolving to the completion text and inspection data.
 */
export const infer = async (apiKey: string, data: { prompt: string, use_rag: boolean, system_prompt?: string }): Promise<{ completion: string, inspection: InspectionData }> => {
    const response = await fetch(`${API_BASE_URL}/api/orchestrator/infer`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Direct inference failed");
    }
    return response.json();
};

// --- Task Management (Mock) ---
// Note: This is a mock implementation. A real backend with a database would be required.

let mockTaskLists: TaskList[] = [
    {
        id: 'list-1',
        name: 'Main Project Plan',
        tasks: [
            {
                id: 'task-1',
                text: 'Setup initial project structure',
                type: 'file_edit',
                status: 'Complete',
                done: true,
            },
            {
                id: 'task-2',
                text: 'Develop UI for main dashboard',
                type: 'infer',
                status: 'Running',
                sub_tasks: [
                    { id: 'task-2-1', text: 'Create NavBar component', type: 'file_edit', status: 'Complete', done: true },
                    { id: 'task-2-2', text: 'Design chat interface', type: 'other', status: 'Awaiting-Approval' },
                    { id: 'task-2-3', text: 'Implement settings panel', type: 'file_edit', status: 'Pending' },
                ],
            },
            {
                id: 'task-3',
                text: 'Write backend API for tasks',
                type: 'search',
                status: 'Pending',
            },
             {
                id: 'task-4',
                text: 'Review the deployment script for errors',
                type: 'file_edit',
                status: 'Error',
                result: 'Syntax error on line 42.'
            },
        ]
    },
    {
        id: 'list-2',
        name: 'Future Ideas',
        tasks: []
    }
];

const findTask = (taskId: string, lists: TaskList[]): Task | null => {
    for (const list of lists) {
        const search = (tasks: Task[]): Task | null => {
            for (const task of tasks) {
                if (task.id === taskId) return task;
                if (task.sub_tasks) {
                    const found = search(task.sub_tasks);
                    if (found) return found;
                }
            }
            return null;
        }
        const found = search(list.tasks);
        if(found) return found;
    }
    return null;
};

export const getAllTaskLists = async (apiKey: string): Promise<TaskList[]> => {
    console.log('STUB: Getting all task lists with key:', apiKey);
    return Promise.resolve(JSON.parse(JSON.stringify(mockTaskLists)));
};

export const createTaskList = async (apiKey: string, name: string): Promise<TaskList> => {
    console.log('STUB: Creating task list:', name, 'with key:', apiKey);
    const newList: TaskList = {
        id: `list-${Date.now()}`,
        name,
        tasks: []
    };
    mockTaskLists.push(newList);
    return Promise.resolve(JSON.parse(JSON.stringify(newList)));
};

export const renameTaskList = async (apiKey: string, listId: string, newName: string): Promise<TaskList> => {
    console.log('STUB: Renaming task list:', listId, 'with key:', apiKey);
    const list = mockTaskLists.find(l => l.id === listId);
    if (list) {
        list.name = newName;
        return Promise.resolve(JSON.parse(JSON.stringify(list)));
    }
    return Promise.reject(new Error("List not found"));
};

export const deleteTaskList = async (apiKey: string, listId: string): Promise<{ success: boolean }> => {
    console.log('STUB: Deleting task list:', listId, 'with key:', apiKey);
    mockTaskLists = mockTaskLists.filter(l => l.id !== listId);
    return Promise.resolve({ success: true });
};

export const addTask = async (apiKey: string, listId: string, text: string): Promise<Task> => {
    console.log('STUB: Adding task to list:', listId, 'with key:', apiKey);
    const list = mockTaskLists.find(l => l.id === listId);
    if (list) {
        const newTask: Task = {
            id: `task-${Date.now()}`,
            text,
            type: 'other',
            status: 'Pending',
        };
        list.tasks.push(newTask);
        return Promise.resolve(JSON.parse(JSON.stringify(newTask)));
    }
    return Promise.reject(new Error("List not found"));
};

export const updateTask = async (apiKey: string, taskId: string, updates: Partial<Task>): Promise<Task> => {
    console.log('STUB: Updating task:', taskId, 'with key:', apiKey);
    const task = findTask(taskId, mockTaskLists);
    if (task) {
        Object.assign(task, updates);
        return Promise.resolve(JSON.parse(JSON.stringify(task)));
    }
    return Promise.reject(new Error("Task not found"));
};

export const approveTask = async (apiKey: string, taskId: string): Promise<Task> => {
    return updateTask(apiKey, taskId, { status: 'Pending' });
};

export const rejectTask = async (apiKey: string, taskId: string): Promise<Task> => {
    return updateTask(apiKey, taskId, { status: 'Error', result: 'Task rejected by user.' });
};

export const cancelTask = async (apiKey: string, taskId: string): Promise<Task> => {
    return updateTask(apiKey, taskId, { status: 'Pending', result: 'Task cancelled by user.' });
};


// --- Model & Project Management ---

/**
 * Lists available LLM model files from a specified directory on the backend.
 * Corresponds to POST /api/tools/project/list-models.
 * @param apiKey The API key.
 * @param modelFolder The path to the models directory on the backend server.
 * @returns A promise resolving to an array of model filenames.
 */
export const listModels = async (apiKey: string, modelFolder: string): Promise<string[]> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/list-models`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ path: modelFolder }),
    });
    if (!response.ok) {
        console.error("Failed to list models:", await response.text());
        return []; // Return an empty array on failure to prevent app crash
    }
    return response.json();
};

/**
 * Fetches the file tree structure of the project from the backend.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * would be needed to dynamically list project files.
 * @returns A promise resolving to the root FileNode.
 */
export const getFileTree = async (): Promise<FileNode> => {
    const mockTree: FileNode = { id: 'root', name: 'Mock Project', type: 'directory', path: '/', children: [{ id: '1', name: 'src', type: 'directory', path: '/src', children: [{ id: '1-1', name: 'App.tsx', type: 'file', path: '/src/App.tsx' }] }] };
    return new Promise(resolve => setTimeout(() => resolve(mockTree), 500));
};

/**
 * Initiates digestion of specified project files into a knowledge base.
 * Corresponds to POST /api/project/digest.
 * @param apiKey The API key.
 * @param files An array of file paths to digest.
 * @param options Digestion options including the target knowledge base ID.
 * @returns A promise resolving to the digestion count or job ID.
 */
export const digestProject = async (apiKey: string, files: string[], options: { kb_id: string }): Promise<{ count?: number }> => {
  const response = await fetch(`${API_BASE_URL}/api/project/digest`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify({ files: files, kb_id: options.kb_id }),
  });
  if (!response.ok) throw new Error((await response.json()).detail || "Failed to digest project");
  return response.json();
};

/**
 * Removes digested content associated with specified file paths from a knowledge base.
 * Corresponds to POST /api/project/undigest.
 * @param apiKey The API key.
 * @param files An array of file paths to undigest.
 * @param kb_id The ID of the knowledge base to undigest from.
 * @returns A promise resolving to the count of undigested items.
 */
export const undigestProject = async (apiKey: string, files: string[], kb_id: string): Promise<{ count: number }> => {
  const response = await fetch(`${API_BASE_URL}/api/project/undigest`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify({ paths: files, kb_id: kb_id }),
  });
   if (!response.ok) throw new Error((await response.json()).detail || "Failed to undigest project");
  return response.json();
};

/**
 * Loads a specified LLM model on the backend.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for dynamic model loading would be needed.
 * @param apiKey The API key.
 * @param model The name/path of the model to load.
 * @returns A promise resolving to the updated SystemStatus.
 */
export const loadModel = async (apiKey: string, model: string): Promise<SystemStatus> => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ model_status: 'loaded', retriever_status: 'active' });
        }, 1500);
    });
};

/**
 * Unloads the currently loaded LLM model on the backend.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for dynamic model unloading would be needed.
 * @param apiKey The API key.
 * @returns A promise resolving to the updated SystemStatus.
 */
export const unloadModel = async (apiKey: string): Promise<SystemStatus> => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ model_status: 'unloaded', retriever_status: 'inactive' });
        }, 500);
    });
};

/**
 * Fetches the overall system status, including model and retriever status,
 * and detailed cognition metrics.
 * Corresponds to GET /api/system/status.
 * @param apiKey The API key.
 * @returns A promise resolving to the SystemStatus.
 */
export const getSystemStatus = async (apiKey: string): Promise<SystemStatus> => {
    const response = await fetch(`${API_BASE_URL}/api/system/status`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Could not fetch system status");
    const data = await response.json();
    // Map backend SystemStatusResponse to frontend SystemStatus for UI consumption.
    // This mapping assumes the structure of the backend's SystemStatusResponse.
    return {
        model_status: data.llm.status === 'loaded' ? 'loaded' : data.llm.status === 'not_loaded' ? 'unloaded' : 'loading',
        retriever_status: data.digestors.some((d: any) => d.vector_count > 0) ? 'active' : 'inactive', 
        active_kb_name: data.digestors.find((d: any) => d.name === 'active_project')?.name || null, 
        cognition: {
            stm_buffer_size: data.memory_layers.working_memory_items,
            stm_buffer_threshold: 100, // This threshold is hardcoded here; ideally should come from backend config
            digestor_status: data.digestors.some((d: any) => d.name === 'active_project' && d.vector_count > 0) ? 'Digesting' : 'Idle', 
            loaded_knowledge_bases: data.digestors.map((d: any) => d.name),
        }
    };
};


// --- Workflow Management ---

/**
 * Fetches all available workflows from the backend.
 * Corresponds to GET /api/workflows.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of Workflows.
 */
export const getAllWorkflows = async (apiKey: string): Promise<Workflow[]> => {
    const response = await fetch(`${API_BASE_URL}/api/workflows`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to fetch workflows");
    return response.json();
};

/**
 * Fetches a specific workflow by its ID.
 * Corresponds to GET /api/workflows/{id}.
 * @param apiKey The API key.
 * @param id The ID of the workflow.
 * @returns A promise resolving to the Workflow object.
 */
export const getWorkflowById = async (apiKey: string, id: string): Promise<Workflow> => {
    const response = await fetch(`${API_BASE_URL}/api/workflows/${id}`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to fetch workflow");
    return response.json();
};

/**
 * Creates a new workflow on the backend.
 * Corresponds to POST /api/workflows.
 * @param apiKey The API key.
 * @param workflowData The data for the new workflow.
 * @returns A promise resolving to the created Workflow.
 */
export const createWorkflow = async (apiKey: string, workflowData: Omit<Workflow, 'id'>): Promise<Workflow> => {
    const response = await fetch(`${API_BASE_URL}/api/workflows`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify(workflowData),
    });
    if (!response.ok) throw new Error("Failed to create workflow");
    return response.json();
};

/**
 * Updates an existing workflow on the backend.
 * Corresponds to PUT /api/workflows/{id}.
 * @param apiKey The API key.
 * @param workflow The updated workflow data.
 * @returns A promise resolving to the updated Workflow.
 */
export const updateWorkflow = async (apiKey: string, workflow: Workflow): Promise<Workflow> => {
    const response = await fetch(`${API_BASE_URL}/api/workflows/${workflow.id}`, {
        method: 'PUT',
        headers: getHeaders(apiKey),
        body: JSON.stringify(workflow),
    });
    if (!response.ok) throw new Error("Failed to update workflow");
    return response.json();
};

/**
 * Deletes a workflow from the backend.
 * Corresponds to DELETE /api/workflows/{id}.
 * @param apiKey The API key.
 * @param id The ID of the workflow to delete.
 * @returns A promise that resolves when the workflow is deleted.
 */
export const deleteWorkflow = async (apiKey: string, id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/workflows/${id}`, {
        method: 'DELETE',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Failed to delete workflow");
}; 

// --- Role Management ---

/**
 * Lists all available roles from the backend.
 * Corresponds to GET /api/roles.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of Roles.
 */
export const listRoles = async (apiKey: string): Promise<Role[]> => {
    const response = await fetch(`${API_BASE_URL}/api/roles`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to fetch roles");
    return response.json();
};

/**
 * Creates a new role on the backend.
 * Corresponds to POST /api/roles.
 * @param apiKey The API key.
 * @param roleData The data for the new role.
 * @returns A promise resolving to the created Role.
 */
export const createRole = async (apiKey: string, roleData: Omit<Role, 'id'>): Promise<Role> => {
    const response = await fetch(`${API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify(roleData),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to create role");
    return response.json();
};

/**
 * Updates an existing role on the backend.
 * Corresponds to PUT /api/roles/{id}.
 * @param apiKey The API key.
 * @param roleData The updated role data.
 * @returns A promise resolving to the updated Role.
 */
export const updateRole = async (apiKey: string, roleData: Role): Promise<Role> => {
    const response = await fetch(`${API_BASE_URL}/api/roles/${roleData.id}`, {
        method: 'PUT',
        headers: getHeaders(apiKey),
        body: JSON.stringify(roleData),
    });
    if (!response.ok) throw new Error("Failed to update role");
    return response.json();
};

/**
 * Deletes a role from the backend.
 * Corresponds to DELETE /api/roles/{id}.
 * @param apiKey The API key.
 * @param id The ID of the role to delete.
 * @returns A promise that resolves when the role is deleted.
 */
export const deleteRole = async (apiKey: string, id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/roles/${id}`, {
        method: 'DELETE',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Failed to delete role");
};

// --- Ingestion & Knowledge Base Management ---

/**
 * Ingests content from a URL into a specified knowledge base.
 * Corresponds to POST /api/knowledge/ingest-url.
 * @param apiKey The API key.
 * @param url The URL to ingest.
 * @param kb_id The ID of the target knowledge base.
 * @returns A promise resolving to success status.
 */
export const ingestUrl = async (apiKey: string, url: string, kb_id: string | null): Promise<{ success: boolean }> => {
    if (!kb_id) throw new Error("Target Knowledge Base ID is required.");
    
    const urlResponse = await fetch(`${API_BASE_URL}/api/knowledge/ingest-url`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ url: url, kb_id: kb_id }),
    });

    if (!urlResponse.ok) throw new Error((await urlResponse.json()).detail || "Failed to ingest URL");
    return { success: true };
};

/**
 * Ingests a file into a specified knowledge base.
 * Corresponds to POST /api/knowledge/ingest-file.
 * @param apiKey The API key.
 * @param file The File object to ingest.
 * @param kb_id The ID of the target knowledge base.
 * @returns A promise resolving to success status.
 */
export const ingestFile = async (apiKey: string, file: File, kb_id: string): Promise<{ success: boolean }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kb_id', kb_id);

    const response = await fetch(`${API_BASE_URL}/api/knowledge/ingest-file`, {
        method: 'POST',
        // For FormData, the browser sets Content-Type: multipart/form-data with boundary
        headers: { 'Authorization': `Bearer ${apiKey}` }, 
        body: formData,
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to ingest file");
    return { success: true };
};

/**
 * Fetches all entries from the scratchpad memory.
 * Corresponds to GET /api/memory/scratch.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of MemoryEntry.
 */
export const getScratchpad = async (apiKey: string): Promise<MemoryEntry[]> => {
    const response = await fetch(`${API_BASE_URL}/api/memory/scratch`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get scratchpad");
    return response.json();
};

/**
 * Fetches entries from long-term memory.
 * Corresponds to GET /api/memory/long_term.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of MemoryEntry.
 */
export const getLongTermMemory = async (apiKey: string): Promise<MemoryEntry[]> => {
    const response = await fetch(`${API_BASE_URL}/api/memory/long_term`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get long-term memory");
    return response.json();
};

/**
 * Adds a new entry to the scratchpad memory.
 * Corresponds to POST /api/memory/scratch.
 * @param apiKey The API key.
 * @param entry The content and optional type for the new entry.
 * @returns A promise resolving to the created MemoryEntry.
 */
export const addToScratchpad = async (apiKey: string, entry: { content: string, type?: string }): Promise<MemoryEntry> => {
    const response = await fetch(`${API_BASE_URL}/api/memory/scratch`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ content: entry.content, type: entry.type || 'manual' }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to add to scratchpad");
    return response.json();
};

/**
 * Commits a single scratchpad entry to long-term memory.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for committing single entries is needed.
 * @param apiKey The API key.
 * @param entryId The ID of the entry to commit.
 * @returns A promise resolving to success status.
 */
export const commitSingleScratchpadEntry = async (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    console.log(`Mocking commit of scratchpad entry ${entryId}. A backend endpoint is needed.`);
    return Promise.resolve({ success: true });
};

/**
 * Deletes a single scratchpad entry.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for deleting single scratchpad entries is needed.
 * @param apiKey The API key.
 * @param entryId The ID of the entry to delete.
 * @returns A promise resolving to success status.
 */
export const deleteScratchpadEntry = async (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    console.log(`Mocking deletion of scratchpad entry ${entryId}. A backend endpoint is needed.`);
    return Promise.resolve({ success: true });
};

/**
 * Updates a long-term memory entry.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for updating long-term memory entries is needed.
 * @param apiKey The API key.
 * @param entryId The ID of the entry to update.
 * @param updates Partial updates for the entry.
 * @returns A promise resolving to the updated MemoryEntry.
 */
export const updateLongTermEntry = async (apiKey: string, entryId: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry> => {
    console.log(`Mocking update of long-term entry ${entryId}. A backend endpoint is needed.`);
    return Promise.resolve({ id: entryId, timestamp: new Date().toISOString(), content: updates.content || "", ...updates } as MemoryEntry);
};

/**
 * Deletes a long-term memory entry.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for deleting long-term memory entries is needed.
 * @param apiKey The API key.
 * @param entryId The ID of the entry to delete.
 * @returns A promise resolving to success status.
 */
export const deleteLongTermEntry = async (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    console.log(`Mocking deletion of long-term entry ${entryId}. A backend endpoint is needed.`);
    return Promise.resolve({ success: true });
};

/**
 * Initiates crawling and digestion of a website into a knowledge base.
 * Corresponds to POST /api/knowledge/crawl-and-digest.
 * @param apiKey The API key.
 * @param baseUrl The base URL to start crawling from.
 * @param kb_id The ID of the target knowledge base.
 * @returns A promise resolving to the number of pages crawled.
 */
export const crawlAndDigestSite = async (
    apiKey: string, 
    baseUrl: string, 
    kb_id: string
): Promise<{ pages_crawled: number }> => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/crawl-and-digest`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ base_url: baseUrl, kb_id: kb_id }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to crawl and digest site");
    }
    return response.json();
};

/**
 * Fetches all available knowledge bases.
 * Corresponds to GET /api/knowledge/bases.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of KnowledgeBase objects.
 */
export const getKnowledgeBases = async (apiKey: string): Promise<KnowledgeBase[]> => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/bases`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get knowledge bases");
    return response.json();
};

/**
 * Creates a new knowledge base.
 * Corresponds to POST /api/knowledge/bases.
 * @param apiKey The API key.
 * @param name The name of the new knowledge base.
 * @returns A promise resolving to the created KnowledgeBase.
 */
export const createKnowledgeBase = async (apiKey: string, name: string): Promise<KnowledgeBase> => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/bases`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to create knowledge base");
    return response.json();
};

/**
 * Activates a knowledge base.
 * Corresponds to POST /api/knowledge/bases/{id}/activate.
 * @param apiKey The API key.
 * @param id The ID of the knowledge base to activate.
 * @returns A promise resolving to the updated list of KnowledgeBase objects.
 */
export const activateKnowledgeBase = async (apiKey: string, id: string): Promise<KnowledgeBase[]> => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/bases/${id}/activate`, {
        method: 'POST',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Failed to activate knowledge base");
    return response.json();
};

/**
 * Deletes a knowledge base.
 * Corresponds to DELETE /api/knowledge/bases/{id}.
 * @param apiKey The API key.
 * @param id The ID of the knowledge base to delete.
 * @returns A promise that resolves when the knowledge base is deleted.
 */
export const deleteKnowledgeBase = async (apiKey: string, id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/bases/${id}`, {
        method: 'DELETE',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) throw new Error("Failed to delete knowledge base");
};

/**
 * Fetches the content of a file from the backend's project tools.
 * Corresponds to POST /api/tools/project/get-file-content.
 * NOTE: Uses a "dummy-key" for headers; ensure backend doesn't require a real API key for this endpoint.
 * @param path The path to the file.
 * @returns A promise resolving to the file content.
 */
export const getFileContent = async (path: string): Promise<{ content: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/get-file-content`, {
        method: 'POST',
        headers: getHeaders("dummy-key"), 
        body: JSON.stringify({ path }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to get file content");
    return response.json();
};

/**
 * Saves content to a file on the backend's project tools.
 * Corresponds to POST /api/tools/project/save-file-content.
 * NOTE: Uses a "dummy-key" for headers; ensure backend doesn't require a real API key for this endpoint.
 * @param path The path to the file.
 * @param content The content to save.
 * @returns A promise resolving to success status.
 */
export const saveFileContent = async (path: string, content: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/save-file-content`, {
        method: 'POST',
        headers: getHeaders("dummy-key"),
        body: JSON.stringify({ path, content }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to save file content");
    return response.json();
};

/**
 * Runs OCR on a specified file using the backend's project tools.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for OCR (e.g., /api/tools/project/run-ocr) is needed.
 * @param apiKey The API key.
 * @param path The path to the file.
 * @param options OCR options.
 * @returns A promise resolving to the extracted text.
 */
export const runOcr = async (apiKey: string, path: string, options: any): Promise<{ text: string }> => {
    console.log("Mocking OCR run for path:", path);
    return Promise.resolve({ text: `--- MOCK OCR RESULT for ${path} ---\n\nThis is the extracted text.`});
};

/**
 * Injects context into a specific task.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for context injection (e.g., /api/tasks/{id}/inject-context) is needed.
 * @param apiKey The API key.
 * @param taskId The ID of the task.
 * @param context The context string to inject.
 * @returns A promise that resolves when context is injected.
 */
export const injectContextIntoTask = async (apiKey: string, taskId: string, context: string): Promise<void> => {
    console.log(`Mocking injection of context into task ${taskId}`);
    return Promise.resolve();
};

/**
 * Fetches performance KPIs from the backend.
 * Corresponds to GET /api/system/kpis.
 * @param apiKey The API key.
 * @returns A promise resolving to PerformanceKPIs.
 */
export const getPerformanceKpis = async (apiKey: string): Promise<PerformanceKPIs> => {
    const response = await fetch(`${API_BASE_URL}/api/system/kpis`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get performance KPIs");
    return response.json();
};

/**
 * Fetches recent backend log entries.
 * Corresponds to GET /api/system/logs.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of BackendLogEntry.
 */
export const getBackendLogs = async (apiKey: string): Promise<BackendLogEntry[]> => {
    const response = await fetch(`${API_BASE_URL}/api/system/logs`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get backend logs");
    return response.json();
};

/**
 * Ingests a batch of files with OCR options.
 * Corresponds to POST /api/knowledge/ingest-files-ocr.
 * @param apiKey The API key.
 * @param files An array of file objects (name, content) to ingest.
 * @param kb_id The ID of the target knowledge base.
 * @param options OCR options.
 * @returns A promise resolving to success status and count of processed files.
 */
export const ingestFilesWithOcr = async (
    apiKey: string, 
    files: { name: string, content: string }[], 
    kb_id: string, 
    options: { ocr: boolean } & OcrOptions
): Promise<{ success: boolean; files_processed: number }> => {
    
    const transformed_files = files.map(f => ({ path: f.name, content: f.content }));

    const response = await fetch(`${API_BASE_URL}/api/knowledge/ingest-files-ocr`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({
            files: transformed_files,
            kb_id: kb_id,
            ...options
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to ingest files with OCR");
    }

    const result = await response.json();
    return { success: true, files_processed: result.files_processed };
};

/**
 * Fetches project commit history.
 * Corresponds to GET /api/versioning/commits.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of Commit objects.
 */
export const getCommits = async (apiKey: string): Promise<Commit[]> => {
    const response = await fetch(`${API_BASE_URL}/api/versioning/commits`, { headers: getHeaders(apiKey) });
    if (!response.ok) throw new Error("Failed to get commits");
    return response.json();
};

/**
 * Creates a new project snapshot (git commit).
 * Corresponds to POST /api/versioning/snapshots.
 * @param apiKey The API key.
 * @param message The commit message.
 * @returns A promise resolving to the created Commit object.
 */
export const createSnapshot = async (apiKey: string, message: string): Promise<Commit> => {
    const response = await fetch(`${API_BASE_URL}/api/versioning/snapshots`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ message }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to create snapshot");
    return response.json();
};

/**
 * Reverts the project to a specific commit.
 * Corresponds to POST /api/versioning/revert.
 * @param apiKey The API key.
 * @param sha The SHA of the commit to revert to.
 * @returns A promise resolving to the status of the revert operation.
 */
export const revertToCommit = async (apiKey: string, sha: string): Promise<{ status: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/versioning/revert`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ sha }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Failed to revert");
    return response.json();
};

// --- Project Tools Specific API Calls ---

/**
 * Fetches a list of Conda environments from the backend.
 * Corresponds to GET /api/tools/conda/envs.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of CondaEnv objects.
 */
export const listCondaEnvs = async (apiKey: string): Promise<CondaEnv[]> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/conda/envs`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to list conda environments");
    }
    return response.json();
};

/**
 * Builds a tree map of the project structure on the backend.
 * Corresponds to POST /api/tools/project/build-tree-map.
 * @param apiKey The API key.
 * @returns A promise resolving to success status and a message.
 */
export const buildTreeMap = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/build-tree-map`, {
        method: 'POST',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build tree map");
    }
    return response.json();
};

/**
 * Dumps all source files of the project to a single file on the backend.
 * Corresponds to POST /api/tools/project/dump-source-files.
 * @param apiKey The API key.
 * @returns A promise resolving to success status and a message.
 */
export const dumpSourceFiles = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/dump-source-files`, {
        method: 'POST',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to dump source files");
    }
    return response.json();
};

/**
 * Audits a specific Conda environment on the backend.
 * Corresponds to POST /api/tools/conda/audit-env.
 * @param apiKey The API key.
 * @param envName The name of the Conda environment to audit.
 * @returns A promise resolving to success status and an audit report.
 */
export const auditCondaEnv = async (apiKey: string, envName: string): Promise<{ success: boolean; report: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/conda/audit-env`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ env_name: envName }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to audit conda environment");
    }
    return response.json();
};

/**
 * Audits system information on the backend.
 * Corresponds to GET /api/tools/system/audit-info.
 * @param apiKey The API key.
 * @returns A promise resolving to success status and a system info report.
 */
export const auditSystemInfo = async (apiKey: string): Promise<{ success: boolean; report: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/system/audit-info`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to audit system info");
    }
    return response.json();
};

/**
 * Backs up selected project paths on the backend.
 * Corresponds to POST /api/tools/project/backup.
 * @param apiKey The API key.
 * @param paths An array of paths to include in the backup.
 * @param exclusions An array of paths/patterns to exclude from the backup.
 * @returns A promise resolving to success status and the backup path.
 */
export const backupProject = async (apiKey: string, paths: string[], exclusions: string[]): Promise<{ success: boolean; backup_path: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/project/backup`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ paths, exclusions }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to backup project");
    }
    return response.json();
};

/**
 * Fetches the status of the backend server.
 * Corresponds to GET /api/tools/server/status.
 * @param apiKey The API key.
 * @returns A promise resolving to ServerStatusResponse.
 */
export const getServerStatus = async (apiKey: string): Promise<ServerStatusResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/server/status`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        // If the server is truly down, this fetch will likely fail before getting a JSON response.
        // Provide a default "not running" status in that case.
        return { isRunning: false, port: null };
    }
    return response.json();
};

/**
 * Starts the backend server.
 * Corresponds to POST /api/tools/server/start.
 * @param apiKey The API key.
 * @param port The port to start the server on.
 * @param removeIndex Whether to remove index.html on stop (backend specific).
 * @returns A promise resolving to ServerStatusResponse.
 */
export const startServer = async (apiKey: string, port: number, removeIndex: boolean): Promise<ServerStatusResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/server/start`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify({ port, remove_index_on_stop: removeIndex }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to start server");
    }
    return response.json();
};

/**
 * Stops the backend server.
 * Corresponds to POST /api/tools/server/stop.
 * @param apiKey The API key.
 * @returns A promise resolving to ServerStatusResponse.
 */
export const stopServer = async (apiKey: string): Promise<ServerStatusResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/server/stop`, {
        method: 'POST',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to stop server");
    }
    return response.json();
};

/**
 * Saves the current session log on the backend.
 * Corresponds to POST /api/tools/system/save-session-log.
 * @param apiKey The API key.
 * @returns A promise resolving to success status and the log file path.
 */
export const saveSessionLog = async (apiKey: string): Promise<{ success: boolean, path: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/system/save-session-log`, {
        method: 'POST',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to save session log");
    }
    return response.json();
};

/**
 * Downloads a ZIP archive of all backend logs.
 * Corresponds to GET /api/tools/system/download-logs-archive.
 * @param apiKey The API key.
 * @returns A promise resolving to success status and a download URL.
 */
export const downloadLogsArchive = async (apiKey: string): Promise<{ success: boolean, url: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/system/download-logs-archive`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to download logs archive");
    }
    return response.json();
};

/**
 * Fetches all backend logs as plain text.
 * Corresponds to GET /api/tools/system/get-logs-as-text.
 * @param apiKey The API key.
 * @returns A promise resolving to the logs as a single text string.
 */
export const getLogsAsText = async (apiKey: string): Promise<{ logs: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tools/system/get-logs-as-text`, {
        method: 'GET',
        headers: getHeaders(apiKey),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to get logs as text");
    }
    return response.json();
};

// --- Mocks for functions not yet fully implemented or with simplified backend ---

let folderSelectionToggle = false;
/**
 * Simulates a folder picker dialog. This is a stub; a real implementation would require
 * a desktop wrapper like Electron or Tauri to open a native folder dialog.
 * @returns A promise resolving to a selected folder path.
 */
export const selectFolder = (): Promise<{ path: string | null }> => {
    console.log("STUB: Simulating folder picker dialog.");
    // This is a placeholder. A real implementation would require a desktop
    // application wrapper like Electron or Tauri to open a native folder dialog.
    folderSelectionToggle = !folderSelectionToggle;
    const path = folderSelectionToggle ? '/path/to/models/custom' : '/path/to/models/default';
    return new Promise(resolve => setTimeout(() => resolve({ path }), 500));
};

/**
 * Mocks getting job status. In a real app, this would query a job queue.
 * @param apiKey The API key.
 * @param jobId The ID of the job.
 * @returns A promise resolving to the job status.
 */
export const getJobStatus = async (apiKey: string, jobId: string): Promise<{ status: string }> => {
    return Promise.resolve({ status: "completed" });
};

/**
 * Mocks listing prompt templates.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for listing prompt templates is needed.
 * @param apiKey The API key.
 * @returns A promise resolving to an array of prompt templates.
 */
export const listPromptTemplates = async (apiKey: string): Promise<PromptTemplate[]> => {
    const mockTemplates: PromptTemplate[] = [
        { id: 'p_default', title: 'Default Agent', content: 'You are a helpful AI assistant.', tags: ['system', 'default'] },
        { id: 'p_coder', title: 'Code Generation', content: 'You are an expert programmer. Only respond with code.', tags: ['coding', 'expert'] },
    ];
    console.log('STUB: Listing prompt templates with key:', apiKey);
    return Promise.resolve(mockTemplates);
};

/**
 * Mocks deleting a prompt template.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for deleting prompt templates is needed.
 * @param apiKey The API key.
 * @param id The ID of the prompt template.
 * @returns A promise resolving to success status.
 */
export const deletePromptTemplate = async (apiKey: string, id: string): Promise<{ success: boolean }> => {
    console.log('STUB: Deleting prompt template:', id, 'with key:', apiKey);
    return new Promise(resolve => setTimeout(() => resolve({ success: true }), 500));
};

/**
 * Mocks updating a prompt template.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for updating prompt templates is needed.
 * @param apiKey The API key.
 * @param template The template object to update.
 * @returns A promise resolving to the updated prompt template.
 */
export const updatePromptTemplate = async (apiKey: string, template: PromptTemplate): Promise<PromptTemplate> => {
    console.log('STUB: Updating prompt template:', template.id, 'with key:', apiKey);
    return new Promise(resolve => setTimeout(() => resolve(template), 500));
};

/**
 * Mocks creating a prompt template.
 * NOTE: This is currently a mock implementation. A real backend endpoint
 * for creating prompt templates is needed.
 * @param apiKey The API key.
 * @param templateData The data for the new prompt template.
 * @returns A promise resolving to the created prompt template.
 */
export const createPromptTemplate = async (apiKey: string, templateData: Omit<PromptTemplate, 'id'>): Promise<PromptTemplate> => {
    console.log('STUB: Creating prompt template:', templateData.title, 'with key:', apiKey);
    const newTemplate: PromptTemplate = {
        id: `p_${Date.now()}`,
        ...templateData,
    };
    return new Promise(resolve => setTimeout(() => resolve(newTemplate), 500));
};
