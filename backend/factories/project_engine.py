# File: src/mindshard_backend/services/project_engine.py
"""
⚙️ Project Vector Store Factory

This module is responsible for creating the main VectorStore instance
for the "active_project" RAG using a declarative, strategy-based approach.
"""
import structlog
from typing import Dict, Any, Callable, Type
from mindshard_backend.config import EmbeddingSettings
from mindshard_backend.vector_store import FaissVectorStore, ChromaVectorStore, VectorStore

log = structlog.get_logger(__name__)

# --- Custom Exception for Better Error Handling ---
class VectorStoreInitializationError(Exception):
    """Custom exception raised when a vector store fails to initialize."""
    pass

# --- Declarative Backend Registration (Strategy Pattern) ---
# Each entry contains the class and a lambda function to build its specific config.
# To add a new backend (e.g., "weaviate"), you only need to add a new entry here.
VECTOR_STORE_STRATEGIES: Dict[str, Dict[str, Any]] = {
    "chroma": {
        "class": ChromaVectorStore,
        "config_builder": lambda cfg: {
            "persist_directory": str(cfg.chroma_dir),
            "collection_name": "active_project",
        },
    },
    "faiss": {
        "class": FaissVectorStore,
        "config_builder": lambda cfg: {
            "index_path": str(cfg.faiss_index_path),
            "dim": cfg.dim,
        },
    },
}

def create_project_vector_store(config: EmbeddingSettings) -> VectorStore:
    """
    Factory function that creates a VectorStore instance from configuration.
    This function is NOT a singleton itself; singleton behavior is managed
    by the application's lifespan event, which calls this function once.

    Args:
        config: An EmbeddingSettings object with all necessary parameters.

    Returns:
        A configured and initialized VectorStore instance.

    Raises:
        ValueError: If the configured vector_backend is not supported.
        VectorStoreInitializationError: If the vector store library fails during init.
    """
    backend_name = config.vector_backend
    log.info(f"Attempting to create project vector store with backend: '{backend_name}'")

    strategy = VECTOR_STORE_STRATEGIES.get(backend_name)
    if not strategy:
        log.error("Unsupported vector_backend in settings", backend=backend_name)
        raise ValueError(f"Unsupported vector_backend in settings: {backend_name}")

    try:
        # Get the specific class and config builder from the strategy map
        backend_class: Type[VectorStore] = strategy["class"]
        config_builder: Callable[[EmbeddingSettings], Dict] = strategy["config_builder"]

        # Build the configuration dictionary by calling the lambda
        backend_config = config_builder(config)
        log.debug("Initializing vector store with config", config=backend_config)

        # Instantiate the class with the generated configuration
        engine = backend_class(**backend_config)
        log.info(f"Successfully created '{backend_name}' vector store instance.")
        return engine

    except Exception as e:
        log.exception(
            "Failed to initialize the vector store backend.",
            backend=backend_name,
            error=str(e),
        )
        # Wrap the original exception in our custom one for clearer error handling
        raise VectorStoreInitializationError(f"Failed to initialize {backend_name}: {e}") from e
