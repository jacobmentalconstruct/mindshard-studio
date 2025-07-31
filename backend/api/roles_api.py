# File: src/backend/api/roles_api.py (Updated for SQLite Persistence)
"""
API endpoints for creating, managing, and using Roles (personas).

Roles are now persisted to a local SQLite database for robustness.
"""
import uuid
import structlog
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError

log = structlog.get_logger(__name__)
roles_api = APIRouter()

# --- Pydantic Schemas for Roles ---
class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    system_prompt: str
    knowledge_bases: List[str] = Field(default_factory=list)
    memory_policy: str = Field("scratchpad", pattern="^(scratchpad|auto_commit)$")

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    knowledge_bases: Optional[List[str]] = None
    memory_policy: Optional[str] = None

class Role(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    system_prompt: str
    knowledge_bases: List[str]
    memory_policy: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- SQLite Database Setup ---
DB_FILE = Path("data/mindshard.db") # Centralized SQLite database file
_db_lock = threading.Lock() # Lock for thread-safe database access

def _get_db_connection():
    """Establishes and returns a new SQLite database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # Return rows as dict-like objects
    return conn

def _init_db():
    """Initializes the SQLite database schema for roles if the table does not exist."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True) # Ensure data directory exists
    with _db_lock:
        conn = None
        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS roles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE, -- Role names should be unique
                    description TEXT,
                    system_prompt TEXT NOT NULL,
                    knowledge_bases_json TEXT NOT NULL, -- Storing as JSON string
                    memory_policy TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()
            log.info("SQLite database initialized or already exists for roles", db_file=DB_FILE)
        except sqlite3.Error as e:
            log.error("Failed to initialize SQLite database for roles", error=e)
            raise # Re-raise to halt app startup if DB init fails
        finally:
            if conn:
                conn.close()

# Initialize the database schema on module import
_init_db()

# --- API Endpoints ---
@roles_api.post("/roles", response_model=Role, status_code=201, summary="Create a new role")
async def create_role(req: RoleCreate):
    """Creates a new role/persona for the agent and stores it persistently in SQLite."""
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            # Check for existing role name
            cursor.execute("SELECT id FROM roles WHERE name = ?", (req.name,))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail=f"A role with the name '{req.name}' already exists.")
            
            role_id = str(uuid.uuid4())
            created_at = datetime.utcnow().isoformat()
            
            # Serialize knowledge_bases list to JSON string for storage
            knowledge_bases_json = json.dumps(req.knowledge_bases)

            cursor.execute(
                """INSERT INTO roles (id, name, description, system_prompt, knowledge_bases_json, memory_policy, created_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (role_id, req.name, req.description, req.system_prompt, knowledge_bases_json, req.memory_policy, created_at)
            )
            conn.commit()
            new_role = Role(
                id=role_id, 
                name=req.name, 
                description=req.description, 
                system_prompt=req.system_prompt, 
                knowledge_bases=req.knowledge_bases, 
                memory_policy=req.memory_policy,
                created_at=datetime.fromisoformat(created_at)
            )
            log.info("Role created in DB", role_id=new_role.id, role_name=new_role.name)
            return new_role
        except sqlite3.IntegrityError as e:
            # Catch unique constraint violation if name is not unique (though checked above)
            raise HTTPException(status_code=409, detail=f"Database integrity error: {e}")
        except sqlite3.Error as e:
            log.error("Failed to create role in DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@roles_api.get("/roles", response_model=List[Role], summary="List all available roles")
async def list_roles():
    """Retrieves a list of all configured roles from SQLite."""
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, description, system_prompt, knowledge_bases_json, memory_policy, created_at FROM roles")
            roles_data = cursor.fetchall()
            
            roles = []
            for row in roles_data:
                try:
                    # Deserialize knowledge_bases_json back to list of strings
                    knowledge_bases = json.loads(row['knowledge_bases_json'])
                    roles.append(Role(
                        id=row['id'],
                        name=row['name'],
                        description=row['description'],
                        system_prompt=row['system_prompt'],
                        knowledge_bases=knowledge_bases,
                        memory_policy=row['memory_policy'],
                        created_at=datetime.fromisoformat(row['created_at'])
                    ))
                except (json.JSONDecodeError, ValidationError) as e:
                    log.error("Failed to parse role data or validate model from DB", role_id=row['id'], error=e)
                    continue # Skip this entry if corrupted
            log.info("Roles listed from DB", count=len(roles))
            return roles
        except sqlite3.Error as e:
            log.error("Failed to list roles from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@roles_api.get("/roles/{role_id}", response_model=Role, summary="Get a single role by ID")
async def get_role(role_id: str):
    """Retrieves the details of a specific role by its unique ID from SQLite."""
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, description, system_prompt, knowledge_bases_json, memory_policy, created_at FROM roles WHERE id = ?", (role_id,))
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Role not found")
            
            try:
                knowledge_bases = json.loads(row['knowledge_bases_json'])
                role = Role(
                    id=row['id'],
                    name=row['name'],
                    description=row['description'],
                    system_prompt=row['system_prompt'],
                    knowledge_bases=knowledge_bases,
                    memory_policy=row['memory_policy'],
                    created_at=datetime.fromisoformat(row['created_at'])
                )
                log.info("Role retrieved from DB", role_id=role_id)
                return role
            except (json.JSONDecodeError, ValidationError) as e:
                log.error("Failed to parse role data or validate model from DB", role_id=role_id, error=e)
                raise HTTPException(status_code=500, detail=f"Data corruption error for role {role_id}: {e}")
        except sqlite3.Error as e:
            log.error("Failed to get role from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()

@roles_api.put("/roles/{role_id}", response_model=Role, summary="Update an existing role")
async def update_role(role_id: str, req: RoleUpdate):
    """Updates one or more properties of an existing role in SQLite."""
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            
            # Fetch existing role to apply updates cleanly via Pydantic
            cursor.execute("SELECT id, name, description, system_prompt, knowledge_bases_json, memory_policy, created_at FROM roles WHERE id = ?", (role_id,))
            existing_row = cursor.fetchone()
            if not existing_row:
                raise HTTPException(status_code=404, detail="Role not found")

            existing_knowledge_bases = json.loads(existing_row['knowledge_bases_json'])
            existing_role = Role(
                id=existing_row['id'],
                name=existing_row['name'],
                description=existing_row['description'],
                system_prompt=existing_row['system_prompt'],
                knowledge_bases=existing_knowledge_bases,
                memory_policy=existing_row['memory_policy'],
                created_at=datetime.fromisoformat(existing_row['created_at'])
            )

            # Apply updates from request model
            update_data = req.model_dump(exclude_unset=True)
            updated_role = existing_role.model_copy(update=update_data)
            
            # Serialize updated knowledge_bases back to JSON string
            updated_knowledge_bases_json = json.dumps(updated_role.knowledge_bases)

            cursor.execute(
                """UPDATE roles SET name = ?, description = ?, system_prompt = ?, knowledge_bases_json = ?, memory_policy = ? 
                   WHERE id = ?""",
                (updated_role.name, updated_role.description, updated_role.system_prompt, 
                 updated_knowledge_bases_json, updated_role.memory_policy, role_id)
            )
            conn.commit()
            log.info("Role updated in DB", role_id=role_id)
            return updated_role
        except sqlite3.IntegrityError as e:
            # Catch unique constraint violation if name is changed to an existing one
            raise HTTPException(status_code=409, detail=f"Database integrity error: {e}")
        except sqlite3.Error as e:
            log.error("Failed to update role in DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        except (json.JSONDecodeError, ValidationError) as e:
            log.error("Failed to parse/validate role data during update", role_id=role_id, error=e)
            raise HTTPException(status_code=500, detail=f"Data validation error during update: {e}")
        finally:
            conn.close()

@roles_api.delete("/roles/{role_id}", status_code=204, summary="Delete a role")
async def delete_role(role_id: str):
    """Deletes a role from the system in SQLite."""
    with _db_lock:
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM roles WHERE id = ?", (role_id,))
            conn.commit()
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Role not found")
            log.info("Role deleted from DB", role_id=role_id)
            return None # 204 response must not have a body
        except sqlite3.Error as e:
            log.error("Failed to delete role from DB", error=e)
            raise HTTPException(status_code=500, detail=f"Database error: {e}")
        finally:
            conn.close()


