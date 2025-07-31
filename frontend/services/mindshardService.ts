
import { FileNode, PromptTemplate, MemoryEntry, Workflow, Task, TaskList, SystemStatus, Explanation, ChatMessage, KnowledgeBase, InspectionData, SystemMetrics, PerformanceKPIs, BackendLogEntry, WorkflowStep, Role, MemoryPolicy, Commit, OcrOptions, CondaEnv, ServerStatusResponse, Scratchpad } from '../types';

const MOCK_API_LATENCY = 500;

const getHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
});

// Helper to simulate API calls
const stub = <T,>(data: T, latency: number = MOCK_API_LATENCY): Promise<T> => {
  return new Promise(resolve => {
    setTimeout(() => resolve(data), latency);
  });
};

// --- Project Panel Stubs ---

const MOCK_FILE_CONTENT: Record<string, string> = {
    '/src/index.ts': `import App from './app';\n\nconsole.log('Starting app...');`,
    '/src/app.tsx': `import React from 'react';\n\nconst App = () => <div>Hello World</div>;\n\nexport default App;`,
    '/README.md': `# My Project\n\nThis is the readme file.`,
    '/documents/design_spec.pdf': `data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvTGFuZyhlbi1VUykgL1N0cnVjdFRyZWVSb290IDEwIDAgUi9NYXJrSW5mbzw8L01hcmtlZCB0cnVlPj4+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1sgMyAwIFIgXSA+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSA1IDAgUj4+L1Byb2NTZXRbL1BERi9UZXh0L0ltYWdlQi9JbWFnZUMvSW1hZ2VJXSA+Pi9NZWRpYUJveFsgMCAwIDYxMiA3OTIgXSAvQ29udGVudHMgNCAwIFIvR3JvdXBlPDwvVHlwZS9Hcm91cC9TL1RyYW5zcGFyZW5jeS9DUy9EZXZpY2VSR0I+Pi9UYWJzL1MvU3RydWN0UGFyZW50cyAwPj4KZW5kb2JqCjQgMCBvYmoKPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCA4Nj4+CnN0cmVhbQp4nE1Qy2rDMBC8+ysGnehgQxALHnroocci2NskB5fYJms9kv77TlInCG14A4eZmfGCyRI4B4d320Y3C8BiQJSAABd6BvPSxbpxr/c+s3w0iC2GqGFsI/eYk4G3g40L6JLh6sBwxi7kZ+YvY2jXyNWyME3J0sIT0pxg2M2UfX1yDzsD6LzNNsoTcbK52mys/g89+eBfA5yJ2yHceS7jKGyLQtq2rK3s8M2uY2d42tH6Bvj4VkkKZW5kc3RyZWFtCmVuZG9iago1IDAgb2Jqago8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2EvRW5jb2RpbmcvV2luQW5zaUVuY29kaW5nPj4KZW5kb2JqCjYgMCBvYmoKPDwvU0RSL0YxIDU4Pj4KZW5kb2JqCjcgMCBvYmoKW10KZW5kb2JqCjggMCBvYmoKPDwvUGcgNiAwIFIvTG9iZAo8PC9UeXBlL09CSkQvVUlEKEUxMDIzMkEzMjFFOUI3NDQ4MEMxQzI5N0UxODQzQTlCKQovVGFnL1Bsb2JkPj4KZW5kb2JqCjkgMCBvYmoKPDwvTU0gNCAwIDM+PgplbmRvYmoKMTIgMCBvYmoKPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAyNzE+PgpzdHJlYW0KeJxdkL1OwkAYhfe9+BVpW0IIBlwYjY2BTYzGxpwQMyi+Exc/gJdD6bbwAl6PQz9ATpB48hBLos3ZzLwz7+zJFGb52AQC3wgh4Qo4+BZgTgc9S/V05w9k3wGSyY+4GgKwxE/E1M9XBk30bV7Wn2bcsL2D33m8VqDXrwJpD/Qk2gKO2H9S/Un+KouyLeB7Bb2/we8u2I+pP/P4j6s+sH5J9afrD9S//p/1F8/zwJ4D/M/K1/wEeO8E98B75/kYVqG/1fZZf1l/2u/9G+r/ABOqj1AKZW5kc3RyZWFtCmVuZG9iagoxMyAwIG9iago8PC9Gb250PDwvRjEgMTEgMCBSPj4vWE9iamVjdDw8L0ltYWdlMSA5IDAgUiA+PiA+PgplbmRvYmoKMTQgMCBvYmoKPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0kgMTYvTGVuZ3RoIDY5L0xlbmd0aDEgMjY0OC9OIDEvUHJlZGljdG9yIDEyPj4Kc3RyZWFtCnicY2BgYWBgZgbiBQEFMAsQMzEDsYwgEANRBADiDAxMLAwMXMyMzAwsrGwcXFzcPDwG+gYFBJmZBYQZGJhYmZgZ2NnYOLi4uXkM9A0IACYgZ0FJQ4FhXX19AwMDRQUDAwM0cMDKwMbBztHJwtLQhAUA/aY/8wplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAwCnRyYWlsZXIKPDwvUm9vdCAxIDAgUi9JbmZvIDE3IDAgUi9TaXplIDIyL0lEWyA8QUQ4OEQ0MzIwRDhGQzE0NThCNEE3NUU5MzY4MDNFQUU+PDAzMTY1QzlBRjVBMTAwNDc5MUQ5RDA1QTczNTAxNUU1PiBdPj4Kc3RhcnR4cmVmCjEzOTQ5CiUlRU9GCg==`,
    '/architecture.png': `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIlSURBVHhe7dixDQAhDEBB2/sfugpTBAURAu1l5zJHhm4z5/u9AHAw2wEAwIVsBwAAl7IdAAhcynYAgMClbAcAApeyHQAIVO4GyX/m/wEAcCnbAQBA5QYAALkBAECuAADIFQAAuQIAIFcAAOQKAECuAADIFQAAuQIAIFcAAOQqAAC5CgAAuQoAAIkKAEAmKgCAUQUAIFYBAIRaAACxWAAAkloAAKlqAQC0qgAA1GoAALUaAEClBhCgUgMIVKkBhKpUgUJVKgChqgUAqFoBgFYNIFCzBhCgWQMIVrMGCNasAQStGQCgWQMIVrMGCNasAQStGQCgWQMISrMAAJVmAEKqNIBQVxpAqC4NIECXBpCgSwMIUm0bQJA2DSRI2wYQtG0DyLYNISjbBpBtGwChbRsAsk0DyLYNCChbBsA0rQGApmwHAEKXMh0ACL7IdgAAcCnbAQDApWwHAEAg2wEAgEWyHQAAXsp2AICAZDsAALTIdgAAyMh2AABoyHYAAEjIdgAAaMh2AACISP//AwBYyHYAAGjIdgAASES2AwBASLYDAGCpbgBAsSoAEKhKAQhUpQIEqlIBClWpAApVpQCEqlQAotUKAECtGhCgWQMIVrMGCNasAQStGQCgWQMIVrMGCNasAQStGQCgWQMIVgMAEKhZAwBWswYAULMGAKxaAwBWs7YNAEjbBhCkbQPIthkAmLIdAAhcyv4BS5JNz2Ua9dAAAAAASUVORK5CYII=`
};

