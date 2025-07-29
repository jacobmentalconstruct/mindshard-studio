# File: src/mindshard_backend/api/workflow_api.py (Updated for SQLite Persistence)
"""
🔀 API for creating, managing, and using complex, multi-step workflows.

This module implements CRUD operations for workflows and provides endpoints
for building prompts from templates and suggesting tasks within a workflow context.
Workflows are now persisted to a local SQLite database for robustness.
"""

import json
import uuid
import structlog
import re
import sqlite3
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

# Correct, direct, relative imports for internal services
from ..prompt_manager import PromptManager
from ..memory_layers import MemoryLayers
from ..model_controller import ModelController

log = structlog.get_logger(__name__)
wf_api = APIRouter()

# --- Pydantic Models ---
class WorkflowStep(BaseModel):
    """Represents a single step within a multi-step workflow."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str
    response: Optional[str] = None
    roleId: Optional[str] = None # Optional ID of a role to use for this step
    promptTemplateId: Optional[str] = None # Optional ID of a prompt template to use

class WorkflowCreate(BaseModel):
    """Schema for creating a new workflow."""
    name: str
    steps: List[WorkflowStep] = Field(default_factory=list)

class WorkflowUpdate(BaseModel):
    """Schema for updating an existing workflow."""
    name: Optional[str] = None
    steps: Optional[List[WorkflowStep]] = None

class Workflow(BaseModel):
    """Full schema for a workflow, including its unique ID."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    steps: List[WorkflowStep]

class BuildWorkflowRequest(BaseModel):
    """Request schema for building a meta-prompt from a template."""
    template_id: str
    context_vars: Dict[str, Any] = Field(default_factory=dict)

class BuildWorkflowResponse(BaseModel):
    """Response schema for building a meta-prompt."""
    meta_prompt: str
    execution_trace: List[Dict[str, Any]] = Field(default_factory=list) # Placeholder for future use

class SuggestTasksRequest(BaseModel):
    """Request schema for suggesting next tasks for a workflow."""
    workflow_context: str
    max_tasks: int = Field(5, ge=1, le=10)

class TaskSuggestion(BaseModel):
    """Schema for a single task suggestion."""
    type: str
    payload: Dict[str, Any]

class SuggestTasksResponse(BaseModel):
    """Response schema for task suggestions."""
    recommended_tasks: List[TaskSuggestion]

# --- SQLite Database Setup ---
DB_FILE = Path("data/mindshard.db") # Centralized SQLite database file
_db_lock = threading.Lock() # Lock for thread-safe database access

def _get_db_connection():
    """Establishes and returns a new SQLite database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # Return rows as dict-like objects
    return conn

def _init_db():
    """Initializes the SQLite database schema if tables do not exist."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True) # Ensure data directory exists
    with _db_lock:
        conn = None
        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    steps_json TEXT NOT NULL, -- Storing steps as JSON string
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()
            log.info("SQLite database initialized or already exists for workflows", db_file=DB_FILE)
        except sqlite3.Error as e:
            log.error("Failed to initialize SQLite database for workflows", error=e)
            raise # Re-raise to halt app startup if DB init fails
        finally:
            if conn:
                conn.close()

# Initialize the database schema on module import
_init_db()

# --- Dependency Injection Helpers ---
def get_pm(request: Request) -> PromptManager: 
    """Retrieves the PromptManager instance from the FastAPI app state."""
    return request.app.state.prompt_manager

def get_mc(request: Request) -> ModelController: 
    """Retrieves the ModelController instance from the FastAPI app state."""
    return request.app.state.model_controller

def get_ml(request: Request) -> MemoryLayers: 
    """Retrieves the MemoryLayers instance from the FastAPI app state."""
    return request.app.state.memory_layers

# --- Workflow CRUD Endpoints ---

