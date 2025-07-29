# File: src/mindshard_backend/api/memory_api.py (Robust Memory Fetch)
"""
API endpoints for all memory-related operations, including the high-level
MemoryLayers service and low-level MemoryManager access.
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError # Import ValidationError
from typing import List, Optional

# Correct, direct, relative imports
from ..memory_layers import MemoryLayers
from ..memory_manager import MemoryManager, MemoryEntry, AddScratchRequest

log = structlog.get_logger(__name__)
# A single router for all memory-related endpoints
memory_api = APIRouter()

# --- Helper Dependencies ---
def get_memory_layers(request: Request) -> MemoryLayers:
    ml = getattr(request.app.state, 'memory_layers', None)
    if ml is None:
        log.error("Fatal: MemoryLayers service not found in app.state.")
        raise HTTPException(status_code=500, detail="Core service 'MemoryLayers' not initialized")
    return ml

def get_memory_manager(request: Request) -> MemoryManager:
    mm = getattr(request.app.state, 'memory_manager', None)
    if mm is None:
        log.error("Fatal: MemoryManager service not found in app.state.")
        raise HTTPException(status_code=500, detail="Core service 'MemoryManager' not initialized")
    return mm


# --- Pydantic Models specific to this API ---
class CommitTurnRequest(BaseModel):
    entry: MemoryEntry

class QueryResult(BaseModel):
    source: str
    entry: dict


# ===================================================================
# HIGH-LEVEL MEMORY LAYERS ENDPOINTS
# ===================================================================

@memory_api.get(
    "/layers/query_all",
    response_model=List[QueryResult],
    summary="Query all memory layers intelligently"
)
async def query_all(
    q: str,
    k_work: int = 2,
    k_long: int = 5,
    layers: MemoryLayers = Depends(get_memory_layers)
):
    """
    Query across working and long-term memory layers. This is the
    primary endpoint for intelligent context retrieval.
    """
    results = layers.query_all(q, k_work, k_long)
    return [
        QueryResult(
            source=r['source'],
            entry=(r['entry'].model_dump(mode='json') if hasattr(r['entry'], 'model_dump') else r['entry'])
        ) for r in results
    ]

@memory_api.post(
    "/layers/commit_turn",
    status_code=202,
    summary="Commit an interaction to memory"
)
async def commit_turn(
    req: CommitTurnRequest,
    layers: MemoryLayers = Depends(get_memory_layers)
):
    """
    Commit a new turn (e.g., a user prompt and AI response) into working memory.
    This may trigger an automatic flush to long-term memory.
    """
    await layers.acommit_turn(req.entry)
    return {"status": "committed"}


# ===================================================================
# LOW-LEVEL MEMORY MANAGER ENDPOINTS (For Debugging & Direct Control)
# ===================================================================

@memory_api.post("/memory/scratch", response_model=MemoryEntry, summary="Add entry directly to scratchpad")
async def add_scratch(
    req: AddScratchRequest,
    memory: MemoryManager = Depends(get_memory_manager)
):
    """Adds a single entry to the in-memory working scratchpad without triggering a flush."""
    entry = MemoryEntry(
        type=req.type,
        content=req.content,
        metadata=req.metadata or {}
    )
    memory.add_scratch(entry)
    log.info("Added entry to scratchpad", entry_id=entry.id, entry_type=entry.type)
    return entry

@memory_api.get("/memory/scratch", response_model=List[MemoryEntry], summary="Get all scratchpad entries")
async def get_scratch(memory: MemoryManager = Depends(get_memory_manager)):
    """Retrieves all entries currently in the in-memory working scratchpad."""
    return memory.get_scratch()

@memory_api.delete("/memory/scratch", status_code=204, summary="Clear all scratchpad entries")
async def clear_scratch(memory: MemoryManager = Depends(get_memory_manager)):
    """Deletes all entries from the scratchpad without committing them to long-term memory."""
    count = len(memory.get_scratch())
    memory.clear_scratch()
    log.info("Scratchpad cleared", cleared_count=count)
    return None

@memory_api.get("/memory/long_term", response_model=List[MemoryEntry], summary="Get long-term memory entries")
async def get_long_term(
    limit: Optional[int] = 100,
    memory: MemoryManager = Depends(get_memory_manager)
):
    """
    Retrieves entries from the persistent, long-term memory file.
    Includes robust error handling for file reading and data validation.
    
    Args:
        limit: If provided, returns only the last N entries.
    """
    try:
        return memory.get_long_term(limit=limit)
    except FileNotFoundError:
        log.warning("Long-term memory file not found, returning empty list.")
        return []
    except (json.JSONDecodeError, ValidationError) as e:
        log.error("Long-term memory file corrupted or invalid format", error=e)
        raise HTTPException(status_code=500, detail=f"Long-term memory data corrupted: {e}")
    except Exception as e:
        log.error("Failed to retrieve long-term memory due to unexpected error", error=e)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve long-term memory: {e}")


