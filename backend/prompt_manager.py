# File: src/backend/prompt_manager.py (Updated for SQLite Persistence)
"""
📖 The Prompt Engineering Co-pilot for MindshardAI.

This module provides an advanced service for creating, managing, and rendering
dynamic, context-aware prompt templates. Prompt templates are now persisted
to a local SQLite database for robustness, including their version history.
"""
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable
import sqlite3
from pathlib import Path
import threading

import numpy as np
import structlog
from pydantic import BaseModel, Field, model_validator, ValidationError
from jinja2 import Environment, meta, TemplateSyntaxError, UndefinedError

# Correct relative imports
from .memory_layers import MemoryLayers # Used for rendering, not direct persistence here
from .memory_manager import MemoryEntry # Used for rendering, not direct persistence here

log = structlog.get_logger(__name__)

# --- Pydantic Models for Prompts ---

class PromptVersion(BaseModel):
    """Represents a specific version of a prompt template."""
    version: int = 1
    content: str
    author: str = "system"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    embedding: Optional[List[float]] = None # Stored as JSON string in DB

class PromptTemplate(BaseModel):
    """Represents a prompt template with its history of versions."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str
    title: str
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list) # Stored as JSON string in DB
    versions: List[PromptVersion] = Field(default_factory=list)
    latest_version: int = 0 # Index (1-based) of the latest version in the versions list
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def latest(self) -> PromptVersion:
        """Returns the latest version of the prompt template."""
        if not self.versions:
            raise ValueError("PromptTemplate has no versions.")
        # latest_version is 1-based index, so adjust for 0-based list access
        return self.versions[self.latest_version - 1]

    @model_validator(mode='after')
    def check_versions(self) -> 'PromptTemplate':
        """Validates that latest_version is within bounds of the versions list."""
        if self.versions and self.latest_version > len(self.versions):
            raise ValueError("latest_version is out of bounds.")
        return self

# --- The Prompt Studio: A Powered-Up Jinja2 Environment ---
def create_prompt_studio_environment() -> Environment:
    """Creates a Jinja2 environment with custom, AI-centric filters and functions."""
    env = Environment(autoescape=True, trim_blocks=True, lstrip_blocks=True)
    env.filters['to_json'] = lambda obj: json.dumps(obj, indent=2)
    def format_as_chat(interactions: List[Dict]) -> str:
        return "\n".join([f"USER: {turn.get('prompt', '')}\nASSISTANT: {turn.get('response', '')}" for turn in interactions])
    env.filters['as_chat'] = format_as_chat
    return env

prompt_studio_env = create_prompt_studio_environment()

# --- SQLite Database Setup ---
DB_FILE = Path("data/mindshard.db") # Centralized SQLite database file
_db_lock = threading.Lock() # Lock for thread-safe database access

def _get_db_connection():
    """Establishes and returns a new SQLite database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # Return rows as dict-like objects
    return conn

def _init_db():
    """Initializes the SQLite database schema for prompt templates and versions."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True) # Ensure data directory exists
    with _db_lock:
        conn = None
        try:
            conn = _get_db_connection()
            cursor = conn.cursor()
            # Table for prompt templates
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS prompt_templates (
                    id TEXT PRIMARY KEY,
                    slug TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    description TEXT,
                    tags_json TEXT NOT NULL, -- Storing tags as JSON string
                    latest_version_num INTEGER NOT NULL, -- To track the latest version
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            # Table for prompt versions (linked to templates)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS prompt_versions (
                    version_id TEXT PRIMARY KEY, -- Unique ID for each version
                    template_id TEXT NOT NULL,
                    version_num INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    author TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    embedding_json TEXT, -- Storing embedding as JSON string
                    UNIQUE(template_id, version_num), -- Ensure unique version per template
                    FOREIGN KEY (template_id) REFERENCES prompt_templates(id) ON DELETE CASCADE
                )
            """)
            conn.commit()
            log.info("SQLite database initialized or already exists for prompts", db_file=DB_FILE)
        except sqlite3.Error as e:
            log.error("Failed to initialize SQLite database for prompts", error=e)
            raise # Re-raise to halt app startup if DB init fails
        finally:
            if conn:
                conn.close()

# Initialize the database schema on module import
_init_db()


