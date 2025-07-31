# File: src/backend/api/system_api.py (Corrected)

import asyncio
import psutil
import structlog
import os 
import json 
from datetime import datetime
from typing import List, Dict, Optional, Any
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse

# --- Internal Service Imports ---
from ..config import get_settings, Settings
from ..model_controller import ModelController
from ..embedding import EmbeddingService 
from ..digestor_manager import DigestorManager
from ..memory_layers import MemoryLayers
from ..prompt_manager import PromptManager 

# Import the global variable from orchestrator_api
from .orchestrator_api import _last_inference_details, _last_inference_lock 

# Initialize logger at the top of the module
log = structlog.get_logger(__name__)

# --- Optional GPU Monitoring ---
try:
    import pynvml # type: ignore
    pynvml.nvmlInit()
    HAS_NVML = True
    log.info("pynvml initialized. GPU monitoring enabled.") 
except (ImportError, pynvml.NVMLError) as e:
    HAS_NVML = False
    log.warning(f"pynvml not available or failed to initialize ({e}). GPU monitoring disabled.") 

sys_api = APIRouter()

# --- Helper to get GPU info ---
def _get_gpu_info() -> Dict[str, Optional[float]]:
    """Fetches GPU and VRAM usage using pynvml if available."""
    if not HAS_NVML:
        return {"gpu_usage": None, "vram_usage": None}
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0) 
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        
        gpu_percent = utilization.gpu
        vram_percent = (memory.used / memory.total) * 100 if memory.total > 0 else 0
        
        return {"gpu_usage": float(gpu_percent), "vram_usage": float(vram_percent)}
    except Exception as e:
        log.error("Failed to get GPU info via pynvml", error=str(e))
        return {"gpu_usage": None, "vram_usage": None}

# --- Pydantic Models for a Structured, Self-Documenting API Response ---
class PerformanceKPIs(BaseModel):
    total_inferences: int
    avg_latency_ms: float
    digest_ops: int
    undigest_ops: int

class BackendLogEntry(BaseModel):
    timestamp: str
    level: str
    message: str
    
class SystemMetricsResponse(BaseModel):
    cpu_usage: float = Field(..., description="Current system-wide CPU utilization percentage.")
    memory_usage: float = Field(..., description="Current system-wide RAM utilization percentage.")
    gpu_usage: Optional[float] = Field(None, description="Current system-wide GPU utilization percentage (if available).")
    vram_usage: Optional[float] = Field(None, description="Current GPU VRAM utilization percentage (if available).")

class LLMStatus(BaseModel):
    status: str = Field(..., description="Status of the LLM (e.g., 'loaded', 'not_loaded', 'loading').")
    model_path: str = Field(..., description="Path to the loaded LLM model file.")
    n_gpu_layers: Optional[int] = Field(None, description="Number of LLM layers offloaded to GPU.")
    context_window: Optional[int] = Field(None, description="Context window size of the loaded LLM.")

class EmbeddingStatus(BaseModel):
    model_name: str = Field(..., description="Name of the embedding model.")
    device: str = Field(..., description="Device used by the embedding model (e.g., 'cpu', 'cuda').")
    is_primed: bool = Field(..., description="True if the embedding model is loaded and ready.")

class DigestorStatus(BaseModel):
    name: str = Field(..., description="Name of the Digestor instance (e.g., 'personal_memory', 'prompt_cookbook').")
    vector_count: int = Field(..., description="Number of vectors/documents in this Digestor's store.")
    collection_name: str = Field(..., description="Underlying vector store collection name.")
    persist_directory: str = Field(..., description="Path where this Digestor's vector store data is persisted.")

class MemoryLayersStatus(BaseModel):
    working_memory_items: int = Field(..., description="Number of entries in the in-memory scratchpad.")
    periodic_flush_active: bool = Field(..., description="True if the periodic memory flush task is running.")
    short_term_flush_threshold: int = Field(..., description="Configured threshold for short-term memory flush.")
    periodic_flush_interval: Optional[int] = Field(None, description="Configured interval for periodic flush in seconds.")

class AssetStatus(BaseModel):
    loaded_prompts: int = Field(..., description="Number of prompt templates loaded/available.")
    loaded_workflows: int = Field(..., description="Number of workflows loaded/available.")
    loaded_roles: int = Field(..., description="Number of roles loaded/available.") 

