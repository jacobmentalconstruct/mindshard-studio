# File: src/mindshard_backend/api/prompt_api.py (Corrected Import)
"""
API Endpoints for the Prompt Engineering Co-pilot.
"""
from typing import List, Dict, Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

# Correct relative imports
from ..prompt_manager import (
    PromptManager, PromptTemplate, PromptVersion,
    # Removed: PROMPT_DB, # PROMPT_DB no longer exists in prompt_manager.py
)
from ..embedding import EmbeddingService
from ..memory_layers import MemoryLayers
from pydantic import BaseModel, Field # Pydantic models specific to the API

log = structlog.get_logger(__name__)
prompt_api = APIRouter()

# --- API-Specific Pydantic Models ---
class PromptTemplateCreate(BaseModel):
    slug: str = Field(..., description="A unique, URL-safe identifier (e.g., 'commit-message-generator').", pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str
    content: str
    description: Optional[str] = None
    tags: List[str] = []
    author: str = "system"

class PromptTemplateUpdate(BaseModel):
    content: str
    author: str = "system"

class SearchTemplatesRequest(BaseModel):
    query: str
    top_k: int = Field(5, ge=1, le=20)

class TemplateAnalysis(BaseModel):
    undeclared_variables: List[str]

# --- Helper Dependencies ---
def get_pm(request: Request) -> PromptManager:
    return request.app.state.prompt_manager

def get_embedding_service(request: Request) -> EmbeddingService:
    return request.app.state.embedding_service

# --- API Endpoints ---
@prompt_api.post("/prompts", response_model=PromptTemplate, status_code=201, summary="Create a new prompt template")
def create_prompt(
    req: PromptTemplateCreate,
    pm: PromptManager = Depends(get_pm),
    embed_svc: EmbeddingService = Depends(get_embedding_service)
):
    try:
        return pm.add_template(req, embedder=embed_svc.encode)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@prompt_api.get("/prompts", response_model=List[PromptTemplate], summary="List all prompt templates")
def get_all_prompts(pm: PromptManager = Depends(get_pm)):
    return pm.list_templates()

@prompt_api.get("/prompts/{slug}", response_model=PromptTemplate, summary="Get a template by its slug")
def get_prompt_by_slug(slug: str, pm: PromptManager = Depends(get_pm)):
    try:
        return pm.get_template_by_slug(slug)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
        
@prompt_api.post("/prompts/{slug}/versions", response_model=PromptTemplate, summary="Add a new version to a template")
def create_new_version(
    slug: str,
    req: PromptTemplateUpdate,
    pm: PromptManager = Depends(get_pm),
    embed_svc: EmbeddingService = Depends(get_embedding_service)
):
    try:
        template = pm.get_template_by_slug(slug) # Check existence first
        return pm.add_version(template.id, req.content, req.author, embed_svc.encode)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create new version: {e}")


@prompt_api.post("/prompts/semantic-search", response_model=List[PromptTemplate], summary="Find templates by semantic similarity")
def search_templates(
    req: SearchTemplatesRequest,
    pm: PromptManager = Depends(get_pm),
    embed_svc: EmbeddingService = Depends(get_embedding_service)
):
    return pm.semantic_search(req.query, top_k=req.top_k, embedder=embed_svc.encode)

@prompt_api.post("/prompts/analyze", response_model=TemplateAnalysis, summary="Analyze a template to find its variables")
def analyze_template_endpoint(req: Dict[str, str]):
    content = req.get("content")
    if content is None:
        raise HTTPException(status_code=422, detail="Missing 'content' field in request body.")
    try:
        # Use the static method from the manager class
        return PromptManager.analyze_template(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