export const getFileContent = (path: string): Promise<{ content: string }> => {
    return stub({ content: MOCK_FILE_CONTENT[path] || `// No content found for ${path}` });
};

export const saveFileContent = (path: string, content: string): Promise<{ success: boolean }> => {
    console.log(`Saving to ${path}:`, content);
    MOCK_FILE_CONTENT[path] = content;
    return stub({ success: true });
};


export const getFileTree = (): Promise<FileNode> => {
  const mockTree: FileNode = {
    id: 'root',
    name: 'Project Root',
    type: 'directory',
    path: '/',
    children: [
      { id: '1', name: 'documents', type: 'directory', path: '/documents', children: [
        { id: '1-1', name: 'requirements.txt', type: 'file', path: '/documents/requirements.txt' },
        { id: '1-2', name: 'design_spec.pdf', type: 'file', path: '/documents/design_spec.pdf' },
      ]},
      { id: '2', name: 'src', type: 'directory', path: '/src', children: [
        { id: '2-1', name: 'index.ts', type: 'file', path: '/src/index.ts' },
        { id: '2-2', name: 'app.tsx', type: 'file', path: '/src/app.tsx' },
      ]},
       { id: '3', name: 'README.md', type: 'file', path: '/README.md' },
       { id: '4', name: 'architecture.png', type: 'file', path: '/architecture.png' },
    ],
  };
  return stub(mockTree);
};

export const digestProject = (apiKey: string, files: string[], options: { dry_run: boolean, background: boolean, kb_id: string }): Promise<{ job_id?: string, count?: number }> => {
  console.log('Digesting files:', files, 'into KB:', options.kb_id, 'with options:', options, 'and key:', apiKey);
  if (options.background) {
    return stub({ job_id: `job-${Date.now()}` });
  }
  return stub({ count: files.length });
};

export const undigestProject = (apiKey: string, files: string[]): Promise<{ count: number }> => {
  console.log('Undigesting files:', files, 'with key:', apiKey);
  return stub({ count: files.length });
};

export const ingestUrl = (apiKey: string, url: string, kb_id?: string | null): Promise<{ success: boolean }> => {
    console.log('Ingesting URL:', url, 'into KB:', kb_id, 'with key:', apiKey);
    return stub({ success: true });
};

export const ingestFile = (apiKey: string, file: File, kb_id: string): Promise<{ success: boolean }> => {
    console.log('Ingesting file:', file.name, `(${Math.round(file.size / 1024)} KB)`, 'into KB:', kb_id, 'with key:', apiKey);
    // In a real app, you'd likely read the file content here before sending.
    return stub({ success: true });
};

export const ingestFilesWithOcr = (apiKey: string, files: {name: string, content: string}[], kb_id: string, options: { ocr: boolean, lang: string, layout: string, dpi: number, engine: string }): Promise<{ success: boolean; files_processed: number }> => {
    console.log(`Ingesting ${files.length} files into KB ${kb_id} with OCR options:`, options);
    // In a real app, this would send the base64 content to the backend.
    return stub({ success: true, files_processed: files.length });
};

export const runOcr = (apiKey: string, path: string, options: Omit<OcrOptions, 'engine'>): Promise<{ text: string }> => {
    console.log(`Running OCR on ${path} with options:`, options);
    const mockOcrText = `--- OCR Result for ${path} ---\n\nThis is the simulated text extracted from the document.\n\nIt includes some text that could be code:\n\nfunction example() {\n  return "Hello from OCR";\n}\n\nAnd some lists:\n- Item 1\n- Item 2\n\nEnd of OCR content.`;
    return stub({ text: mockOcrText }, 1500);
};


