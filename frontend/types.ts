


export interface Scratchpad {
  thought: string;
  action: 'tool_call' | 'final_answer';
  tool_payload?: {
    name: string;
    args: Record<string, any>;
  };
}

export enum PanelType {
  Editor = "Editor",
  PromptManager = "Prompt Manager",
  Memory = "Memory",
  Browser = "Browser",
  Knowledge = "Knowledge",
  SystemMonitor = "System Monitor",
  Ingestion = "Ingestion",
  Versioning = "Versioning",
  ProjectTools = "Project Tools",
}

export interface FileNode {
  id: string;
  name:string;
  type: 'file' | 'directory';
  children?: FileNode[];
  path: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface MemoryEntry {
  id:string;
  content: string;
  timestamp: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  text: string;
  type: 'infer' | 'search' | 'file_edit' | 'other';
  status: 'Pending' | 'Running' | 'Complete' | 'Error' | 'Awaiting-Approval';
  result?: string;
  done?: boolean;
  depends_on?: string[];
  sub_tasks?: Task[];
}

export interface TaskList {
    id: string;
    name: string;
    tasks: Task[];
}

export interface WorkflowStep {
    id: string;
    prompt: string;
    response: string;
    roleId?: string;
    promptTemplateId?: string;
}

export interface Workflow {
    id: string;
    name: string;
    steps: WorkflowStep[];
}

export interface KnowledgeBase {
    id: string;
    name: string;
    active: boolean;
    contentCount: number;
    sources?: { id: string, name: string, type: 'url' | 'file' }[];
    system?: boolean;
}

export type StreamEntry = 
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'thought'; text: string }
  | { id: string; type: 'tool_call'; tool_name: string; tool_args: Record<string, any> }
  | { id: string; type: 'final_answer'; text: string }
  | { id: string; type: 'error', text: string }
  | { id: string; type: 'full_scratchpad', scratchpad: Scratchpad };


export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  explanation?: Explanation;
  entry: StreamEntry;
}

export interface Explanation {
    context: { text: string; source: string }[];
}

export interface CognitionStatus {
  stm_buffer_size: number;
  stm_buffer_threshold: number;
  digestor_status: 'Idle' | 'Digesting' | 'Error';
  loaded_knowledge_bases: string[];
}

export interface SystemStatus {
    model_status: 'loaded' | 'unloaded' | 'loading';
    retriever_status: 'active' | 'inactive';
    active_kb_name?: string | null;
    cognition?: CognitionStatus;
}

// --- New Types for Monitoring ---

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface BackendLogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}

export interface SystemMetrics {
    cpu_usage: number; // percentage
    memory_usage: number; // percentage
    gpu_usage?: number; // percentage, optional
    vram_usage?: number; // percentage, optional
}

export interface PerformanceKPIs {
    total_inferences: number;
    avg_latency_ms: number;
    digest_ops: number;
    undigest_ops: number;
}

export interface RAGChunk {
    source: string;
    score: number;
    text: string;
}

export interface ContextSource {
    source: string;
    content: string;
}

export interface InspectionData {
    original_prompt: string;
    editor_context: ContextSource | null;
    memory_context: ContextSource | null;
    rag_chunks: RAGChunk[];
}

// --- New Role Management Types ---
export type MemoryPolicy = 'scratchpad' | 'auto_commit';

export interface Role {
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    knowledge_bases: string[]; // Array of KB IDs
    memory_policy: MemoryPolicy;
    promptTemplateId?: string;
}

// --- New Versioning Types ---
export interface Commit {
  sha: string;
  author: string;
  date: string;
  message: string;
  diff: string;
}

// --- New OCR Types ---
export interface OcrOptions {
    lang: string;
    layout: 'auto' | 'preserve';
    dpi: number;
    engine: 'tesseract' | 'google_vision';
}

// --- New Editor Types ---
export interface EditorTab {
  path: string; // Unique identifier. For new files, "Untitled-1", etc.
  content: string;
  isDirty: boolean;
  isNew?: boolean; // To differentiate unsaved new files
  
  // For media files and OCR
  isMedia: boolean;
  viewMode: 'editor' | 'preview';
  mediaContent: string | null; // base64 data URL for preview
}

// --- New Project Tools Types ---
export interface CondaEnv {
  name: string;
  path: string;
  isActive: boolean;
}

export interface ServerStatusResponse {
  isRunning: boolean;
  port: number | null;
}

export interface ServerLogEntry {
  timestamp: string;
  message: string;
}

export interface ContextSelection {
    use_rag: boolean;
}