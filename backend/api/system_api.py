# File: backend/api/system_api.py
"""
System endpoints: metrics, status, logs, and decoupled model ops.

Notes:
- Uses absolute imports (backend.*) to avoid package import ambiguity.
- GPU stats via NVML if available; otherwise returns None for GPU/VRAM.
- Model status/reload are independent of project root.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import psutil
import structlog
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# --- Internal Service Imports (absolute for clarity) ---
from backend.config import Settings, get_settings
from backend.digestor_manager import DigestorManager
from backend.embedding import EmbeddingService
from backend.memory_layers import MemoryLayers
from backend.model_controller import ModelController
from backend.prompt_manager import PromptManager

# Import the global variable from orchestrator_api (unchanged)
from backend.api.orchestrator_api import _last_inference_details, _last_inference_lock

log = structlog.get_logger(__name__)
sys_api = APIRouter()

# --- Optional GPU Monitoring ---
try:
    import pynvml  # type: ignore

    pynvml.nvmlInit()
    HAS_NVML = True
    log.info("pynvml.initialized")
except Exception as e:
    HAS_NVML = False
    log.warning("pynvml.unavailable", error=str(e))


# ---------- Helpers ----------
def _get_gpu_info() -> Dict[str, Optional[float]]:
    """Fetch GPU + VRAM usage with NVML if available."""
    if not HAS_NVML:
        return {"gpu_usage": None, "vram_usage": None}
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        gpu_percent = float(utilization.gpu)
        vram_percent = float((memory.used / memory.total) * 100) if memory.total else 0.0
        return {"gpu_usage": gpu_percent, "vram_usage": vram_percent}
    except Exception as e:
        log.error("gpu.info.error", error=str(e))
        return {"gpu_usage": None, "vram_usage": None}


# ---------- Schemas ----------
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
    cpu_usage: float = Field(..., description="System-wide CPU utilization in %.")
    memory_usage: float = Field(..., description="System-wide RAM utilization in %.")
    gpu_usage: Optional[float] = Field(None, description="GPU utilization in % (if available).")
    vram_usage: Optional[float] = Field(None, description="GPU VRAM utilization in % (if available).")


class LLMStatus(BaseModel):
    status: str = Field(..., description="loaded | not_loaded | loading")
    model_path: str
    n_gpu_layers: Optional[int] = None
    context_window: Optional[int] = None
    name: Optional[str] = None


class EmbeddingStatus(BaseModel):
    model_name: str
    device: str
    is_primed: bool


class DigestorStatus(BaseModel):
    name: str
    vector_count: int
    collection_name: str
    persist_directory: str


class MemoryLayersStatus(BaseModel):
    working_memory_items: int
    periodic_flush_active: bool
    short_term_flush_threshold: int
    periodic_flush_interval: Optional[int]


class AssetStatus(BaseModel):
    loaded_prompts: int
    loaded_workflows: int
    loaded_roles: int


class BackendSettingsSnapshot(BaseModel):
    llm_model_path: str
    embedding_model_name: str
    rag_chunk_size: int
    rag_chunk_overlap: int
    short_term_flush_threshold: int
    periodic_flush_interval: Optional[int]
    api_key_prefix: str = Field("MIND_")


class SystemStatusResponse(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    app_uptime_seconds: float
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


class LLMReloadPayload(BaseModel):
    model_path: Optional[str] = None
    gpu_layers: Optional[int] = None
    context_window: Optional[int] = None


# ---------- DI helpers ----------
def get_model_controller(request: Request) -> ModelController:
    mc = getattr(request.app.state, "model_controller", None)
    if not mc:
        raise HTTPException(status_code=503, detail="Model controller not ready")
    return mc


def get_embedding_service(request: Request) -> EmbeddingService:
    svc = getattr(request.app.state, "embedding_service", None)
    if not svc:
        raise HTTPException(status_code=503, detail="Embedding service not ready")
    return svc


def get_digestor_manager(request: Request) -> DigestorManager:
    dm = getattr(request.app.state, "digestor_manager", None)
    if not dm:
        raise HTTPException(status_code=503, detail="Digestor manager not ready")
    return dm


def get_memory_layers(request: Request) -> MemoryLayers:
    ml = getattr(request.app.state, "memory_layers", None)
    if not ml:
        raise HTTPException(status_code=503, detail="Memory layers not ready")
    return ml


def get_prompt_manager(request: Request) -> PromptManager:
    pm = getattr(request.app.state, "prompt_manager", None)
    if not pm:
        raise HTTPException(status_code=503, detail="Prompt manager not ready")
    return pm


# ---------- Endpoints ----------
@sys_api.get("/system/metrics", response_model=SystemMetricsResponse, summary="Get detailed system resource metrics")
def get_system_metrics():
    gpu_info = _get_gpu_info()
    return SystemMetricsResponse(
        cpu_usage=psutil.cpu_percent(),
        memory_usage=psutil.virtual_memory().percent,
        gpu_usage=gpu_info["gpu_usage"],
        vram_usage=gpu_info["vram_usage"],
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
    process = psutil.Process(os.getpid())
    app_uptime = datetime.now() - datetime.fromtimestamp(process.create_time())

    metrics = get_system_metrics()

    llm_status = LLMStatus(
        status="loaded" if getattr(mc, "llm", None) else "not_loaded",
        model_path=str(settings.llm.model_path),
        n_gpu_layers=settings.llm.gpu_layers if getattr(mc, "llm", None) else None,
        context_window=settings.llm.context_window if getattr(mc, "llm", None) else None,
        name=getattr(mc, "model_name", None),
    )

    device_str = "N/A"
    if getattr(embed_svc, "model", None):
        # best-effort: handle .device or .device.type
        dev = getattr(embed_svc.model, "device", None)
        device_str = getattr(dev, "type", str(dev)) if dev is not None else "N/A"

    embedding_status = EmbeddingStatus(
        model_name=settings.embedding.model_name,
        device=device_str,
        is_primed=bool(getattr(embed_svc, "model", None)),
    )

    digestor_statuses: List[DigestorStatus] = []
    for name in dm.list_instances():
        try:
            instance = dm.get_instance(name)
            count = instance.store.count()
            persist_dir = "N/A"
            if hasattr(instance.store, "client") and hasattr(instance.store.client, "_persist_path"):
                persist_dir = getattr(instance.store.client, "_persist_path")
            digestor_statuses.append(
                DigestorStatus(
                    name=name,
                    vector_count=count,
                    collection_name=getattr(instance.store, "collection_name", "N/A"),
                    persist_directory=str(persist_dir),
                )
            )
        except Exception as e:
            log.warning("digestor.status.error", name=name, error=str(e))
            digestor_statuses.append(
                DigestorStatus(name=name, vector_count=-1, collection_name="Error", persist_directory="Error")
            )

    memory_layers_status = MemoryLayersStatus(
        working_memory_items=len(ml.working.list()),
        periodic_flush_active=(ml._periodic_task is not None and not ml._periodic_task.done()),
        short_term_flush_threshold=settings.short_term_flush_threshold,
        periodic_flush_interval=settings.periodic_flush_interval,
    )

    # Lightweight asset counts
    from backend.api.workflow_api import list_wfs
    from backend.api.roles_api import list_roles

    all_workflows = await list_wfs()
    all_prompts = pm.list_templates()
    all_roles = await list_roles()

    asset_status = AssetStatus(
        loaded_prompts=len(all_prompts),
        loaded_workflows=len(all_workflows),
        loaded_roles=len(all_roles),
    )

    backend_settings_snapshot = BackendSettingsSnapshot(
        llm_model_path=str(settings.llm.model_path),
        embedding_model_name=settings.embedding.model_name,
        rag_chunk_size=settings.chunk_size,
        rag_chunk_overlap=settings.chunk_overlap,
        short_term_flush_threshold=settings.short_term_flush_threshold,
        periodic_flush_interval=settings.periodic_flush_interval,
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
        backend_settings=backend_settings_snapshot,
    )


async def log_stream_generator(log_file_path: str):
    log.info("log.stream.connect", path=log_file_path)
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
        log.error("log.stream.not_found", path=log_file_path)
        yield f"data: ERROR: Log file not found at {log_file_path}\n\n"
    except Exception as e:
        log.error("log.stream.error", error=str(e))
        yield f"data: ERROR: Log stream failed: {str(e)}\n\n"
    finally:
        log.info("log.stream.disconnect", path=log_file_path)


@sys_api.get("/system/logs/stream", summary="Stream server logs via SSE")
async def stream_logs():
    return StreamingResponse(log_stream_generator("logs/app.log"), media_type="text/event-stream")


@sys_api.get("/system/kpis", response_model=PerformanceKPIs, summary="Get performance key performance indicators")
def get_performance_kpis():
    # placeholder KPIs (keep behavior from your current file)
    return PerformanceKPIs(
        total_inferences=1243 + int(100 * __import__("random").random()),
        avg_latency_ms=874.5,
        digest_ops=231,
        undigest_ops=42,
    )


@sys_api.get("/system/logs", response_model=List[BackendLogEntry], summary="Get recent backend log entries")
def get_recent_logs():
    log_file_path = "logs/app.log"
    recent: List[BackendLogEntry] = []
    try:
        if not os.path.exists(log_file_path):
            return []
        with open(log_file_path, "r") as f:
            lines = f.readlines()
            for line in lines[-50:]:
                try:
                    data = json.loads(line.strip())
                    ts = data.get("timestamp", datetime.utcnow().isoformat())
                    level = data.get("level", "UNKNOWN").upper()
                    msg = data.get("event", data.get("message", ""))
                    recent.append(BackendLogEntry(timestamp=ts, level=level, message=msg))
                except json.JSONDecodeError:
                    recent.append(
                        BackendLogEntry(timestamp=datetime.utcnow().isoformat(), level="RAW", message=line.strip())
                    )
                except Exception as e:
                    recent.append(
                        BackendLogEntry(
                            timestamp=datetime.utcnow().isoformat(),
                            level="ERROR",
                            message=f"Failed to parse log line: {line.strip()} - {e}",
                        )
                    )
    except Exception as e:
        log.error("logs.read.error", error=str(e))
        return [
            BackendLogEntry(
                timestamp=datetime.utcnow().isoformat(), level="ERROR", message=f"Failed to read logs: {str(e)}"
            )
        ]
    return recent


@sys_api.get("/orchestrator/last-inference-details", response_model=LastInferenceDetails, summary="Get details of the last LLM inference attempt")
def get_last_inference_details():
    with _last_inference_lock:
        return LastInferenceDetails(**_last_inference_details)


# ---------- NEW: Decoupled Model Ops ----------
@sys_api.get("/system/model/status", response_model=LLMStatus, summary="Get current LLM model status")
def model_status(
    settings: Settings = Depends(get_settings),
    mc: ModelController = Depends(get_model_controller),
):
    loaded = bool(getattr(mc, "llm", None))
    return LLMStatus(
        status="loaded" if loaded else "not_loaded",
        model_path=str(settings.llm.model_path),
        n_gpu_layers=settings.llm.gpu_layers if loaded else None,
        context_window=settings.llm.context_window if loaded else None,
        name=getattr(mc, "model_name", None),
    )


@sys_api.post("/system/model/reload", response_model=LLMStatus, summary="Reload LLM with optional overrides (decoupled from project root)")
def model_reload(
    request: Request,
    payload: LLMReloadPayload = Body(default_factory=LLMReloadPayload),
    settings: Settings = Depends(get_settings),
    mc: ModelController = Depends(get_model_controller),
):
    """
    Optional body:
      { "model_path": "models/YourModel.gguf", "gpu_layers": -1, "context_window": 8192 }
    If omitted, reloads using current settings.
    """
    # Resolve effective params
    eff_model_path = Path(payload.model_path).as_posix() if payload.model_path else str(settings.llm.model_path)
    eff_gpu_layers = payload.gpu_layers if payload.gpu_layers is not None else settings.llm.gpu_layers
    eff_context = payload.context_window if payload.context_window is not None else settings.llm.context_window

    try:
        # Preferred path: controller exposes reload(...)
        if hasattr(mc, "reload") and callable(getattr(mc, "reload")):
            mc.reload(model_path=eff_model_path, gpu_layers=eff_gpu_layers, context_window=eff_context)
            log.info("llm.reload.ok", path=eff_model_path, gpu_layers=eff_gpu_layers, ctx=eff_context)
        else:
            # Fallback: re-instantiate and prime a new controller, then replace app.state
            log.info("llm.reload.fallback_init", path=eff_model_path, gpu_layers=eff_gpu_layers, ctx=eff_context)

            try:
                # If settings.llm is a Pydantic model, model_copy is available
                llm_cfg = settings.llm.model_copy(
                    update={"model_path": eff_model_path, "gpu_layers": eff_gpu_layers, "context_window": eff_context}
                )
            except Exception:
                # Worst case: simple config object
                class _Cfg:
                    def __init__(self, p, g, c):
                        self.model_path = p
                        self.gpu_layers = g
                        self.context_window = c

                llm_cfg = _Cfg(eff_model_path, eff_gpu_layers, eff_context)

            new_mc = ModelController(llm_cfg)
            new_mc.prime()
            request.app.state.model_controller = new_mc  # swap in place
            mc = new_mc

    except Exception as e:
        log.error("llm.reload.error", error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Reload failed: {e}")

    # Return fresh status
    loaded = bool(getattr(mc, "llm", None))
    return LLMStatus(
        status="loaded" if loaded else "not_loaded",
        model_path=eff_model_path,
        n_gpu_layers=eff_gpu_layers if loaded else None,
        context_window=eff_context if loaded else None,
        name=getattr(mc, "model_name", None),
    )
