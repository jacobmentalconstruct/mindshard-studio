# File: src/mindshard_backend/embedding.py
"""
🧠 Embedding Generation Service

This module provides a class-based service for managing the lifecycle and
execution of the sentence-transformer embedding model.
"""
import structlog
from typing import List, Union, Optional
import torch
from sentence_transformers import SentenceTransformer
from mindshard_backend.config import EmbeddingSettings

log = structlog.get_logger(__name__)

# --- Custom Exception for Clearer Error Reporting ---
class ModelInitializationError(Exception):
    """Custom exception raised when the embedding model fails to load."""
    pass

class EmbeddingService:
    """
    Manages the embedding model's lifecycle, ensuring it is loaded at
    application startup and ready to encode text.
    """
    def __init__(self, settings: EmbeddingSettings):
        """
        Initializes the service with the necessary settings.
        Note: The model is NOT loaded during initialization.
        """
        self.settings = settings
        self.model: Optional[SentenceTransformer] = None
        log.info("EmbeddingService initialized. Call `prime()` to load the model.")

    def prime(self):
        """
        Loads the SentenceTransformer model into memory based on settings.
        This is a blocking, one-time operation for app startup.
        """
        if self.model is not None:
            log.warning("Embedding model is already loaded. Ignoring redundant `prime()` call.")
            return

        log.info("Priming embedding model...", settings=self.settings.model_dump())
        # --- FIX: Force CPU to avoid CUDA conflicts with llama-cpp-python ---
        device = "cpu"
        log.info(f"Using device '{device}' for embedding model.")

        try:
            self.model = SentenceTransformer(self.settings.model_name, device=device)
            # We can even do a quick test run to ensure it's working
            self.model.encode("Sanity check", convert_to_numpy=True)
            log.info(f"Embedding model '{self.settings.model_name}' has been successfully primed.")
        except Exception as e:
            log.exception("Fatal error during embedding model initialization. The application cannot start.")
            raise ModelInitializationError(f"Failed to load embedding model '{self.settings.model_name}': {e}") from e

    def encode(self, texts: Union[str, List[str]]) -> Union[List[float], List[List[float]]]:
        """
        Generates sentence embeddings for a given text or list of texts.

        Raises:
            RuntimeError: If called before the model is loaded via `prime()`.
        """
        if self.model is None:
            log.error("`encode()` called before the model was loaded. The application is in an invalid state.")
            raise RuntimeError("EmbeddingService is not primed. Cannot encode text.")

        log.debug("Encoding text...", num_texts=len(texts) if isinstance(texts, list) else 1)
        
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True  # Crucial for good performance with cosine similarity
        )
        
        return embeddings.tolist()