class BackendSettingsSnapshot(BaseModel):
    llm_model_path: str
    embedding_model_name: str
    rag_chunk_size: int
    rag_chunk_overlap: int
    short_term_flush_threshold: int
    periodic_flush_interval: Optional[int]
    api_key_prefix: str = Field("MIND_", description="Environment variable prefix for backend settings.")

class SystemStatusResponse(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of this status snapshot.")
    app_uptime_seconds: float = Field(..., description="Seconds since the application started.")
    metrics: SystemMetricsResponse
    llm: LLMStatus
    embedding: EmbeddingStatus 
    digestors: List[DigestorStatus]
    memory_layers: MemoryLayersStatus
    assets: AssetStatus
    backend_settings: BackendSettingsSnapshot 

class LastInferenceDetails(BaseModel):
    llm_prompt_used: Optional[str] = None
    raw_llm_response: Optional[str] = None
    parsed_scratchpad_json: Optional[str] = None
    json_parsing_error: Optional[str] = None
    timestamp: Optional[str] = None

# --- Helper Dependencies for Clean Injection ---
def get_model_controller(request: Request) -> ModelController:
    return request.app.state.model_controller

def get_embedding_service(request: Request) -> EmbeddingService: 
    return request.app.state.embedding_service

def get_digestor_manager(request: Request) -> DigestorManager:
    return request.app.state.digestor_manager
    
def get_memory_layers(request: Request) -> MemoryLayers:
    return request.app.state.memory_layers

def get_prompt_manager(request: Request) -> PromptManager: 
    return request.app.state.prompt_manager

# --- API Endpoints ---
@sys_api.get("/system/metrics", response_model=SystemMetricsResponse, summary="Get detailed system resource metrics")
def get_system_metrics():
    """Provides real-time CPU, Memory, and (if available) GPU usage."""
    gpu_info = _get_gpu_info()
    return SystemMetricsResponse(
        cpu_usage=psutil.cpu_percent(),
        memory_usage=psutil.virtual_memory().percent,
        gpu_usage=gpu_info["gpu_usage"],
        vram_usage=gpu_info["vram_usage"]
    )
    
@sys_api.get("/system/status", response_model=SystemStatusResponse, summary="Get a full system status snapshot")
async def get_system_status( 
    request: Request,
    settings: Settings = Depends(get_settings),
    mc: ModelController = Depends(get_model_controller),
    embed_svc: EmbeddingService = Depends(get_embedding_service), 
    dm: DigestorManager = Depends(get_digestor_manager),
    ml: MemoryLayers = Depends(get_memory_layers),
    pm: PromptManager = Depends(get_prompt_manager), 
):
    """Provides a comprehensive, macroscopic snapshot of the system's current status."""
    
    process = psutil.Process(os.getpid())
    app_uptime = datetime.now() - datetime.fromtimestamp(process.create_time())

    metrics = get_system_metrics() 

    llm_status = LLMStatus(
        status="loaded" if mc.llm else "not_loaded",
        model_path=str(settings.llm.model_path),
        n_gpu_layers=settings.llm.gpu_layers if mc.llm else None,
        context_window=settings.llm.context_window if mc.llm else None
    )

    embedding_status = EmbeddingStatus(
        model_name=settings.embedding.model_name,
        device=embed_svc.model.device.type if embed_svc.model else "N/A",
        is_primed=embed_svc.model is not None
    )

    digestor_statuses = []
    for name in dm.list_instances():
        try:
            instance = dm.get_instance(name)
            count = instance.store.count()
            digestor_statuses.append(DigestorStatus(
                name=name, 
                vector_count=count,
                collection_name=getattr(instance.store, 'collection_name', 'N/A'), 
                persist_directory=getattr(instance.store, 'client', None)._persist_path if hasattr(instance.store, 'client') and hasattr(instance.store.client, '_persist_path') else 'N/A', 
            ))
        except Exception as e:
            log.warning("Could not retrieve digestor status", name=name, error=str(e))
            digestor_statuses.append(DigestorStatus(name=name, vector_count=-1, collection_name='Error', persist_directory='Error')) 

    memory_layers_status = MemoryLayersStatus(
        working_memory_items=len(ml.working.list()),
        periodic_flush_active=(ml._periodic_task is not None and not ml._periodic_task.done()),
        short_term_flush_threshold=settings.short_term_flush_threshold,
        periodic_flush_interval=settings.periodic_flush_interval
    )

    from .workflow_api import list_wfs 
    from .roles_api import list_roles 

    all_workflows = await list_wfs()
    all_prompts = pm.list_templates() 
    all_roles = await list_roles()
    
    asset_status = AssetStatus(
        loaded_prompts=len(all_prompts), 
        loaded_workflows=len(all_workflows),
        loaded_roles=len(all_roles) 
    )

    backend_settings_snapshot = BackendSettingsSnapshot(
        llm_model_path=str(settings.llm.model_path),
        embedding_model_name=settings.embedding.model_name,
        rag_chunk_size=settings.chunk_size,
        rag_chunk_overlap=settings.chunk_overlap,
        short_term_flush_threshold=settings.short_term_flush_threshold,
        periodic_flush_interval=settings.periodic_flush_interval
    )

    return SystemStatusResponse(
        timestamp=datetime.utcnow(),
        app_uptime_seconds=app_uptime.total_seconds(),
        metrics=metrics,
        llm=llm_status,
        embedding=embedding_status,
        digestors=digestor_statuses,
        memory_layers=memory_layers_status,
        assets=asset_status,
        backend_settings=backend_settings_snapshot
    )

async def log_stream_generator(log_file_path: str):
    """Yields new lines from the log file as they are written."""
    log.info("Client connected to log stream", path=log_file_path)
    try:
        os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
        with open(log_file_path, "a+") as f: 
            f.seek(0, 2) 
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5) 
                    continue
                yield f"data: {line.strip()}\n\n"
    except FileNotFoundError:
        log.error("Log file not found for streaming.", path=log_file_path)
        yield f"data: ERROR: Log file not found at {log_file_path}\n\n"
    except Exception as e:
        log.error("Error during log streaming", error=str(e))
        yield f"data: ERROR: Log stream failed: {str(e)}\n\n"
    finally:
        log.info("Client disconnected from log stream", path=log_file_path)

