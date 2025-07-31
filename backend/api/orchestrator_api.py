# File: src/backend/api/orchestrator_api.py

import json
import asyncio
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..model_controller import ModelController
from ..digestor_manager import DigestorManager
from ..memory_layers import MemoryLayers
from ..core_models import (
    ExecuteRequest,
    InferRequest,
    InferResponse,
    Scratchpad,
    ToolPayload,
    RAGChunk,
    ScopedContext,
)

log = structlog.get_logger(__name__)
orchestrator_api = APIRouter()

# --- Global state for monitoring the last inference ---
_last_inference_details: Dict[str, Any] = {
    "llm_prompt_used": None,
    "raw_llm_response": None,
    "parsed_scratchpad_json": None,
    "json_parsing_error": None,
    "timestamp": None,
}
_last_inference_lock = threading.Lock()


# --- Helper Dependencies ---
def get_mc(request: Request) -> ModelController:
    return request.app.state.model_controller


def get_dm(request: Request) -> DigestorManager:
    return request.app.state.digestor_manager


def get_ml(request: Request) -> MemoryLayers:
    return request.app.state.memory_layers


# --- Direct Inference Endpoint (for simpler, non-agentic tasks) ---
@orchestrator_api.post(
    "/orchestrator/infer",
    response_model=InferResponse,
    summary="Execute a direct, single-shot inference",
)
async def direct_infer(
    req: InferRequest,
    mc: ModelController = Depends(get_mc),
    dm: DigestorManager = Depends(get_dm),
):
    """Provides a simplified, direct interface to the LLM for non-agentic tasks."""
    final_prompt = req.prompt
    rag_chunks = []
    if req.use_rag:
        try:
            # Assuming a default or pre-configured knowledge base for simple RAG
            # In a real system, this might come from a user profile or session
            rag_digestor = dm.get_instance("personal_memory")
            rag_results = rag_digestor.query(req.prompt, k=3)
            if rag_results:
                rag_context = "\n".join([r["text"] for r in rag_results])
                final_prompt = (
                    f"Context: {rag_context}\n\nQuestion: {req.prompt}"
                )
                rag_chunks = [RAGChunk(**chunk) for chunk in rag_results]
        except Exception as e:
            log.warning("Direct infer RAG failed, proceeding without it.", error=str(e))

    if req.system_prompt:
        final_prompt = f"System: {req.system_prompt}\n\nUser: {final_prompt}"

    try:
        completion = await run_in_threadpool(mc.infer, final_prompt)
        inspection_data = {"original_prompt": req.prompt, "rag_chunks": rag_chunks}
        return InferResponse(completion=completion, inspection=inspection_data)
    except Exception as e:
        log.exception("Direct inference failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# --- Tool Execution Helper (MOCKED FOR NOW) ---
async def _execute_tool(tool_payload: ToolPayload) -> str:
    """
    Mocks the execution of a tool. In a real implementation, this would
    dispatch to actual backend functions based on tool_payload.name and tool_payload.args.
    """
    log.info(
        "Mocking tool execution",
        tool_name=tool_payload.name,
        tool_args=tool_payload.args,
    )
    await asyncio.sleep(0.5)
    return f"Tool '{tool_payload.name}' executed with args {json.dumps(tool_payload.args)}. (Mocked output)"


# --- The Core Reasoning Loop ---
@orchestrator_api.post(
    "/orchestrator/execute", summary="Execute the observable reasoning loop"
)
async def execute_reasoning_loop(
    req: ExecuteRequest,
    mc: ModelController = Depends(get_mc),
    dm: DigestorManager = Depends(get_dm),
    ml: MemoryLayers = Depends(get_ml),
):
    """
    Implements the multi-step observable reasoning loop for the AI agent.
    The agent generates thoughts and actions, including tool calls, until a final answer is reached.
    """

    async def event_stream():
        global _last_inference_details
        scratchpad_history: List[Scratchpad] = []
        max_steps = 10

        for i in range(max_steps):
            log.info(f"Reasoning Step {i+1}/{max_steps}")

            # --- GATHER CONTEXT FOR LLM AND INSPECTION ---
            memory_context_content = None
            rag_chunks_for_inspection: List[RAGChunk] = []
            if (
                req.context_selection.use_conversational_history
                or req.context_selection.use_personal_memory
            ):
                memory_results = await ml.aquery_all(req.prompt, k_work=2, k_long=5)
                if memory_results:
                    memory_context_content = "\n".join(
                        [
                            r["entry"]["content"]
                            for r in memory_results
                            if "content" in r["entry"]
                        ]
                    )

            rag_context_content = None
            if (
                req.context_selection.use_rag
                and req.context_selection.rag_knowledge_base_id
            ):
                try:
                    rag_digestor = dm.get_instance(
                        req.context_selection.rag_knowledge_base_id
                    )
                    rag_results = rag_digestor.query(req.prompt, k=5)
                    if rag_results:
                        rag_context_content = "\n".join(
                            [r["text"] for r in rag_results]
                        )
                        for r_item in rag_results:
                            rag_chunks_for_inspection.append(
                                RAGChunk(
                                    source=r_item.get("source", "unknown"),
                                    score=r_item.get("score", 0.0),
                                    text=r_item.get("text", ""),
                                )
                            )
                except KeyError:
                    log.warning(
                        "RAG Knowledge Base not found for context retrieval",
                        kb_id=req.context_selection.rag_knowledge_base_id,
                    )
                except Exception as rag_e:
                    log.error(
                        "Error during RAG context retrieval", error=str(rag_e)
                    )

            structured_history = []
            for s in scratchpad_history:
                history_entry = f"Thought: {s.thought}\nAction: {s.action}"
                if s.action == "tool_call" and s.tool_payload:
                    history_entry += f" (Tool: {s.tool_payload.name}, Args: {json.dumps(s.tool_payload.args)})"
                elif s.action == "final_answer" and s.final_answer:
                    history_entry += f"\nFinal Answer: {s.final_answer}"
                structured_history.append(history_entry)

            scoped_context = ScopedContext(
                system_instructions="You are a helpful AI assistant. Your goal is to answer the user's directive. Reason step-by-step using a 'thought' and an 'action'. Your final action must be 'final_answer'.",
                user_directive=req.prompt,
                ai_scratchpad_history="\n".join(structured_history)
                if structured_history
                else None,
                retrieved_knowledge=rag_context_content,
            )

            system_content = f"""
You are a helpful AI assistant and a reasoning engine. Your goal is to answer the user's directive. Reason step-by-step using a 'thought' and an 'action'. Your final action must be 'final_answer'. You MUST respond with a single, valid JSON object that conforms to the Pydantic schema provided by the user. Do not add any preamble, explanation, or markdown formatting around the JSON response.
"""
            user_content = f"""
USER DIRECTIVE: {scoped_context.user_directive}
SCRATCHPAD HISTORY (Your previous steps): {scoped_context.ai_scratchpad_history or "No previous steps in this turn."}
RETRIEVED KNOWLEDGE (Use this to inform your thought process): {scoped_context.retrieved_knowledge or "No knowledge retrieved for this turn."}
SCHEMA (Your response MUST conform to this):
{json.dumps(Scratchpad.model_json_schema(), indent=2)}
EXAMPLE of a good response for a simple greeting:
{{
    "thought": "The user said hello, so I should respond with a friendly greeting.",
    "action": "final_answer",
    "final_answer": "Hello! How can I help you today?"
}}
"""
            meta_prompt = f"<|system|>\n{system_content.strip()}<|end|>\n<|user|>\n{user_content.strip()}<|end|>\n<|assistant|>"

            parsed_json_output = None
            json_parsing_error_details = None
            response_str = ""
            next_scratchpad = None

            try:
                response_str = await run_in_threadpool(mc.infer, meta_prompt)
                start_idx = response_str.find('{')
                end_idx = response_str.rfind('}')
                if start_idx == -1 or end_idx == -1 or start_idx > end_idx:
                    raise ValueError("No JSON object found in initial LLM response.")
                cleaned_response = response_str[start_idx : end_idx + 1]
                next_scratchpad = Scratchpad.model_validate_json(cleaned_response)
                parsed_json_output = next_scratchpad.model_dump_json()
                json_parsing_error_details = None

            except Exception as e:
                log.warning("Initial JSON parse failed, attempting self-correction.", error=str(e), raw_response=response_str)
                json_parsing_error_details = f"Initial parse failed: {e}. "
                try:
                    correction_prompt = f"""
The following text is not a valid JSON object. Please correct the syntax and return ONLY the valid JSON object.
Do not add any preamble, explanation, or markdown formatting.
FAULTY JSON:
```json
{response_str}
```
CORRECTED JSON:
"""
                    corrected_response_str = await run_in_threadpool(mc.infer, correction_prompt)
                    start_idx = corrected_response_str.find('{')
                    end_idx = corrected_response_str.rfind('}')
                    if start_idx == -1 or end_idx == -1 or start_idx > end_idx:
                        raise ValueError("No JSON object found in corrected LLM response.")
                    final_cleaned_response = corrected_response_str[start_idx : end_idx + 1]
                    next_scratchpad = Scratchpad.model_validate_json(final_cleaned_response)
                    parsed_json_output = next_scratchpad.model_dump_json()
                    json_parsing_error_details += "Correction successful."
                    log.info("Successfully self-corrected faulty LLM JSON output.")
                except Exception as correction_e:
                    log.error("LLM self-correction failed.", error=str(correction_e), corrected_response=corrected_response_str)
                    json_parsing_error_details += f"Correction also failed: {correction_e}."
                    error_pad = Scratchpad(
                        thought=f"Error during reasoning and self-correction: {correction_e}",
                        action="final_answer",
                        inspection_data={
                            "original_prompt": req.prompt,
                            "editor_context": None,
                            "memory_context": None,
                            "rag_chunks": [],
                            "error_details": json_parsing_error_details,
                            "raw_llm_response_snippet": response_str[:500],
                            "llm_prompt_used": meta_prompt,
                        },
                    )
                    yield f"data: {error_pad.model_dump_json()}\n\n"
                    return
            finally:
                with _last_inference_lock:
                    _last_inference_details.update({
                        "llm_prompt_used": meta_prompt,
                        "raw_llm_response": response_str,
                        "parsed_scratchpad_json": parsed_json_output,
                        "json_parsing_error": json_parsing_error_details,
                        "timestamp": datetime.now().isoformat(),
                    })
            
            if not next_scratchpad:
                log.error("Failed to produce a valid scratchpad object after all steps.")
                error_pad = Scratchpad(
                    thought="The AI model failed to produce a valid response, and self-correction was also unsuccessful. Please try rephrasing your request.",
                    action="final_answer"
                )
                yield f"data: {error_pad.model_dump_json()}\n\n"
                return

            if isinstance(next_scratchpad.action, dict):
                tool_payload_data = next_scratchpad.action.get("tool_payload")
                if isinstance(tool_payload_data, dict):
                    next_scratchpad.tool_payload = ToolPayload(**tool_payload_data)
                    next_scratchpad.action = "tool_call"
                elif "final_answer" in next_scratchpad.action:
                    final_answer_data = next_scratchpad.action.get("final_answer")
                    if isinstance(final_answer_data, str):
                        next_scratchpad.thought = final_answer_data
                        next_scratchpad.action = "final_answer"

            if isinstance(next_scratchpad.final_answer, dict) and "message" in next_scratchpad.final_answer:
                next_scratchpad.thought = next_scratchpad.final_answer["message"]
                next_scratchpad.action = "final_answer"
            elif isinstance(next_scratchpad.final_answer, str):
                next_scratchpad.thought = next_scratchpad.final_answer
                next_scratchpad.action = "final_answer"

            inspection_data_for_frontend = {
                "original_prompt": req.prompt,
                "editor_context": None,
                "memory_context": {
                    "source": "MemoryLayers",
                    "content": memory_context_content or "No relevant memory retrieved.",
                } if memory_context_content else None,
                "rag_chunks": rag_chunks_for_inspection,
                "llm_prompt_used": meta_prompt,
            }
            next_scratchpad.inspection_data = inspection_data_for_frontend
            yield f"data: {next_scratchpad.model_dump_json()}\n\n"

            try:
                if next_scratchpad.action == "tool_call" and next_scratchpad.tool_payload:
                    tool_output_str = await _execute_tool(next_scratchpad.tool_payload)
                    log.info("Tool executed successfully", tool_name=next_scratchpad.tool_payload.name)
                    tool_output_pad = Scratchpad(thought=f"Tool Output: {tool_output_str}", action="thought")
                    scratchpad_history.append(next_scratchpad)
                    scratchpad_history.append(tool_output_pad)
                    yield f"data: {tool_output_pad.model_dump_json()}\n\n"
                else:
                    scratchpad_history.append(next_scratchpad)
            except Exception as downstream_error:
                log.error("A non-critical downstream error occurred after sending response.", error=str(downstream_error))

            if next_scratchpad.action == "final_answer":
                log.info("Reasoning loop complete: final_answer reached.")
                break
        
        if not scratchpad_history or scratchpad_history[-1].action != "final_answer":
            log.warning("Reasoning loop terminated due to max steps without a final answer.")
            final_pad = Scratchpad(
                thought="Reached maximum reasoning depth without a definitive final answer.",
                action="final_answer",
            )
            yield f"data: {final_pad.model_dump_json()}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