export const crawlAndDigestSite = (apiKey: string, url: string, kb_id: string): Promise<{ success: boolean, pages_crawled: number }> => {
    console.log(`Crawling and digesting from base URL ${url} into KB ${kb_id} with key ${apiKey}`);
    return stub({ success: true, pages_crawled: Math.floor(Math.random() * 50) + 5 });
}

export const getJobStatus = (apiKey: string, jobId: string): Promise<{ status: string }> => {
    console.log('Getting status for job:', jobId, 'with key:', apiKey);
    // Simulate job completion
    if (Math.random() > 0.3) {
        return stub({ status: 'Job completed.' });
    }
    return stub({ status: 'Job in progress...' });
}

// --- Prompt Workshop Stubs ---

let mockPrompts: PromptTemplate[] = [
    { id: 'p_default', title: 'Default User Prompt', content: 'Hello, I need assistance with the following task: {{task_description}}.', tags: ['default', 'starter'] },
    { id: 'p1', title: 'Summarize Text', content: 'Summarize the following text:\n\n{{text}}', tags: ['summarization', 'nlp'] },
    { id: 'p2', title: 'Code Generation', content: 'Write a python function to {{description}}.', tags: ['code', 'python'] },
];

export const listPromptTemplates = (apiKey: string): Promise<PromptTemplate[]> => {
  console.log('Listing prompt templates with key:', apiKey);
  return stub([...mockPrompts]);
};

export const createPromptTemplate = (apiKey: string, template: Omit<PromptTemplate, 'id'>): Promise<PromptTemplate> => {
  console.log('Creating prompt template:', template, 'with key:', apiKey);
  const newPrompt = { ...template, id: `p${Date.now()}` };
  mockPrompts.push(newPrompt);
  return stub(newPrompt);
};

export const updatePromptTemplate = (apiKey: string, template: PromptTemplate): Promise<PromptTemplate> => {
  console.log('Updating prompt template:', template.id, 'with key:', apiKey);
  const index = mockPrompts.findIndex(p => p.id === template.id);
  if (index !== -1) {
      mockPrompts[index] = { ...template };
      return stub({ ...mockPrompts[index] });
  }
  return Promise.reject(new Error("Prompt not found"));
};

export const deletePromptTemplate = (apiKey: string, id: string): Promise<{ success: boolean }> => {
  console.log('Deleting prompt template:', id, 'with key:', apiKey);
  const initialLength = mockPrompts.length;
  mockPrompts = mockPrompts.filter(w => w.id !== id);
  return stub({ success: mockPrompts.length < initialLength });
};


// --- Memory Panel Stubs ---
let mockScratchpad: MemoryEntry[] = [
    { id: 's1', content: 'Initial thought: the UI needs to be responsive.', timestamp: new Date(Date.now() - 50000).toISOString(), type: 'thought' },
];
let mockLongTerm: MemoryEntry[] = [
    { id: 'l1', content: 'The project is named Mindshard.', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'fact', tags: ['project', 'setup'] },
    { id: 'l2', content: 'User prefers concise answers.', timestamp: new Date(Date.now() - 172800000).toISOString(), type: 'preference', tags: ['prefs'] },
];

export const getScratchpad = (apiKey: string): Promise<MemoryEntry[]> => stub([...mockScratchpad]);
export const getLongTermMemory = (apiKey: string): Promise<MemoryEntry[]> => stub([...mockLongTerm]);

export const addToScratchpad = (apiKey: string, entry: { content: string, type?: string }): Promise<MemoryEntry> => {
    const newEntry: MemoryEntry = { ...entry, id: `s${Date.now()}`, timestamp: new Date().toISOString() };
    mockScratchpad.unshift(newEntry);
    return stub(newEntry);
};

export const commitScratchpad = (apiKey: string): Promise<{ new_entries: MemoryEntry[] }> => {
    const newEntries = [...mockScratchpad];
    mockLongTerm.unshift(...newEntries.reverse());
    mockScratchpad = [];
    console.log('Committing scratchpad to long-term memory.');
    return stub({ new_entries: newEntries });
};

export const commitSingleScratchpadEntry = (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    const entryIndex = mockScratchpad.findIndex(e => e.id === entryId);
    if (entryIndex > -1) {
        const [entryToCommit] = mockScratchpad.splice(entryIndex, 1);
        mockLongTerm.unshift(entryToCommit);
        console.log('Committing single entry to long-term memory:', entryId);
        return stub({ success: true });
    }
    return Promise.reject(new Error('Entry not found'));
};

export const deleteScratchpadEntry = (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    const initialLength = mockScratchpad.length;
    mockScratchpad = mockScratchpad.filter(e => e.id !== entryId);
    return stub({ success: mockScratchpad.length < initialLength });
};

