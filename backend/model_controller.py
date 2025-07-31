# File: src/backend/model_controller.py (Debug Output & LLM Params)
"""
🤖 LLM Inference Service (Model Controller)

This module provides a robust, stateful controller for managing the lifecycle
and inference of a local Large Language Model using llama-cpp-python.
"""
import structlog
from typing import Optional
from llama_cpp import Llama
from backend.config import LLMSettings

log = structlog.get_logger(__name__)

# --- Custom Exception for Clearer Error Reporting ---
class ModelInitializationError(Exception):
    """Custom exception raised when the LLM fails to load."""
    pass

class ModelController:
    """
    Manages the LLM's lifecycle, ensuring it is loaded at application
    startup and ready for inference requests.
    """
    def __init__(self, settings: LLMSettings):
        """
        Initializes the controller with the necessary settings.
        Note: The model is NOT loaded during initialization.
        """
        self.settings = settings
        self.llm: Optional[Llama] = None
        log.info("ModelController initialized. Call `prime()` to load the model.")

    def prime(self):
        """
        Loads the Llama.cpp model into memory based on the initialized settings.
        This is a blocking, one-time operation designed to be called at app startup.
        """
        if self.llm is not None:
            log.warning("Model is already loaded. Ignoring redundant `prime()` call.")
            return

        # Use model_dump() to get a dictionary of settings for clean logging
        log.info("Priming LLM: loading model into memory...", settings=self.settings.model_dump())
        try:
            # Llama-cpp expects string paths, so we convert the Path object
            self.llm = Llama(
                model_path=str(self.settings.model_path),
                n_gpu_layers=self.settings.gpu_layers,
                n_ctx=self.settings.context_window,
                verbose=False,  # Set to True for detailed llama.cpp logs
            )
            log.info("LLM has been successfully primed and is ready for inference.")
        except Exception as e:
            log.exception("Fatal error during Llama model initialization. The application cannot start.")
            # Wrap the original error in our custom exception
            raise ModelInitializationError(f"Failed to load LLM from path '{self.settings.model_path}': {e}") from e

    def infer(
        self,
        prompt: str,
        max_tokens: int = 12288,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> str:
        """
        Generates a response from the pre-loaded LLM for a given prompt.
        """
        if self.llm is None:
            log.error("`infer()` called before the model was loaded. The application is in an invalid state.")
            raise RuntimeError("ModelController is not primed. Cannot perform inference.")

        log.debug("Running inference...", prompt_length=len(prompt), max_tokens=max_tokens)

        try:
            # --- USE STANDARD PARAMETERS ---
            # The GPU settings are handled when the model is loaded, not during inference.
            output = self.llm.create_completion(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stop=["USER:", "USER :", "USER:", "\n\n\n"],
                echo=False,
            )

            response_text = output['choices'][0]['text'].strip()

            log.debug("Raw LLM response from llama.cpp:", raw_response=response_text)

            if not response_text:
                log.warning("LLM returned empty or whitespace-only response.", prompt_length=len(prompt))
                return "ERROR: LLM_GENERATED_EMPTY_RESPONSE"

            log.debug("Inference complete", response_length=len(response_text))
            return response_text
        except Exception as e:
            log.exception("Error during LLM inference completion.", prompt_length=len(prompt))
            raise RuntimeError(f"LLM inference failed: {e}") from e


