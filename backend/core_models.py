# File: src/backend/core_models.py (Final Fix)
"""
🧠 Core data models for the MindshardAI cognitive engine.
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal, Union
from uuid import UUID, uuid4

# --- Context & Knowledge Models ---

class RAGChunk(BaseModel):
    """Represents a single chunk of retrieved information from a RAG source."""
    source: str
    score: float
    text: str
    metadata: Dict[str, Any] = {}

class ScopedContext(BaseModel):
    """
    A machine-readable "briefing document" for the LLM to prevent speaker confusion.
    """
    system_instructions: Optional[str] = Field(None, description="Core instructions for the agent's persona and task.")
    user_directive: str = Field(..., description="The primary, current instruction from the user.")
    ai_scratchpad_history: Optional[str] = Field(None, description="A summary or log of the agent's previous thought steps for this task.")
    retrieved_knowledge: Optional[str] = Field(None, description="Context retrieved from RAG sources (memory, files, web).")

# --- Orchestrator & Reasoning Models ---

class ToolPayload(BaseModel):
    """The arguments for a tool call."""
    name: str = Field(..., description="The name of the tool to be called.")
    args: Dict[str, Any] = Field(default_factory=dict, description="The arguments for the tool.")

class Scratchpad(BaseModel):
    """
    Represents a single step in the agent's multi-step thought process.
    This is the core data unit of the observable reasoning loop.
    """
    thought: str = Field(..., description="The agent's internal monologue, explaining its reasoning for the chosen action.")
    action: Union[Literal['tool_call', 'final_answer', 'thought'], Dict[str, Any]] = Field(..., description="The type of action the agent will take.")
    tool_payload: Optional[ToolPayload] = Field(None, description="The details of the tool call, if action is 'tool_call'.")
    # --- MODIFICATION ---
    # Allow final_answer to be a string OR a dictionary to handle LLM inconsistencies.
    final_answer: Optional[Union[str, Dict[str, Any]]] = None
    # --- END MODIFICATION ---
    inspection_data: Optional[Dict[str, Any]] = Field(None, description="Detailed data for frontend's inspection/explain panel.")


class ContextSelection(BaseModel):
    """
    Defines which knowledge sources the user wants to activate for an inference turn.
    """
    use_personal_memory: bool = False
    use_conversational_history: bool = False
    use_active_project: bool = False
    enabled_knowledge_libraries: List[str] = Field(default_factory=list)
    use_open_files: bool = False
    use_web_search: bool = False
    use_self_observation: bool = False
    use_rag: bool = Field(False, description="Whether to use RAG lookup for this turn.")
    rag_knowledge_base_id: Optional[str] = Field(None, description="ID of the knowledge base to use for RAG.")
    rag_chunk_size: Optional[int] = Field(None, description="Chunk size for RAG retrieval.")
    rag_chunk_overlap: Optional[int] = Field(None, description="Chunk overlap for RAG retrieval.")


class ExecuteRequest(BaseModel):
    """The primary input for the main orchestrator endpoint."""
    prompt: str
    inference_params: Dict[str, Any] = Field(default_factory=dict)
    context_selection: ContextSelection = Field(default_factory=ContextSelection)
    
class InferRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = None
    use_rag: bool = True

class InferResponse(BaseModel):
    completion: str
    inspection: Dict[str, Any]