export const updateLongTermEntry = (apiKey: string, entryId: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry> => {
    const entryIndex = mockLongTerm.findIndex(e => e.id === entryId);
    if (entryIndex > -1) {
        mockLongTerm[entryIndex] = { ...mockLongTerm[entryIndex], ...updates };
        return stub({ ...mockLongTerm[entryIndex] });
    }
    return Promise.reject(new Error('Entry not found'));
};

export const deleteLongTermEntry = (apiKey: string, entryId: string): Promise<{ success: boolean }> => {
    const initialLength = mockLongTerm.length;
    mockLongTerm = mockLongTerm.filter(e => e.id !== entryId);
    return stub({ success: mockLongTerm.length < initialLength });
};


// --- Inference Panel Stubs ---
let mockSystemStatus: SystemStatus = {
    model_status: 'unloaded',
    retriever_status: 'inactive',
    cognition: {
        stm_buffer_size: 0,
        stm_buffer_threshold: 100,
        digestor_status: 'Idle',
        loaded_knowledge_bases: []
    }
};

export const listModels = (apiKey: string, modelFolder?: string): Promise<string[]> => {
    console.log(`Listing models. Folder: ${modelFolder || 'not specified'}`);
    const onlineModels = ["gemini-2.5-flash-preview-04-17"];
    let localModels: string[];

    if (modelFolder) {
        if (modelFolder.toLowerCase().includes('custom')) {
            localModels = ["custom-llama3.gguf", "special-mistral.bin"];
        } else if (modelFolder.toLowerCase().includes('default')) {
            localModels = ["default-wizard-13b.bin", "default-llama-7b.gguf"];
        }
        else {
             localModels = ["ggml-wizard-13b.bin", "llama-7b.gguf"];
        }
    } else {
        // Default if no folder is specified
        localModels = ["ggml-wizard-13b.bin", "llama-7b.gguf"];
    }
    
    return stub([...onlineModels, ...localModels]);
};

let folderSelectionToggle = false;
export const selectFolder = (): Promise<{ path: string | null }> => {
    console.log("Simulating folder picker dialog.");
    folderSelectionToggle = !folderSelectionToggle;
    const path = folderSelectionToggle ? '/path/to/models/custom' : '/path/to/models/default';
    return stub({ path });
}


export const loadModel = (apiKey: string, model: string): Promise<SystemStatus> => {
    mockSystemStatus.model_status = 'loading';
    return new Promise(resolve => {
        setTimeout(() => {
            mockSystemStatus.model_status = 'loaded';
            resolve({...mockSystemStatus});
        }, 1500);
    });
};

export const unloadModel = (apiKey: string): Promise<SystemStatus> => {
    mockSystemStatus.model_status = 'unloaded';
    return stub({...mockSystemStatus});
};

export const getSystemStatus = (apiKey: string): Promise<SystemStatus> => {
    const activeKb = mockKnowledgeBases.find(kb => kb.active);
    mockSystemStatus.retriever_status = activeKb ? 'active' : 'inactive';
    mockSystemStatus.active_kb_name = activeKb ? activeKb.name : null;
    // Update cognition status mock
    mockSystemStatus.cognition = {
        stm_buffer_size: Math.floor(Math.random() * 80) + 10,
        stm_buffer_threshold: 100,
        digestor_status: Math.random() > 0.9 ? 'Digesting' : 'Idle',
        loaded_knowledge_bases: mockKnowledgeBases.filter(kb => kb.active).map(kb => kb.name)
    };
    return stub({...mockSystemStatus});
};

export const infer = (apiKey: string, data: { prompt: string, use_rag: boolean, system_prompt?: string }): Promise<{ completion: string, inspection: InspectionData }> => {
    const codeExample = "Here is an example in TypeScript:\n\n```typescript\nconst greet = (name: string): string => {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet('World'));\n```\n\nLet me know if you need another example.";
    let response = `This is the AI's answer to "${data.prompt}". Knowledge was ${data.use_rag ? 'enabled' : 'disabled'}. ${data.prompt.includes('code') ? codeExample : ''}`;
    
    if (data.system_prompt) {
        response += `\n\n(System prompt was active: "${data.system_prompt.substring(0, 80)}...")`;
    }

    const inspection: InspectionData = {
        original_prompt: data.prompt,
        editor_context: {
            source: 'components/panels/InferencePanel.tsx',
            content: 'const [prompt, setPrompt] = useState(\'\'); // This is from the editor'
        },
        memory_context: {
            source: 'Scratchpad',
            content: 'Remember to check for API key before making calls.'
        },
        rag_chunks: data.use_rag ? [
            { source: 'src/auth/routes.py', score: 0.89, text: 'def login(user, password):\n    # ... implementation details ...' },
            { source: 'README.md', score: 0.72, text: '# Authentication\n\nThe authentication system uses JWT tokens.'}
        ] : []
    };

    return stub({ completion: response, inspection }, 1200);
};


export const explain = (apiKey: string, prompt: string): Promise<Explanation> => {
    const explanation: Explanation = {
        context: [
            { source: 'design_spec.pdf', text: 'The UI should have a dark-themed layout with a clear structure...' },
            { source: 'memory/fact', text: 'The project is named Mindshard.' }
        ]
    };
    return stub(explanation, 800);
}

// --- Workflow Stubs (New Structure) ---
let mockWorkflows: Workflow[] = [
    {
        id: 'wf1',
        name: 'Law of Efficiency Explainer',
        steps: [
            { id: 'step1', prompt: 'Explain the law of thermodynamic efficiency in simple terms.', response: 'Thermodynamic efficiency is a measure of how much useful work is produced compared to the amount of heat energy put into a system. Because of the second law of thermodynamics, no process can be 100% efficient; some energy is always lost as waste heat.', roleId: 'role2' },
            { id: 'step2', prompt: 'Provide a real-world example.', response: 'A car engine is a great example. It burns gasoline (heat energy) to move the car (useful work). However, much of the energy is lost as heat through the radiator and exhaust, which is why the engine gets hot. A typical car engine is only about 20-30% efficient.', roleId: 'role1' },
        ]
    },
    {
        id: 'wf2',
        name: 'Code Generation Workflow',
        steps: [
            { id: 'stepA', prompt: 'Write a python function that takes a list of numbers and returns the sum.', response: '```python\ndef sum_list(numbers):\n  total = 0\n  for number in numbers:\n    total += number\n  return total\n```', roleId: 'role1' },
        ]
    }
];

export const getAllWorkflows = (apiKey: string): Promise<Workflow[]> => {
    console.log('Getting all workflows with key:', apiKey);
    return stub(mockWorkflows.map(w => ({ id: w.id, name: w.name, steps: [] }))); // Return lightweight versions
};

export const getWorkflowById = (apiKey: string, id: string): Promise<Workflow | null> => {
    console.log(`Getting workflow ${id} with key:`, apiKey);
    const workflow = mockWorkflows.find(w => w.id === id);
    return stub(workflow ? { ...workflow } : null);
};

export const createWorkflow = (apiKey: string, workflow: Omit<Workflow, 'id'|'steps'> & {steps: Omit<WorkflowStep, 'id'>[]}): Promise<Workflow> => {
    console.log('Creating workflow:', workflow.name, 'with key:', apiKey);
    const newWorkflow: Workflow = { 
        ...workflow, 
        id: `wf${Date.now()}`,
        steps: workflow.steps.map(s => ({...s, id: `step-${Date.now()}-${Math.random()}`}))
    };
    mockWorkflows.push(newWorkflow);
    return stub({ ...newWorkflow });
};

export const updateWorkflow = (apiKey: string, workflow: Workflow): Promise<Workflow> => {
    console.log('Updating workflow:', workflow.id, 'with key:', apiKey);
    const index = mockWorkflows.findIndex(w => w.id === workflow.id);
    if (index !== -1) {
        mockWorkflows[index] = { ...workflow };
        return stub({ ...mockWorkflows[index] });
    }
    return Promise.reject(new Error("Workflow not found"));
};

export const deleteWorkflow = (apiKey: string, id: string): Promise<{ success: boolean }> => {
    console.log('Deleting workflow:', id, 'with key:', apiKey);
    const initialLength = mockWorkflows.length;
    mockWorkflows = mockWorkflows.filter(w => w.id !== id);
    return stub({ success: mockWorkflows.length < initialLength });
};


// --- Task List Panel Stubs ---
let mockTaskLists: TaskList[] = [
    {
        id: 'tl1',
        name: 'Refactor UI',
        tasks: [
            { id: 't-ui-1', text: 'Update NavBar styles', type: 'file_edit', status: 'Complete', done: true },
            { id: 't-ui-2', text: 'Create reusable FrameBox component', type: 'file_edit', status: 'Running' },
            {
              id: 't-ui-3',
              text: 'Implement new "Conscious Stream" panel',
              type: 'file_edit',
              status: 'Pending',
              depends_on: ['t-ui-2'],
              sub_tasks: [
                { id: 't-ui-3a', text: 'Define stream data types', type: 'file_edit', status: 'Complete' },
                { id: 't-ui-3b', text: 'Create SSE service mock', type: 'file_edit', status: 'Awaiting-Approval' },
                { id: 't-ui-3c', text: 'Build rendering logic for thoughts', type: 'file_edit', status: 'Pending' },
              ]
            },
            { id: 't-ui-4', text: 'Fix rendering bug in task list', type: 'file_edit', status: 'Error' },
        ]
    },
    {
        id: 'tl2',
        name: 'Backend API',
        tasks: [
            { id: 't-be-1', text: 'Define data models', type: 'other', status: 'Complete', done: true },
            { id: 't-be-2', text: 'Implement authentication endpoint', type: 'other', status: 'Pending', done: false },
        ]
    }
];

export const getAllTaskLists = (apiKey: string): Promise<TaskList[]> => {
    console.log('Getting all task lists with key:', apiKey);
    return stub([...mockTaskLists]);
};

export const createTaskList = (apiKey: string, name: string): Promise<TaskList> => {
    console.log(`Creating task list "${name}" with key:`, apiKey);
    const newTaskList: TaskList = {
        id: `tl-${Date.now()}`,
        name,
        tasks: [],
    };
    mockTaskLists.unshift(newTaskList); // Add to beginning
    return stub(newTaskList);
};

export const renameTaskList = (apiKey: string, listId: string, newName: string): Promise<TaskList> => {
    console.log(`Renaming task list ${listId} to "${newName}" with key:`, apiKey);
    const listIndex = mockTaskLists.findIndex(l => l.id === listId);
    if (listIndex === -1) {
        return Promise.reject(new Error('List not found'));
    }
    mockTaskLists[listIndex].name = newName;
    return stub({ ...mockTaskLists[listIndex] });
};

export const deleteTaskList = (apiKey: string, listId: string): Promise<{ success: boolean }> => {
    console.log(`Deleting task list ${listId} with key:`, apiKey);
    const initialLength = mockTaskLists.length;
    mockTaskLists = mockTaskLists.filter(l => l.id !== listId);
    if (mockTaskLists.length === initialLength) {
        return Promise.reject(new Error('List not found'));
    }
    return stub({ success: true });
};

export const addTask = (apiKey: string, listId: string, text: string): Promise<Task> => {
    console.log(`Adding task "${text}" to list ${listId} with key:`, apiKey);
    const list = mockTaskLists.find(l => l.id === listId);
    if (!list) {
        return Promise.reject(new Error('List not found'));
    }
    const newTask: Task = {
        id: `t-${Date.now()}`,
        text,
        type: 'other',
        status: 'Pending',
        done: false,
    };
    list.tasks.push(newTask);
    return stub(newTask);
};

export const updateTask = (apiKey: string, taskId: string, updates: Partial<Task>): Promise<Task> => {
    console.log(`Updating task ${taskId} with`, updates, 'and key:', apiKey);
    
    const findAndUpdate = (tasks: Task[]): boolean => {
        for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].id === taskId) {
                tasks[i] = { ...tasks[i], ...updates };
                return true;
            }
            if (tasks[i].sub_tasks) {
                if (findAndUpdate(tasks[i].sub_tasks!)) {
                    return true;
                }
            }
        }
        return false;
    }

    for (const list of mockTaskLists) {
       if (findAndUpdate(list.tasks)) {
           // This is a bit of a lie since we mutated, but for mock it's fine.
           // A real implementation would return the actual updated task.
           return stub({ id: taskId, ...updates } as Task);
       }
    }
    return Promise.reject(new Error('Task not found'));
};

