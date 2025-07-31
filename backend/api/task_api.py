# File: src/backend/api/task_api.py (Updated for Persistent Storage)
"""
🗂️ API for hierarchical task management.
"""

import uuid
import structlog
import json
from datetime import datetime
from typing import List, Dict, Optional, Literal
from pathlib import Path
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

log = structlog.get_logger(__name__)
tasks_api = APIRouter()

# --- Pydantic Models ---
TaskStatus = Literal["Pending", "Running", "Complete", "Error", "Awaiting-Approval"]

class Task(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    text: str
    status: TaskStatus = "Pending"
    depends_on: List[str] = Field(default_factory=list, description="List of Task IDs this task depends on.")
    sub_tasks: List['Task'] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    result: Optional[str] = None

# For Pydantic V2, rebuilds the model to handle the forward reference in `sub_tasks`
Task.model_rebuild()

class TaskList(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    name: str
    tasks: List[Task] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TaskListCreate(BaseModel):
    name: str

class TaskUpdate(BaseModel):
    text: Optional[str] = None
    status: Optional[TaskStatus] = None
    result: Optional[str] = None

# --- File-based Persistence for TASK_DB ---
TASK_DB_FILE = Path("data/task_db.json") # Define a path for persistence
_task_db_lock = threading.Lock() # Lock for thread-safe file access
_TASK_DB: Dict[str, TaskList] = {} # In-memory cache of the database

def _load_task_db() -> None:
    """Loads the task database from a JSON file."""
    with _task_db_lock:
        if not TASK_DB_FILE.exists():
            TASK_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
            TASK_DB_FILE.write_text(json.dumps({})) # Create empty file if it doesn't exist
            log.info("Task DB file created", path=TASK_DB_FILE)
            return

        try:
            raw_data = json.loads(TASK_DB_FILE.read_text())
            _TASK_DB.clear()
            for list_id, list_data in raw_data.items():
                try:
                    # Use model_validate for Pydantic V2 to parse from dict
                    _TASK_DB[list_id] = TaskList.model_validate(list_data)
                except ValidationError as e:
                    log.error("Failed to validate TaskList from file", list_id=list_id, error=e)
                    # Skip this entry, or handle corruption as needed
            log.info("Task DB loaded successfully", path=TASK_DB_FILE, num_lists=len(_TASK_DB))
        except (json.JSONDecodeError, FileNotFoundError) as e:
            log.error("Failed to load Task DB from file, initializing empty DB", path=TASK_DB_FILE, error=e)
            _TASK_DB.clear() # Ensure it's empty if loading fails

def _save_task_db() -> None:
    """Saves the current task database to a JSON file."""
    with _task_db_lock:
        try:
            # Use model_dump for Pydantic V2 to convert to dict
            data_to_save = {list_id: task_list.model_dump(mode='json') for list_id, task_list in _TASK_DB.items()}
            TASK_DB_FILE.write_text(json.dumps(data_to_save, indent=4))
            log.info("Task DB saved successfully", path=TASK_DB_FILE, num_lists=len(_TASK_DB))
        except Exception as e:
            log.error("Failed to save Task DB to file", path=TASK_DB_FILE, error=e)

# Load the database once when the module is imported
_load_task_db()

# --- Dependency for getting the DB ---
def get_task_db(request: Request) -> Dict[str, TaskList]:
    """Provides the in-memory task database (which is backed by file persistence)."""
    # In a real FastAPI app, this dependency might also trigger a reload
    # if the file changed externally, or simply return the current state.
    # For simplicity, we assume _TASK_DB is kept up-to-date by this module.
    return _TASK_DB

# --- Helper to find a task anywhere in the hierarchy ---
def find_task_in_list(task_id: str, tasks: List[Task]) -> Optional[Task]:
    """Recursively finds a task by ID within a list of tasks and their sub-tasks."""
    for task in tasks:
        if task.id == task_id:
            return task
        found = find_task_in_list(task_id, task.sub_tasks)
        if found:
            return found
    return None

# --- API Endpoints ---
@tasks_api.post("/tasks", response_model=TaskList, status_code=201, summary="Create a new task list")
async def create_task_list(
    req: TaskListCreate,
    db: Dict[str, TaskList] = Depends(get_task_db)
):
    """Creates a new, empty task list."""
    new_list = TaskList(name=req.name)
    db[new_list.id] = new_list
    _save_task_db() # Save changes to disk
    log.info("Created new task list", name=req.name, list_id=new_list.id)
    return new_list

@tasks_api.get("/tasks", response_model=List[TaskList], summary="Get all task lists")
async def get_all_task_lists(db: Dict[str, TaskList] = Depends(get_task_db)):
    """Retrieves all existing task lists."""
    return list(db.values())

@tasks_api.get("/tasks/{list_id}", response_model=TaskList, summary="Get a specific task list")
async def get_task_list(list_id: str, db: Dict[str, TaskList] = Depends(get_task_db)):
    """Retrieves a specific task list by its ID."""
    if list_id not in db:
        raise HTTPException(status_code=404, detail="Task list not found")
    return db[list_id]

@tasks_api.post("/tasks/{list_id}/tasks", response_model=Task, summary="Add a task to a list")
async def add_task_to_list(
    list_id: str,
    task_text: str,
    parent_task_id: Optional[str] = None,
    db: Dict[str, TaskList] = Depends(get_task_db)
):
    """Adds a new task to a list, optionally as a sub-task of another."""
    if list_id not in db:
        raise HTTPException(status_code=404, detail="Task list not found")
    
    new_task = Task(text=task_text)
    task_list = db[list_id]

    if parent_task_id:
        parent_task = find_task_in_list(parent_task_id, task_list.tasks)
        if not parent_task:
            raise HTTPException(status_code=404, detail=f"Parent task {parent_task_id} not found in list {list_id}")
        parent_task.sub_tasks.append(new_task)
        log.info("Added sub-task to parent", list_id=list_id, parent_id=parent_task_id, task_id=new_task.id)
    else:
        task_list.tasks.append(new_task)
        log.info("Added root task to list", list_id=list_id, task_id=new_task.id)
        
    _save_task_db() # Save changes to disk
    return new_task

@tasks_api.patch("/tasks/{list_id}/tasks/{task_id}", response_model=Task, summary="Update a specific task")
async def update_task(
    list_id: str,
    task_id: str,
    updates: TaskUpdate,
    db: Dict[str, TaskList] = Depends(get_task_db)
):
    """Updates a task's status, text, or result."""
    if list_id not in db:
        raise HTTPException(status_code=404, detail="Task list not found")
    
    task_to_update = find_task_in_list(task_id, db[list_id].tasks)
    if not task_to_update:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found in list {list_id}")
    
    # Use model_dump for Pydantic V2
    update_data = updates.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task_to_update, key, value)
    
    task_to_update.updated_at = datetime.utcnow()
    _save_task_db() # Save changes to disk
    log.info("Updated task", list_id=list_id, task_id=task_id, updates=update_data)
    return task_to_update

@tasks_api.delete("/tasks/{list_id}", status_code=204, summary="Delete an entire task list")
async def delete_task_list(list_id: str, db: Dict[str, TaskList] = Depends(get_task_db)):
    """Deletes a task list and all its tasks."""
    if list_id not in db:
        raise HTTPException(status_code=404, detail="Task list not found")
    
    del db[list_id]
    _save_task_db() # Save changes to disk
    log.info("Deleted task list", list_id=list_id)
    return None
