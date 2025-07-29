# File: src/mindshard_backend/main.py (Rock Solid Foundation)
import os
import uvicorn
import structlog # Import structlog for structured logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# --- Import Core Services ---
from mindshard_backend.config import Settings, get_settings
from mindshard_backend.model_controller import ModelController, ModelInitializationError
from mindshard_backend.embedding import EmbeddingService
from mindshard_backend.summarizer import SummarizerService
from mindshard_backend.vector_store import ChromaVectorStore # Only one import needed
from mindshard_backend.digestor import Digestor
from mindshard_backend.digestor_manager import DigestorManager
from mindshard_backend.memory_layers import MemoryLayers
from mindshard_backend.memory_manager import MemoryManager
from mindshard_backend.prompt_manager import PromptManager # Import PromptManager

# --- Import API Routers ---
from mindshard_backend.api.orchestrator_api import orchestrator_api
from mindshard_backend.api.system_api import sys_api
from mindshard_backend.api.project_tools_api import tools_api 
from mindshard_backend.api.workflow_api import wf_api
from mindshard_backend.api.rag_api import rag_api
from mindshard_backend.api.roles_api import roles_api
from mindshard_backend.api.knowledge_manager_api import knowledge_api
from mindshard_backend.api.memory_api import memory_api
from mindshard_backend.api.versioning_api import versioning_api
from mindshard_backend.api.prompt_api import prompt_api # Import prompt_api

log = structlog.get_logger(__name__) # Initialize logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.
    Initializes core services at startup and ensures graceful shutdown.
    Services are attached to app.state for dependency injection.
    """
    log.info("--- Lifespan: Starting up application services ---")
    settings = get_settings() # Load application settings

    # --- 1. Load Core ML Models (LLM, Embedding, Summarizer) ---
    log.info("Lifespan: Loading core ML models...")
    try:
        model_ctrl = ModelController(settings.llm)
        model_ctrl.prime() # Blocking call to load LLM
        app.state.model_controller = model_ctrl # Attach to app state

        embedding_svc = EmbeddingService(settings.embedding)
        embedding_svc.prime() # Blocking call to load embedding model
        app.state.embedding_service = embedding_svc # Attach to app state

        summarizer_svc = SummarizerService(settings.summarizer)
        summarizer_svc.prime() # Non-blocking (no-op) for isolated process summarizer
        app.state.summarizer_service = summarizer_svc # Attach to app state
        
    except ModelInitializationError as e:
        log.critical("Lifespan: Fatal error during ML model initialization. Application cannot start.", error=str(e))
        # Re-raise to prevent application startup if core models fail to load
        raise 
    except Exception as e:
        log.critical("Lifespan: An unexpected error occurred during ML model priming.", error=str(e))
        raise

    # --- 2. Initialize RAG and Memory Systems ---
    log.info("Lifespan: Initializing RAG and Memory systems...")
    dm = DigestorManager() # Manages multiple Digestor instances
    app.state.digestor_manager = dm # Attach to app state

    # Register core memory Digestor instances
    dm.register_instance(
        "conversations_log", 
        Digestor(store=ChromaVectorStore(persist_directory=f"{settings.embedding.chroma_dir}_conversations", collection_name="conversations_log"), embedder=embedding_svc.encode)
    )
    dm.register_instance(
        "personal_memory", 
        Digestor(store=ChromaVectorStore(persist_directory=f"{settings.embedding.chroma_dir}_personal_memory", collection_name="personal_memory"), embedder=embedding_svc.encode)
    )

    # Register agent skill "Cookbook" Digestor instances (for prompts, workflows, roles)
    log.info("Lifespan: Initializing agent skill 'Cookbooks' (vector stores for prompts, workflows, roles)...")
    dm.register_instance(
        "prompt_cookbook",
        Digestor(store=ChromaVectorStore(persist_directory=f"chroma_db_prompts", collection_name="prompt_cookbook"), embedder=embedding_svc.encode)
    )
    dm.register_instance(
        "workflow_cookbook",
        Digestor(store=ChromaVectorStore(persist_directory=f"chroma_db_workflows", collection_name="workflow_cookbook"), embedder=embedding_svc.encode)
    )
    dm.register_instance(
        "role_cookbook",
        Digestor(store=ChromaVectorStore(persist_directory=f"chroma_db_roles", collection_name="role_cookbook"), embedder=embedding_svc.encode)
    )
    
    # Initialize Memory Manager and Memory Layers
    mm = MemoryManager(settings.memory_jsonl) # Manages JSONL-based long-term memory
    app.state.memory_manager = mm # Attach to app state

    ml = MemoryLayers( # Orchestrates multi-tiered memory
        memory_mgr=mm,
        digestor=dm.get_instance("personal_memory"), # Personal memory digestor for long-term storage
        summarizer=summarizer_svc.summarize,
        periodic_flush_interval=settings.periodic_flush_interval, # Use configurable interval
        flush_threshold=settings.short_term_flush_threshold # Use configurable threshold
    )
    app.state.memory_layers = ml # Attach to app state

    # --- 3. Initialize Prompt Manager ---
    log.info("Lifespan: Initializing Prompt Manager (for template persistence)...")
    prompt_mgr = PromptManager() # Manages prompt templates (now SQLite-backed)
    app.state.prompt_manager = prompt_mgr # Attach to app state

    log.info("--- Lifespan: Startup complete. All services ready. ---")
    yield # Application is ready to receive requests
    log.info("--- Lifespan: Shutting down application services ---")

# Create the FastAPI application instance
app = FastAPI(
    title="Mindshard Backend API",
    description="The core backend for the MindshardAI application, providing services for memory, RAG, and intelligent workflows.",
    version=get_settings().app_version,
    lifespan=lifespan # Register the lifespan context manager
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware, 
    allow_origins=get_settings().cors_origins, # Use configurable CORS origins
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"]
)

# --- Register API Routers ---
# Each router handles a specific domain of API endpoints
app.include_router(orchestrator_api, prefix="/api", tags=["Orchestrator"])
app.include_router(sys_api, prefix="/api", tags=["System & Monitoring"])
app.include_router(tools_api, prefix="/api", tags=["Project Tools"])
app.include_router(rag_api, prefix="/api", tags=["RAG & Project Digestion"])
app.include_router(wf_api, prefix="/api", tags=["Workflows"])
app.include_router(roles_api, prefix="/api", tags=["Roles & Personas"])
app.include_router(knowledge_api, prefix="/api", tags=["Knowledge Management"])
app.include_router(memory_api, prefix="/api", tags=["Memory Management"])
app.include_router(versioning_api, prefix="/api", tags=["Versioning"])
app.include_router(prompt_api, prefix="/api", tags=["Prompt Management"]) # Registered prompt_api

def run_server():
    """
    Function to run the Uvicorn server.
    This is called when the script is executed directly or via `mindshard-api` entrypoint.
    """
    uvicorn.run(
        "mindshard_backend.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False, # Set to True for development to enable hot-reloading
        log_level=get_settings().log_level.lower() # Use configurable log level
    )

if __name__ == "__main__":
    run_server()