// --- NEW TASK MANAGEMENT FUNCTIONS ---
export const approveTask = (apiKey: string, taskId: string): Promise<void> => {
  console.log(`Approving task ${taskId}`);
  updateTask(apiKey, taskId, { status: 'Pending' });
  return stub(undefined, 200);
};

export const rejectTask = (apiKey: string, taskId: string): Promise<void> => {
    console.log(`Rejecting task ${taskId}`);
    updateTask(apiKey, taskId, { status: 'Error', result: 'Rejected by operator.' });
    return stub(undefined, 200);
};

export const cancelTask = (apiKey: string, taskId: string): Promise<void> => {
  console.log(`Canceling task ${taskId}`);
  updateTask(apiKey, taskId, { status: 'Error', result: 'Cancelled by operator.' });
  return stub(undefined, 200);
};

export const injectContextIntoTask = (apiKey: string, taskId: string, context: string): Promise<void> => {
  console.log(`Injecting context into task ${taskId}: "${context.substring(0, 50)}..."`);
  return stub(undefined, 300);
};

// --- NEW COGNITIVE STREAM ---
export const streamCognitiveLogs = (apiKey: string, prompt: string, onData: (data: Scratchpad) => void, onEnd: () => void) => {
    console.log("Starting cognitive log stream for prompt:", prompt);

    let mockStream: Scratchpad[] = [
        { thought: `User wants me to work on: "${prompt}". I should start by reading the main file.`, action: 'tool_call', tool_payload: { name: 'read_file', args: { path: '/src/app.tsx' } } },
    ];
    
    const finalAnswerText = `This is the final answer to your question about "${prompt}". Based on my analysis, the key finding is that the implementation should be straightforward.`;

    // If prompt suggests modification, add an edit_file step
    if (prompt.toLowerCase().includes('change') || prompt.toLowerCase().includes('update') || prompt.toLowerCase().includes('add') || prompt.toLowerCase().includes('modify')) {
        const newContent = `import React from 'react';\n\n// AI-MODIFIED at ${new Date().toLocaleTimeString()}\nconst App = () => <div>Hello World from an AI Agent!</div>;\n\nexport default App;`;
        
        mockStream.push({
            thought: "Okay, I've read the file. Now I will make the requested changes to demonstrate my file editing capability.",
            action: 'tool_call',
            tool_payload: {
                name: 'edit_file',
                args: {
                    path: '/src/app.tsx',
                    content: newContent
                }
            }
        });
        mockStream.push({ thought: "I have modified the file as requested. Now I will formulate the final answer.", action: 'final_answer' });
    } else {
        mockStream.push({ thought: "I have analyzed the file. I will now formulate the final answer.", action: 'final_answer' });
    }
    
    let streamIndex = 0;

    const intervalId = setInterval(() => {
        if (streamIndex >= mockStream.length) {
            onEnd();
            clearInterval(intervalId);
            return;
        }
        
        const event = mockStream[streamIndex];

        // If it's the final answer step, inject the dynamic text.
        if(event.action === 'final_answer') {
            onData({
                ...event,
                // We're just adding a text payload to the final answer for display
                tool_payload: { name: 'final_answer', args: { text: finalAnswerText } }
            });
        } else {
            onData(event);
        }

        streamIndex++;
    }, 1200);

    // Return a function to cancel the stream
    return () => {
        console.log("Cognitive log stream stopped.");
        clearInterval(intervalId);
    };
};