# --- Manager Class ---
class PromptManager:
    """
    A service for managing the prompt template lifecycle, backed by SQLite.
    """

    def __init__(self):
        """Initializes the manager. No in-memory cache directly managed here."""
        log.info("PromptManager initialized. Using SQLite for persistence.")

    def _load_template_from_db(self, template_id: str = None, slug: str = None) -> Optional[PromptTemplate]:
        """Helper to load a single template and its versions from the DB."""
        conn = _get_db_connection()
        try:
            cursor = conn.cursor()
            if template_id:
                cursor.execute("SELECT * FROM prompt_templates WHERE id = ?", (template_id,))
            elif slug:
                cursor.execute("SELECT * FROM prompt_templates WHERE slug = ?", (slug,))
            else:
                return None
            
            template_row = cursor.fetchone()
            if not template_row:
                return None
            
            # Load versions for this template
            cursor.execute("SELECT * FROM prompt_versions WHERE template_id = ? ORDER BY version_num ASC", (template_row['id'],))
            version_rows = cursor.fetchall()
            
            versions = []
            for v_row in version_rows:
                embedding = json.loads(v_row['embedding_json']) if v_row['embedding_json'] else None
                versions.append(PromptVersion(
                    version=v_row['version_num'],
                    content=v_row['content'],
                    author=v_row['author'],
                    timestamp=datetime.fromisoformat(v_row['timestamp']),
                    embedding=embedding
                ))
            
            tags = json.loads(template_row['tags_json']) if template_row['tags_json'] else []

            return PromptTemplate(
                id=template_row['id'],
                slug=template_row['slug'],
                title=template_row['title'],
                description=template_row['description'],
                tags=tags,
                versions=versions,
                latest_version=template_row['latest_version_num'],
                created_at=datetime.fromisoformat(template_row['created_at']),
                updated_at=datetime.fromisoformat(template_row['updated_at'])
            )
        except (sqlite3.Error, json.JSONDecodeError, ValidationError) as e:
            log.error("Error loading prompt template from DB", template_id=template_id, slug=slug, error=e)
            return None
        finally:
            conn.close()

    def add_template(self, template_data: 'PromptTemplateCreate', embedder: Callable[[str], List[float]]) -> PromptTemplate:
        """
        Adds a new prompt template to the database.
        Raises ValueError if a template with the same slug already exists.
        """
        with _db_lock:
            conn = _get_db_connection()
            try:
                cursor = conn.cursor()
                # Check for existing slug
                cursor.execute("SELECT id FROM prompt_templates WHERE slug = ?", (template_data.slug,))
                if cursor.fetchone():
                    raise ValueError(f"Template slug '{template_data.slug}' already exists.")
                
                template_id = str(uuid.uuid4())
                created_at = datetime.utcnow().isoformat()
                updated_at = created_at

                # Create initial version
                try:
                    embedding = embedder(template_data.content)
                    embedding_json = json.dumps(embedding)
                except Exception as e:
                    log.warning("Failed to generate embedding for new prompt, proceeding without it", slug=template_data.slug, error=str(e))
                    embedding = None
                    embedding_json = None

                initial_version_num = 1
                version_id = str(uuid.uuid4())
                
                # Insert template
                cursor.execute(
                    """INSERT INTO prompt_templates (id, slug, title, description, tags_json, latest_version_num, created_at, updated_at) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (template_id, template_data.slug, template_data.title, template_data.description, 
                     json.dumps(template_data.tags), initial_version_num, created_at, updated_at)
                )
                
                # Insert initial version
                cursor.execute(
                    """INSERT INTO prompt_versions (version_id, template_id, version_num, content, author, timestamp, embedding_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (version_id, template_id, initial_version_num, template_data.content, 
                     template_data.author, created_at, embedding_json)
                )
                
                conn.commit()
                
                new_template = PromptTemplate(
                    id=template_id, slug=template_data.slug, title=template_data.title, 
                    description=template_data.description, tags=template_data.tags, 
                    versions=[PromptVersion(version=initial_version_num, content=template_data.content, 
                                            author=template_data.author, timestamp=datetime.fromisoformat(created_at), 
                                            embedding=embedding)], 
                    latest_version=initial_version_num, created_at=datetime.fromisoformat(created_at), 
                    updated_at=datetime.fromisoformat(updated_at)
                )
                log.info("Created prompt template in DB", slug=template_data.slug, title=template_data.title)
                return new_template
            except sqlite3.IntegrityError as e:
                raise ValueError(f"Database integrity error: {e}")
            except sqlite3.Error as e:
                log.error("Failed to add prompt template to DB", error=e)
                raise
            finally:
                conn.close()

    def list_templates(self) -> List[PromptTemplate]:
        """Retrieves all prompt templates from the database."""
        with _db_lock:
            conn = _get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM prompt_templates") # Only fetch IDs to load full templates
                template_ids = [row['id'] for row in cursor.fetchall()]
                
                templates = []
                for template_id in template_ids:
                    template = self._load_template_from_db(template_id=template_id)
                    if template:
                        templates.append(template)
                log.info("Listed prompt templates from DB", count=len(templates))
                return templates
            except sqlite3.Error as e:
                log.error("Failed to list prompt templates from DB", error=e)
                raise
            finally:
                conn.close()

    def get_template_by_slug(self, slug: str) -> PromptTemplate:
        """
        Retrieves a prompt template by its slug from the database.
        Raises KeyError if the template is not found.
        """
        with _db_lock:
            template = self._load_template_from_db(slug=slug)
            if not template:
                raise KeyError(f"Template with slug '{slug}' not found.")
            log.info("Retrieved prompt template by slug from DB", slug=slug)
            return template
            
    def get_template_by_id(self, template_id: str) -> PromptTemplate:
        """
        Retrieves a prompt template by its ID from the database.
        Raises KeyError if the template is not found.
        """
        with _db_lock:
            template = self._load_template_from_db(template_id=template_id)
            if not template:
                raise KeyError(f"Template with ID '{template_id}' not found.")
            log.info("Retrieved prompt template by ID from DB", template_id=template_id)
            return template

    def add_version(self, template_id: str, content: str, author: str, embedder: Callable[[str], List[float]]) -> PromptTemplate:
        """
        Adds a new version to an existing prompt template.
        Updates the latest_version_num and updated_at fields of the template.
        """
        with _db_lock:
            conn = _get_db_connection()
            try:
                template = self._load_template_from_db(template_id=template_id)
                if not template:
                    raise KeyError(f"Template with ID '{template_id}' not found.")
                
                new_version_num = template.latest_version + 1
                version_id = str(uuid.uuid4())
                timestamp = datetime.utcnow().isoformat()

                try:
                    embedding = embedder(content)
                    embedding_json = json.dumps(embedding)
                except Exception as e:
                    log.warning("Failed to generate embedding for new prompt version, proceeding without it", template_id=template_id, version=new_version_num, error=str(e))
                    embedding = None
                    embedding_json = None

                cursor = conn.cursor()
                cursor.execute(
                    """INSERT INTO prompt_versions (version_id, template_id, version_num, content, author, timestamp, embedding_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (version_id, template_id, new_version_num, content, author, timestamp, embedding_json)
                )
                
                # Update parent template's latest version and updated_at
                updated_at = datetime.utcnow().isoformat()
                cursor.execute(
                    "UPDATE prompt_templates SET latest_version_num = ?, updated_at = ? WHERE id = ?",
                    (new_version_num, updated_at, template_id)
                )
                
                conn.commit()
                
                # Reload the full template to return the updated object
                updated_template = self._load_template_from_db(template_id=template_id)
                if not updated_template:
                    raise Exception("Failed to reload template after version update.")

                log.info("Added new version to prompt template in DB", template_id=template_id, new_version=new_version_num)
                return updated_template
            except sqlite3.Error as e:
                log.error("Failed to add new version to prompt template in DB", error=e)
                raise
            finally:
                conn.close()

    def update_template_metadata(self, template_id: str, title: Optional[str] = None, description: Optional[str] = None, tags: Optional[List[str]] = None) -> PromptTemplate:
        """
        Updates metadata (title, description, tags) of an existing prompt template.
        Does not create a new version.
        """
        with _db_lock:
            conn = _get_db_connection()
            try:
                cursor = conn.cursor()
                updated_at = datetime.utcnow().isoformat()
                
                updates = []
                params = []
                if title is not None:
                    updates.append("title = ?")
                    params.append(title)
                if description is not None:
                    updates.append("description = ?")
                    params.append(description)
                if tags is not None:
                    updates.append("tags_json = ?")
                    params.append(json.dumps(tags))
                
                if not updates: # No updates provided
                    template = self._load_template_from_db(template_id=template_id)
                    if not template:
                        raise KeyError(f"Template with ID '{template_id}' not found.")
                    return template

                updates.append("updated_at = ?")
                params.append(updated_at)
                params.append(template_id) # WHERE clause parameter

                cursor.execute(
                    f"UPDATE prompt_templates SET {', '.join(updates)} WHERE id = ?",
                    tuple(params)
                )
                conn.commit()
                if cursor.rowcount == 0:
                    raise KeyError(f"Template with ID '{template_id}' not found.")
                
                updated_template = self._load_template_from_db(template_id=template_id)
                if not updated_template:
                    raise Exception("Failed to reload template after metadata update.")
                
                log.info("Updated prompt template metadata in DB", template_id=template_id)
                return updated_template
            except sqlite3.Error as e:
                log.error("Failed to update prompt template metadata in DB", error=e)
                raise
            finally:
                conn.close()

    def delete_template(self, template_id: str) -> None:
        """Deletes a prompt template and all its versions from the database."""
        with _db_lock:
            conn = _get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM prompt_templates WHERE id = ?", (template_id,))
                conn.commit()
                if cursor.rowcount == 0:
                    raise KeyError(f"Template with ID '{template_id}' not found.")
                log.info("Deleted prompt template from DB", template_id=template_id)
            except sqlite3.Error as e:
                log.error("Failed to delete prompt template from DB", error=e)
                raise
            final
