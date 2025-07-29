# File: src/mindshard_backend/api/meta_tools_api.py (Corrected and Final)
"""
🛠️ A toolbox of advanced meta-prompting utilities.
"""
import json
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

# --- Correct, direct, relative imports ---
from ..model_controller import ModelController
from ..prompt_manager import PromptManager

log = structlog.get_logger(__name__)
meta_tools_api = APIRouter()

# --- Pydantic Models ---
class RefinePromptRequest(BaseModel):
    prompt: str
    feedback: str

class RefinePromptResponse(BaseModel):
    refined_prompt: str

class VariationRequest(BaseModel):
    template_id: str
    num_variations: int = Field(3, ge=1, le=10)
    context_vars: Optional[Dict[str, Any]] = None

class VariationResponse(BaseModel):
    variations: List[str]

# --- Helper Dependencies ---
def get_mc(request: Request) -> ModelController:
    return request.app.state.model_controller

def get_pm(request: Request) -> PromptManager:
    return request.app.state.prompt_manager

# --- Endpoints ---
@meta_tools_api.post(
    "/meta-tools/refine-prompt",
    response_model=RefinePromptResponse,
    summary="Refine a prompt using feedback"
)
async def refine_prompt(
    req: RefinePromptRequest,
    mc: ModelController = Depends(get_mc),
):
    """Given an original prompt and user feedback, generates an improved prompt."""
    meta_prompt = (
        "You are a world-class prompt engineer. Given an original prompt and feedback, "
        "provide an improved, refined version of the original prompt that incorporates the feedback."
    )
    full_prompt = f"{meta_prompt}\n\n[Original Prompt]:\n{req.prompt}\n\n[Feedback]:\n{req.feedback}\n\n[Refined Prompt]:"

    try:
        refined = await run_in_threadpool(mc.infer, full_prompt, max_new_tokens=len(req.prompt) + 200)
        return RefinePromptResponse(refined_prompt=refined.strip())
    except Exception as e:
        log.exception("Error during prompt refinement")
        raise HTTPException(status_code=500, detail=f"Refinement error: {e}")

@meta_tools_api.post(
    "/meta-tools/generate-variations",
    response_model=VariationResponse,
    summary="Generate variations of a prompt template"
)
async def generate_variations(
    req: VariationRequest,
    mc: ModelController = Depends(get_mc),
    pm: PromptManager = Depends(get_pm),
):
    """Generates creative variations of a given prompt template."""
    try:
        # The prompt manager uses `get_template_by_slug`
        tpl = pm.get_template_by_slug(req.template_id)
        original_prompt = tpl.latest.content
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template with slug '{req.template_id}' not found.")

    meta_prompt = (
        "You are a creative assistant. "
        f"Generate {req.num_variations} innovative and diverse variations of the following prompt. "
        "Return the result as a valid JSON array of strings. Example: [\"variation 1\", \"variation 2\"]"
    )

    prompt_with_context = original_prompt
    if req.context_vars:
        prompt_with_context += f"\n\n--- Example Context ---\n{json.dumps(req.context_vars, indent=2)}"

    full_prompt = f"{meta_prompt}\n\n[Original Prompt]:\n{prompt_with_context}\n\n[JSON Array of Variations]:"

    try:
        response = await run_in_threadpool(mc.infer, full_prompt, max_new_tokens=1024)
        variations = json.loads(response)
        if not isinstance(variations, list) or not all(isinstance(v, str) for v in variations):
            raise ValueError("LLM did not return a valid JSON array of strings.")
        return VariationResponse(variations=variations)
    except (json.JSONDecodeError, ValueError) as e:
        log.error("Variation generation LLM output was invalid", error=str(e), raw_output=response)
        raise HTTPException(status_code=500, detail=f"Failed to parse variations from LLM: {e}")
    except Exception as e:
        log.exception("An unexpected error occurred during variation generation")
        raise HTTPException(status_code=500, detail=f"Variation generation error: {e}")