@wf_api.post("/workflows", response_model=Workflow, status_code=201, summary="Create a new workflow")
async def create_wf(req: WorkflowCreate):
    """
    Creates a new workflow with a unique ID and stores it persistently in SQLite.
    """
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            wf_id = str(uuid.uuid4())
            created_at = datetime.utcnow().isoformat()
            
            # Serialize steps list to JSON string for storage
            steps_json = json.dumps([step.model_dump(mode='json') for step in req.steps])

            cursor.execute(
                "INSERT INTO workflows (id, name, steps_json, created_at) VALUES (?, ?, ?, ?)",
                (wf_id, req.name, steps_json, created_at)
            )
            conn.commit()
            new_workflow = Workflow(id=wf_id, name=req.name, steps=req.steps, created_at=datetime.fromisoformat(created_at))
            log.info("Workflow created in DB", workflow_id=wf_id, name=req.name)
            return new_workflow
        except sqlite3.Error as e:
            log.error("Failed to create workflow in DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@wf_api.get("/workflows", response_model=List[Workflow], summary="List all workflows")
async def list_wfs():
    """
    Retrieves a list of all stored workflows from SQLite.
    """
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, steps_json, created_at FROM workflows")
            workflows_data = cursor.fetchall()
            
            workflows = []
            for row in workflows_data:
                try:
                    # Deserialize steps_json back to list of WorkflowStep objects
                    steps = [WorkflowStep.model_validate(step_data) for step_data in json.loads(row['steps_json'])]
                    workflows.append(Workflow(
                        id=row['id'],
                        name=row['name'],
                        steps=steps,
                        created_at=datetime.fromisoformat(row['created_at'])
                    ))
                except (json.JSONDecodeError, ValidationError) as e:
                    log.error("Failed to parse workflow steps or validate model from DB", workflow_id=row['id'], error=e)
                    # Optionally, skip this workflow or return a partial one
                    continue 
            log.info("Workflows listed from DB", count=len(workflows))
            return workflows
        except sqlite3.Error as e:
            log.error("Failed to list workflows from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@wf_api.get("/workflows/{wf_id}", response_model=Workflow, summary="Get a specific workflow")
async def get_wf(wf_id: str):
    """
    Retrieves a specific workflow by its unique ID from SQLite.
    Raises 404 if the workflow is not found.
    """
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, steps_json, created_at FROM workflows WHERE id = ?", (wf_id,))
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Workflow not found")
            
            try:
                steps = [WorkflowStep.model_validate(step_data) for step_data in json.loads(row['steps_json'])]
                workflow = Workflow(
                    id=row['id'],
                    name=row['name'],
                    steps=steps,
                    created_at=datetime.fromisoformat(row['created_at'])
                )
                log.info("Workflow retrieved from DB", workflow_id=wf_id)
                return workflow
            except (json.JSONDecodeError, ValidationError) as e:
                log.error("Failed to parse workflow steps or validate model from DB", workflow_id=wf_id, error=e)
                raise HTTPException(status_code=500, detail=f"Data corruption error for workflow {wf_id}: {e}")
        except sqlite3.Error as e:
            log.error("Failed to get workflow from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@wf_api.put("/workflows/{wf_id}", response_model=Workflow, summary="Update a workflow")
async def update_wf(wf_id: str, req: WorkflowUpdate):
    """
    Updates an existing workflow identified by its ID in SQLite.
    Raises 404 if the workflow is not found.
    """
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            
            # Check if workflow exists first
            cursor.execute("SELECT id, name, steps_json, created_at FROM workflows WHERE id = ?", (wf_id,))
            existing_row = cursor.fetchone()
            if not existing_row:
                raise HTTPException(status_code=404, detail="Workflow not found")

            # Reconstruct existing workflow to apply updates cleanly via Pydantic
            existing_steps = [WorkflowStep.model_validate(step_data) for step_data in json.loads(existing_row['steps_json'])]
            existing_workflow = Workflow(
                id=existing_row['id'],
                name=existing_row['name'],
                steps=existing_steps,
                created_at=datetime.fromisoformat(existing_row['created_at'])
            )

            # Apply updates from request model
            update_data = req.model_dump(exclude_unset=True)
            updated_workflow = existing_workflow.model_copy(update=update_data)
            
            # Serialize updated steps back to JSON string
            updated_steps_json = json.dumps([step.model_dump(mode='json') for step in updated_workflow.steps])

            cursor.execute(
                "UPDATE workflows SET name = ?, steps_json = ? WHERE id = ?",
                (updated_workflow.name, updated_steps_json, wf_id)
            )
            conn.commit()
            log.info("Workflow updated in DB", workflow_id=wf_id)
            return updated_workflow
        except sqlite3.Error as e:
            log.error("Failed to update workflow in DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        except (json.JSONDecodeError, ValidationError) as e:
            log.error("Failed to parse/validate workflow data during update", workflow_id=wf_id, error=e)
            raise HTTPException(status_code=500, detail=f"Data validation error during update: {e}")
        finally:
            conn.close()

@wf_api.delete("/workflows/{wf_id}", status_code=204, summary="Delete a workflow")
async def delete_wf(wf_id: str):
    """
    Deletes a workflow identified by its ID from SQLite.
    Returns 204 No Content on success. Raises 404 if the workflow is not found.
    """
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM workflows WHERE id = ?", (wf_id,))
            conn.commit()
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Workflow not found")
            log.info("Workflow deleted from DB", workflow_id=wf_id)
            return None # 204 response must not have a body
        except sqlite3.Error as e:
            log.error("Failed to delete workflow from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

# --- Advanced Workflow Tool Endpoints ---

@wf_api.post("/workflows/build-prompt", response_model=BuildWorkflowResponse, summary="Build a meta-prompt from a template")
async def build_workflow_prompt(
    req: BuildWorkflowRequest,
    pm: PromptManager = Depends(get_pm),
    ml: MemoryLayers = Depends(get_ml)
):
    """
    Constructs a dynamic meta-prompt by rendering a specified prompt template
    with provided context variables and memory layers.
    """
    log.info("Building prompt from template", slug=req.template_id)
    try:
        # Assuming PromptManager has a render_template method that takes these arguments
        # This part depends on the actual implementation of PromptManager.render_template
        # If pm.render_template is not yet implemented, this will raise an AttributeError.
        rendered_prompt = pm.render_template(
            slug=req.template_id,
            memory_layers=ml,
            user_vars=req.context_vars
        )
        return BuildWorkflowResponse(meta_prompt=rendered_prompt)
    except (KeyError, ValueError) as e:
        log.error("Failed to build workflow prompt: template not found or invalid", error=str(e), slug=req.template_id)
        raise HTTPException(status_code=404, detail=str(e))
    except AttributeError as e:
        log.error("PromptManager.render_template method missing or not callable", error=str(e))
        raise HTTPException(status_code=500, detail=f"Backend service error: {e}. Prompt rendering not fully implemented.")
    except Exception as e:
        log.exception("An unexpected error occurred during workflow prompt building")
        raise HTTPException(status_code=500, detail=f"Workflow prompt building error: {e}")


@wf_api.post("/workflows/suggest-tasks", response_model=SuggestTasksResponse, summary="Suggest next tasks for a workflow")
async def suggest_tasks(
    req: SuggestTasksRequest,
    mc: ModelController = Depends(get_mc),
):
    """
    Generates a list of suggested next tasks for a given workflow context
    using the LLM. The LLM is prompted to return a JSON array of tasks.
    """
    system_prompt = (
        "You are an expert workflow planning assistant. Based on the provided context, "
        f"suggest up to {req.max_tasks} concrete next tasks to accomplish the goal. "
        "Your output must be a valid JSON array of objects, where each object has a 'type' "
        "(e.g., 'search', 'file_edit', 'tool_call') and a 'payload' "
        "(a dictionary with necessary parameters)."
    )
    full_prompt = f"{system_prompt}\n\n[Workflow Context]:\n{req.workflow_context}\n\n[JSON Array of Tasks]:"

    try:
        response_str = await run_in_threadpool(mc.infer, full_prompt, max_new_tokens=1024)
        
        # Robust JSON extraction using regex, looking for array or object structure
        json_match = re.search(r'\[.*\]', response_str, re.DOTALL) # Look for array structure
        if not json_match:
            # Fallback to object if LLM incorrectly returns a single object for a single task
            json_match = re.search(r'\{.*\}', response_str, re.DOTALL)
            if json_match:
                # If it's a single object, wrap it in an array for consistent parsing
                response_str = f"[{json_match.group(0)}]"
                log.warning("LLM returned single object for task suggestion, wrapping in array.", raw_output=response_str)
            else:
                raise ValueError("No JSON array or object found in the LLM response for task suggestions.")
        else:
            response_str = json_match.group(0) # Use the matched array string

        tasks = json.loads(response_str)
        if not isinstance(tasks, list):
            raise ValueError("LLM did not return a list.")
        
        # Validate each item in the list against TaskSuggestion schema for data integrity
        validated_tasks = [TaskSuggestion.model_validate(task) for task in tasks]
        
        return SuggestTasksResponse(recommended_tasks=validated_tasks)
    except (json.JSONDecodeError, ValueError, ValidationError) as e:
        log.error("Task suggestion LLM output was invalid or validation failed", error=str(e), raw_output=response_str)
        raise HTTPException(status_code=500, detail=f"Failed to parse task suggestions from LLM: {e}")
    except Exception as e:
        log.exception("An unexpected error occurred during task suggestion")
        raise HTTPException(status_code=500, detail=f"Task suggestion error: {e}")