// --- Knowledge Panel Stubs ---
let mockKnowledgeBases: KnowledgeBase[] = [
    { id: 'kb_system_project', name: 'Live Project State', active: true, contentCount: 5, sources: [], system: true },
    { id: 'kb1', name: 'Project Source Code', active: false, contentCount: 152, sources: [{id: 's1', name: '/src/app.tsx', type: 'file'}, {id: 's2', name: '/src/index.ts', type: 'file'}] },
    { id: 'kb2', name: 'API Docs', active: false, contentCount: 45, sources: [{id: 's3', name: 'https://react.dev', type: 'url'}]},
    { id: 'kb3', name: 'WorldEvents', active: false, contentCount: 1212, sources: [] },
];

export const getKnowledgeBases = (apiKey: string): Promise<KnowledgeBase[]> => {
    // Ensure system KB is always active
    mockKnowledgeBases = mockKnowledgeBases.map(kb => kb.system ? {...kb, active: true} : kb);
    return stub([...mockKnowledgeBases]);
};

export const createKnowledgeBase = (apiKey: string, name: string): Promise<KnowledgeBase> => {
    const newKb: KnowledgeBase = { id: `kb${Date.now()}`, name, active: false, contentCount: 0, sources: [], system: false };
    mockKnowledgeBases.push(newKb);
    return stub(newKb);
};

