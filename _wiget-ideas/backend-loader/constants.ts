
import { LoadingGroup, LoadingStatus } from './types';
import { cloneDeep } from 'lodash';

const initialLoadingGroups: LoadingGroup[] = [
  {
    name: 'Database Initialization',
    items: [
      { id: 'db_prompts', label: 'Prompts Database', status: LoadingStatus.PENDING, endLog: `db_file=PosixPath('data/mindshard.db')`, level: 1 },
      { id: 'db_workflows', label: 'Workflows Database', status: LoadingStatus.PENDING, endLog: `for workflows db_file=PosixPath('data/mindshard.db')`, level: 1 },
      { id: 'db_roles', label: 'Roles Database', status: LoadingStatus.PENDING, endLog: `for roles db_file=PosixPath('data/mindshard.db')`, level: 1 },
    ],
  },
  {
    name: 'Core Services',
    items: [
      { id: 'server_proc', label: 'Server Process', status: LoadingStatus.PENDING, endLog: 'Started server process', level: 1 },
      { id: 'app_lifespan', label: 'Application Lifespan', status: LoadingStatus.PENDING, endLog: '--- Lifespan: Starting up application services ---', level: 1 },
    ],
  },
  {
    name: 'Machine Learning Models',
    items: [
      { id: 'ml_models_init', label: 'Load ML Models', status: LoadingStatus.PENDING, endLog: 'Lifespan: Loading core ML models...', level: 1 },
      { id: 'llm_prime', label: 'LLM', status: LoadingStatus.PENDING, startLog: 'Priming LLM: loading model into memory...', endLog: 'LLM has been successfully primed', level: 2 },
      { id: 'embedding_prime', label: 'Embedding Model', status: LoadingStatus.PENDING, startLog: 'Priming embedding model...', endLog: `Embedding model 'all-MiniLM-L6-v2' has been successfully primed.`, level: 2 },
      { id: 'summarizer_prime', label: 'Summarizer Service', status: LoadingStatus.PENDING, startLog: 'SummarizerService initialized.', endLog: 'SummarizerService.prime() is a no-op.', level: 2 },
    ],
  },
  {
    name: 'Data & Memory Systems',
    items: [
      { id: 'rag_mem_init', label: 'RAG & Memory', status: LoadingStatus.PENDING, endLog: 'Lifespan: Initializing RAG and Memory systems...', level: 1 },
      { id: 'digestor_convo', label: 'Conversation Digestor', status: LoadingStatus.PENDING, endLog: `Registered Digestor instance 'conversations_log'`, level: 2 },
      { id: 'digestor_mem', label: 'Personal Memory Digestor', status: LoadingStatus.PENDING, endLog: `Registered Digestor instance 'personal_memory'`, level: 2 },
    ],
  },
   {
    name: 'Agent Skills & Persistence',
    items: [
      { id: 'cookbooks_init', label: 'Cookbooks', status: LoadingStatus.PENDING, endLog: `Lifespan: Initializing agent skill 'Cookbooks'`, level: 1 },
      { id: 'cookbook_prompts', label: 'Prompt Cookbook', status: LoadingStatus.PENDING, endLog: `Registered Digestor instance 'prompt_cookbook'`, level: 2 },
      { id: 'cookbook_workflows', label: 'Workflow Cookbook', status: LoadingStatus.PENDING, endLog: `Registered Digestor instance 'workflow_cookbook'`, level: 2 },
      { id: 'cookbook_roles', label: 'Role Cookbook', status: LoadingStatus.PENDING, endLog: `Registered Digestor instance 'role_cookbook'`, level: 2 },
      { id: 'prompt_manager', label: 'Prompt Manager', status: LoadingStatus.PENDING, startLog: 'Lifespan: Initializing Prompt Manager', endLog: 'PromptManager initialized.', level: 1 },
    ],
  },
  {
    name: 'Finalization',
    items: [
      { id: 'startup_complete', label: 'Startup Sequence', status: LoadingStatus.PENDING, endLog: '--- Lifespan: Startup complete. All services ready. ---', level: 1 },
      { id: 'server_ready', label: 'Server Ready', status: LoadingStatus.PENDING, endLog: 'Uvicorn running on http://127.0.0.1:8000', level: 1 },
    ],
  },
];

export const getInitialLoadingState = () => cloneDeep(initialLoadingGroups);

export const LOG_STREAM = [
  "2025-07-25 19:51:35 [info     ] SQLite database initialized or already exists for prompts db_file=PosixPath('data/mindshard.db')",
  "2025-07-25 19:51:35 [info     ] SQLite database initialized or already exists for workflows db_file=PosixPath('data/mindshard.db')",
  "2025-07-25 19:51:35 [info     ] SQLite database initialized or already exists for roles db_file=PosixPath('data/mindshard.db')",
  "INFO:     Started server process [4385]",
  "INFO:     Waiting for application startup.",
  "2025-07-25 19:51:35 [info     ] --- Lifespan: Starting up application services ---",
  "2025-07-25 19:51:35 [info     ] Lifespan: Loading core ML models...",
  "2025-07-25 19:51:35 [info     ] ModelController initialized. Call `prime()` to load the model.",
  "2025-07-25 19:51:35 [info     ] Priming LLM: loading model into memory... settings={'model_path': PosixPath('/home/raithe/MindshardAPI/models/Phi-3.1-mini-128k-instruct-Q4_K_M.gguf'), 'gpu_layers': -1, 'context_window': 4096}",
  "2025-07-25 19:51:41 [info     ] LLM has been successfully primed and is ready for inference.",
  "2025-07-25 19:51:41 [info     ] EmbeddingService initialized. Call `prime()` to load the model.",
  "2025-07-25 19:51:41 [info     ] Priming embedding model...     settings={'model_name': 'all-MiniLM-L6-v2', 'dim': 384, 'vector_backend': 'chroma', 'chroma_dir': PosixPath('chroma_db'), 'faiss_index_path': PosixPath('.db/faiss.index')}",
  "2025-07-25 19:51:41 [info     ] Using device 'cpu' for embedding model.",
  "2025-07-25 19:51:42 [info     ] Embedding model 'all-MiniLM-L6-v2' has been successfully primed.",
  "2025-07-25 19:51:42 [info     ] SummarizerService initialized. Model will be loaded on-demand in a separate process.",
  "2025-07-25 19:51:42 [info     ] SummarizerService.prime() is a no-op. Models are loaded in a child process.",
  "2025-07-25 19:51:42 [info     ] Lifespan: Initializing RAG and Memory systems...",
  "2025-07-25 19:51:42 [info     ] DigestorManager initialized",
  "2025-07-25 19:51:43 [info     ] Registered Digestor instance 'conversations_log'",
  "2025-07-25 19:51:43 [info     ] Registered Digestor instance 'personal_memory'",
  "2025-07-25 19:51:43 [info     ] Lifespan: Initializing agent skill 'Cookbooks' (vector stores for prompts, workflows, roles)...",
  "2025-07-25 19:51:43 [info     ] Registered Digestor instance 'prompt_cookbook'",
  "2025-07-25 19:51:43 [info     ] Registered Digestor instance 'workflow_cookbook'",
  "2025-07-25 19:51:43 [info     ] Registered Digestor instance 'role_cookbook'",
  "2025-07-25 19:51:43 [info     ] Lifespan: Initializing Prompt Manager (for template persistence)...",
  "2025-07-25 19:51:43 [info     ] PromptManager initialized. Using SQLite for persistence.",
  "2025-07-25 19:51:43 [info     ] --- Lifespan: Startup complete. All services ready. ---",
  "INFO:     Application startup complete.",
  "INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)",
];
