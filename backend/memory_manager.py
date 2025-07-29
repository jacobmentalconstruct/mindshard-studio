# File: src/mindshard_backend/memory_manager.py (Updated for Granular Operations)
"""
Manages the agent's memory, including a working scratchpad and a
persistent long-term memory stored in a JSONL file.
"""
import os
import uuid
from threading import Lock
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError


# --- Pydantic Models ---
class MemoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    type: str
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

class AddScratchRequest(BaseModel):
    type: str = Field(..., example="user_interaction")
    content: str
    metadata: Optional[Dict[str, Any]] = None


# --- The MemoryManager Service Class ---
class MemoryManager:
    """A thread-safe manager for in-memory scratchpad and JSONL-based long-term memory."""

    def __init__(self, jsonl_path: Path):
        self.jsonl_path = jsonl_path
        self.lock = Lock()
        self.scratchpad: List[MemoryEntry] = []
        self._ensure_file()

    def _ensure_file(self):
        """Ensures the parent directory and the memory file exist."""
        self.jsonl_path.parent.mkdir(parents=True, exist_ok=True)
        self.jsonl_path.touch(exist_ok=True)

    def add_scratch(self, entry: MemoryEntry):
        """Adds a new entry to the in-memory scratchpad."""
        with self.lock:
            self.scratchpad.append(entry)

    def get_scratch(self) -> List[MemoryEntry]:
        """Returns a copy of the current scratchpad."""
        with self.lock:
            return list(self.scratchpad)

    def clear_scratch(self):
        """Clears all entries from the in-memory scratchpad."""
        with self.lock:
            self.scratchpad.clear()

    def delete_scratch_entry(self, entry_id: str) -> bool:
        """Deletes a single entry from the in-memory scratchpad by ID."""
        with self.lock:
            initial_len = len(self.scratchpad)
            self.scratchpad = [entry for entry in self.scratchpad if entry.id != entry_id]
            return len(self.scratchpad) < initial_len

    def commit_scratch(self) -> MemoryEntry:
        """
        Summarizes the current scratchpad, writes it to long-term memory,
        and clears the scratchpad.
        """
        with self.lock:
            if not self.scratchpad:
                raise ValueError("Cannot commit an empty scratchpad.")

            # Simple concatenation summary of current scratch entries
            summary_content = "\n".join(e.content for e in self.scratchpad)
            summary_entry = MemoryEntry(
                type="summary",
                content=summary_content,
                metadata={"source_entry_ids": [e.id for e in self.scratchpad]}
            )
            self._append_long_term(summary_entry)
            self.scratchpad.clear()
            return summary_entry

    def commit_single_scratch_entry(self, entry_id: str) -> Optional[MemoryEntry]:
        """
        Commits a single entry from the scratchpad to long-term memory and removes it from scratchpad.
        Returns the committed entry if successful, None otherwise.
        """
        with self.lock:
            entry_to_commit = None
            # Find and remove from scratchpad
            new_scratchpad = []
            for entry in self.scratchpad:
                if entry.id == entry_id:
                    entry_to_commit = entry
                else:
                    new_scratchpad.append(entry)
            self.scratchpad = new_scratchpad

            if entry_to_commit:
                self._append_long_term(entry_to_commit)
                return entry_to_commit
            return None


    def _append_long_term(self, entry: MemoryEntry):
        """Appends a single entry to the JSONL file in a thread-safe manner."""
        # Use model_dump_json for Pydantic V2
        json_string = entry.model_dump_json()
        with self.lock:
            with open(self.jsonl_path, "a") as f:
                f.write(json_string + "\n")

    def get_long_term(self, limit: Optional[int] = None) -> List[MemoryEntry]:
        """
        Retrieves entries from the long-term memory file.
        
        Args:
            limit: If provided, returns only the last N entries.
        """
        entries: List[MemoryEntry] = []
        with self.lock:
            with open(self.jsonl_path, "r") as f:
                lines = f.readlines()
                # If a limit is specified, take the last `limit` lines
                if limit:
                    lines = lines[-limit:]

                for line in lines:
                    if line.strip():
                        try:
                            # Use model_validate_json for Pydantic V2
                            entries.append(MemoryEntry.model_validate_json(line))
                        except ValidationError as e:
                            log.error("Failed to validate MemoryEntry from JSONL, skipping line", line=line.strip(), error=e)
                            continue
        return entries

    def update_long_term_entry(self, entry_id: str, updates: Dict[str, Any]) -> Optional[MemoryEntry]:
        """
        Updates a single entry in the long-term memory JSONL file by ID.
        This involves rewriting the entire file (inefficient for large files).
        Returns the updated entry if successful, None otherwise.
        """
        with self.lock:
            all_entries = self.get_long_term(limit=None) # Get all entries
            updated_entry = None
            found = False
            
            new_entries_list = []
            for entry in all_entries:
                if entry.id == entry_id:
                    found = True
                    # Apply updates and re-validate
                    try:
                        updated_entry = entry.model_copy(update=updates)
                        updated_entry.timestamp = datetime.utcnow() # Update timestamp on modification
                        new_entries_list.append(updated_entry)
                    except ValidationError as e:
                        log.error("Failed to validate updated MemoryEntry, skipping update", entry_id=entry_id, error=e)
                        new_entries_list.append(entry) # Keep original if update fails validation
                        updated_entry = None # Indicate update failed
                else:
                    new_entries_list.append(entry)
            
            if found:
                # Rewrite the entire file with updated content
                try:
                    with open(self.jsonl_path, "w") as f:
                        for entry in new_entries_list:
                            f.write(entry.model_dump_json() + "\n")
                    return updated_entry
                except Exception as e:
                    log.error("Failed to rewrite JSONL file during update", entry_id=entry_id, error=e)
                    return None # Indicate file rewrite failure
            return None # Entry not found

    def delete_long_term_entry(self, entry_id: str) -> bool:
        """
        Deletes a single entry from the long-term memory JSONL file by ID.
        This involves rewriting the entire file (inefficient for large files).
        Returns True if deleted, False otherwise.
        """
        with self.lock:
            all_entries = self.get_long_term(limit=None) # Get all entries
            initial_len = len(all_entries)
            
            new_entries_list = [entry for entry in all_entries if entry.id != entry_id]
            
            if len(new_entries_list) < initial_len:
                # Entry found and removed, rewrite the file
                try:
                    with open(self.jsonl_path, "w") as f:
                        for entry in new_entries_list:
                            f.write(entry.model_dump_json() + "\n")
                    return True
                except Exception as e:
                    log.error("Failed to rewrite JSONL file during deletion", entry_id=entry_id, error=e)
                    return False # Indicate file rewrite failure
            return False # Entry not found