export const activateKnowledgeBase = (apiKey: string, id: string): Promise<KnowledgeBase[]> => {
    const clickedKb = mockKnowledgeBases.find(kb => kb.id === id);
    if (clickedKb?.system) return stub([...mockKnowledgeBases]); // Do nothing for system KBs

    // Radio-button behavior for user KBs. System KBs retain their active state.
    mockKnowledgeBases = mockKnowledgeBases.map(kb => ({ 
        ...kb, 
        active: kb.system ? true : (kb.id === id)
    }));
    return stub([...mockKnowledgeBases]);
};

export const deleteKnowledgeBase = (apiKey: string, id: string): Promise<{ success: boolean }> => {
    const kbToDelete = mockKnowledgeBases.find(kb => kb.id === id);
    if (kbToDelete?.system) {
        console.log("Attempted to delete system knowledge base. Operation denied.");
        return stub({ success: false });
    }
    mockKnowledgeBases = mockKnowledgeBases.filter(kb => kb.id !== id);
    return stub({ success: true });
};


// --- Role Management Stubs ---
let mockRoles: Role[] = [
    {
        id: 'role_default_agent',
        name: 'General Agent',
        description: 'A general-purpose AI assistant capable of a wide range of tasks.',
        system_prompt: 'You are a helpful and versatile AI assistant. Your goal is to provide accurate, relevant, and concise information to the user. Adapt your communication style to the user\'s request.',
        knowledge_bases: [], // Empty by default
        memory_policy: 'scratchpad',
        promptTemplateId: 'p_default',
    },
    {
        id: 'role1',
        name: 'Developer',
        description: 'A helpful AI assistant for software development tasks.',
        system_prompt: 'You are an expert software developer. Provide concise, accurate, and code-heavy answers. Default to Python if no language is specified.',
        knowledge_bases: ['kb1', 'kb2'],
        memory_policy: 'scratchpad',
        promptTemplateId: 'p2',
    },
    {
        id: 'role2',
        name: 'Historian',
        description: 'An expert in world history.',
        system_prompt: 'You are a world-renowned historian. Provide detailed, narrative answers about historical events, citing your sources if possible.',
        knowledge_bases: ['kb3'],
        memory_policy: 'auto_commit'
    }
];

export const listRoles = (apiKey: string): Promise<Role[]> => {
    return stub([...mockRoles]);
};

export const getRoleById = (apiKey: string, id: string): Promise<Role | null> => {
    const role = mockRoles.find(r => r.id === id);
    return stub(role ? { ...role } : null);
};

export const createRole = (apiKey: string, roleData: Omit<Role, 'id'>): Promise<Role> => {
    const newRole: Role = { ...roleData, id: `role${Date.now()}` };
    mockRoles.push(newRole);
    return stub(newRole);
};

export const updateRole = (apiKey: string, roleData: Role): Promise<Role> => {
    const index = mockRoles.findIndex(r => r.id === roleData.id);
    if (index > -1) {
        mockRoles[index] = { ...roleData };
        return stub({ ...mockRoles[index] });
    }
    return Promise.reject(new Error('Role not found'));
};

export const deleteRole = (apiKey: string, id: string): Promise<{ success: boolean }> => {
    const initialLength = mockRoles.length;
    mockRoles = mockRoles.filter(r => r.id !== id);
    return stub({ success: mockRoles.length < initialLength });
};


// --- System Monitor Stubs ---
export const getSystemMetrics = (apiKey: string): Promise<SystemMetrics> => {
    return stub({
        cpu_usage: Math.random() * 80 + 10, // 10-90%
        memory_usage: Math.random() * 60 + 20, // 20-80%
        gpu_usage: Math.random() * 90 + 5, // 5-95%
        vram_usage: Math.random() * 70 + 15, // 15-85%
    }, 200);
}

const kpis: PerformanceKPIs = {
    total_inferences: 1243,
    avg_latency_ms: 874,
    digest_ops: 231,
    undigest_ops: 42,
};
export const getPerformanceKpis = (apiKey:string): Promise<PerformanceKPIs> => {
    // Increment inferences for a 'live' feel
    kpis.total_inferences++;
    return stub(kpis);
}

const mockLogs: BackendLogEntry[] = [
    { timestamp: new Date(Date.now() - 5000).toISOString(), level: 'INFO', message: 'Backend server started successfully.' },
    { timestamp: new Date(Date.now() - 4000).toISOString(), level: 'INFO', message: 'Loaded model: ggml-wizard-13b.bin' },
    { timestamp: new Date(Date.now() - 3000).toISOString(), level: 'WARN', message: 'GPU temperature high: 85°C' },
    { timestamp: new Date(Date.now() - 2500).toISOString(), level: 'DEBUG', message: 'Received inference request for prompt: "hello"' },
    { timestamp: new Date(Date.now() - 1000).toISOString(), level: 'ERROR', message: 'Failed to connect to database: Connection timed out.' },
];
export const getBackendLogs = (apiKey: string): Promise<BackendLogEntry[]> => {
    // In a real app this would be a stream or paginated
    if (Math.random() > 0.8) {
        mockLogs.push({ timestamp: new Date().toISOString(), level: 'INFO', message: 'Received health check ping.'})
    }
    return stub(mockLogs.slice(-20), 300); // return last 20 logs
}