@sys_api.get("/system/logs/stream", summary="Stream server logs via SSE")
async def stream_logs():
    """
    Streams server logs in real-time using Server-Sent Events (SSE).
    Connect to this endpoint from a UI to see live log updates.
    """
    log_file_path = "logs/app.log" 
    return StreamingResponse(
        log_stream_generator(log_file_path),
        media_type="text/event-stream"
    )
    
@sys_api.get("/system/kpis", response_model=PerformanceKPIs, summary="Get performance key performance indicators")
def get_performance_kpis():
    """Returns a mock of key performance indicators. A real implementation would use a metrics collector."""
    return PerformanceKPIs(
        total_inferences=1243 + int(100 * __import__("random").random()), 
        avg_latency_ms=874.5,
        digest_ops=231,
        undigest_ops=42
    )

@sys_api.get("/system/logs", response_model=List[BackendLogEntry], summary="Get recent backend log entries")
def get_recent_logs():
    """
    Returns the last few log entries from the actual application log file.
    This provides a snapshot of recent backend activity.
    """
    log_file_path = "logs/app.log"
    recent_logs: List[BackendLogEntry] = []
    try:
        if not os.path.exists(log_file_path):
            return [] 

        with open(log_file_path, "r") as f:
            lines = f.readlines()
            for line in lines[-50:]: 
                try:
                    log_data = json.loads(line.strip())
                    timestamp = log_data.get("timestamp", datetime.utcnow().isoformat())
                    level = log_data.get("level", "UNKNOWN").upper()
                    message = log_data.get("event", log_data.get("message", "No message"))
                    recent_logs.append(BackendLogEntry(timestamp=timestamp, level=level, message=message))
                except json.JSONDecodeError:
                    recent_logs.append(BackendLogEntry(timestamp=datetime.utcnow().isoformat(), level="RAW", message=line.strip()))
                except Exception as e:
                    recent_logs.append(BackendLogEntry(timestamp=datetime.utcnow().isoformat(), level="ERROR", message=f"Failed to parse log line: {line.strip()} - {e}"))
    except Exception as e:
        log.error("Failed to read recent logs from file", error=str(e))
        return [BackendLogEntry(timestamp=datetime.utcnow().isoformat(), level="ERROR", message=f"Failed to read logs: {str(e)}")]
    
    return recent_logs

@sys_api.get("/orchestrator/last-inference-details", response_model=LastInferenceDetails, summary="Get details of the last LLM inference attempt")
def get_last_inference_details():
    """
    Retrieves the prompt, raw response, and parsing outcome of the most recent LLM inference call
    made by the orchestrator. This is for debugging the LLM's output.
    """
    with _last_inference_lock:
        return LastInferenceDetails(**_last_inference_details)