// --- Versioning Stubs ---
let mockCommits: Commit[] = [
    { 
        sha: 'a1b2c3d4', 
        author: 'Raithe', 
        date: '2025-07-07 14:22:10', 
        message: 'feat: Add IngestionPanel for centralized RAG',
        diff: `--- a/components/RightSideContainer.tsx
+++ b/components/RightSideContainer.tsx
@@ -4,6 +4,7 @@
 import BrowserPanel from './panels/BrowserPanel';
 import KnowledgePanel from './panels/KnowledgePanel';
 import TextEditorPanel from './panels/TextEditorPanel';
+import IngestionPanel from './panels/IngestionPanel';
 
 const RightSideContainer: React.FC = () => {
   // ...
`
    },
    { 
        sha: 'd4e5f6g7', 
        author: 'Raithe', 
        date: '2025-07-07 11:05:33', 
        message: 'fix: Correct inference panel layout bug',
        diff: `--- a/components/panels/InferencePanel.tsx
+++ b/components/panels/InferencePanel.tsx
@@ -1,5 +1,5 @@
- <div className="flex-col">
+ <div className="flex-col h-full">
   // ...
`
    },
    { 
        sha: 'h8i9j0k1', 
        author: 'Raithe', 
        date: '2025-07-06 09:42:01', 
        message: 'Initial commit',
        diff: `+ import React from 'react';
+
+ const App = () => <div>Hello World</div>;
`
    },
];

export const getCommits = (apiKey: string): Promise<Commit[]> => {
    return stub([...mockCommits]);
};

export const createSnapshot = (apiKey: string, message: string): Promise<Commit> => {
    const newCommit: Commit = {
        sha: Math.random().toString(36).substring(2, 10),
        author: 'Raithe',
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        message,
        diff: `... diff for new snapshot ...`
    };
    mockCommits.unshift(newCommit);
    return stub(newCommit);
};

export const revertToCommit = (apiKey: string, sha: string): Promise<{success: boolean}> => {
    console.log(`Reverting project state to commit ${sha}`);
    return stub({ success: true });
}

// --- Project Tools Stubs ---
export const buildTreeMap = (apiKey: string): Promise<{ success: boolean; message: string }> => {
    console.log("Building tree map...");
    return stub({ success: true, message: "Tree map generated at `project_map.md`" });
};

export const dumpSourceFiles = (apiKey: string): Promise<{ success: boolean; message: string }> => {
    console.log("Dumping source files...");
    return stub({ success: true, message: "All source files dumped to `source_dump.txt`" });
};

export const listCondaEnvs = (apiKey: string): Promise<CondaEnv[]> => {
    return stub([
        { name: 'base', path: '/opt/conda', isActive: true },
        { name: 'py310', path: '/opt/conda/envs/py310', isActive: false },
        { name: 'ml', path: '/opt/conda/envs/ml', isActive: false },
    ]);
};

export const auditCondaEnv = (apiKey: string, envName: string): Promise<{ success: boolean; report: string }> => {
    console.log(`Auditing Conda env: ${envName}`);
    return stub({ success: true, report: `Audit of '${envName}':\n- Python version: 3.10.4\n- Pip packages: 152 installed\n- Conda packages: 45 installed\n- All checks passed.` });
};

export const auditSystemInfo = (apiKey: string): Promise<{ success: boolean; report: string }> => {
    return stub({ success: true, report: `System Info:\n- OS: Linux (x86_64)\n- CPU: 8 cores\n- Memory: 32 GB\n- GPU: NVIDIA RTX 4090` });
};

export const backupProject = (apiKey: string, paths: string[], exclusions: string[]): Promise<{ success: boolean; backup_path: string }> => {
    console.log(`Backing up ${paths.length} paths with ${exclusions.length} exclusions...`);
    return stub({ success: true, backup_path: `/_backups/project-${Date.now()}.tar.gz` });
};

let mockServerStatus: ServerStatusResponse = { isRunning: false, port: null };
export const getServerStatus = (apiKey: string): Promise<ServerStatusResponse> => {
    return stub({ ...mockServerStatus }, 100);
};

export const startServer = (apiKey: string, port: number, keepFile: boolean): Promise<ServerStatusResponse> => {
    console.log(`Starting server on port ${port}, keepFile=${keepFile}`);
    mockServerStatus = { isRunning: true, port: port };
    return stub({ ...mockServerStatus });
};

export const stopServer = (apiKey: string): Promise<ServerStatusResponse> => {
    console.log("Stopping server...");
    mockServerStatus = { isRunning: false, port: null };
    return stub({ ...mockServerStatus });
};

export const saveSessionLog = (apiKey: string): Promise<{ success: boolean, path: string }> => {
    const path = `/_logs/session-${Date.now()}.log`;
    console.log(`Saving session log to ${path}`);
    return stub({ success: true, path });
};

export const downloadLogsArchive = (apiKey: string): Promise<{ success: boolean, url: string }> => {
    const url = `/api/project/logs/archive-${Date.now()}.zip`;
    console.log(`Creating logs archive at ${url}`);
    return stub({ success: true, url });
};

export const getLogsAsText = (apiKey: string): Promise<{ logs: string }> => {
    const logText = mockLogs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    return stub({ logs: `--- All Logs ---\n${logText}` });
};