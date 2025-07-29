# File: src/mindshard_backend/config.py (Corrected)
"""
Centralized, validated, and structured configuration for the Mindshard Backend.
Uses pydantic-settings for environment-aware configuration with startup validation.
"""
from typing import List, Literal, Dict, Optional
from pathlib import Path
from pydantic import BaseModel, Field, field_validator, model_validator, Extra
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Helper Data for Validation ---
KNOWN_EMBEDDING_MODELS: Dict[str, int] = {
    "all-MiniLM-L6-v2": 384,
    "all-mpnet-base-v2": 768,
    "multi-qa-mpnet-base-dot-v1": 768,
}

# --- Nested Configuration Models for Organization ---

class LLMSettings(BaseModel):
    """Settings specific to the Large Language Model."""
    model_path: Path = Field(..., description="Path to the GGUF model file for Llama.cpp")
    gpu_layers: int = Field(-1, description="Number of layers to offload to GPU (-1 for all possible)")
    context_window: int = Field(4096, description="The context window size for the LLM")

class EmbeddingSettings(BaseModel):
    """Settings for the embedding model and vector store."""
    model_name: str = Field("all-MiniLM-L6-v2", description="Sentence-transformer model for embeddings.")
    dim: int = Field(384, description="Output dimension of the embedding model. Must match model_name.")
    vector_backend: Literal["chroma", "faiss"] = "chroma"
    chroma_dir: Path = Field(Path("chroma_db"), description="Directory for ChromaDB")
    faiss_index_path: Path = Field(Path(".db/faiss.index"), description="Path for the FAISS index file")

class SummarizerSettings(BaseModel):
    """Settings for the summarization service."""
    model_name: str = Field("sshleifer/distilbart-cnn-12-6", description="HF model for summarization.")
    min_length: int = Field(30, description="Minimum length of the generated summary.")
    max_length: int = Field(150, description="Maximum length of the generated summary.")
    strategy_threshold: int = Field(500, description="Character count above which to use the abstractive model.")


# --- Main Settings Class ---

class Settings(BaseSettings):
    """
    Primary application settings, composed of nested models.
    Loaded from .env file and environment variables.
    """
    model_config = SettingsConfigDict(
        env_prefix='MIND_',
        # Construct an absolute path to the .env file in the project root
        env_file=Path(__file__).parent.parent.parent / '.env',
        env_file_encoding='utf-8',
        extra=Extra.ignore,
        env_nested_delimiter='__'
    )


    # --- Core Settings ---
    api_key: str
    cors_origins: List[str] = ["*"]
    log_level: str = "INFO"
    max_concurrent_requests: int = 100
    memory_jsonl: Path = Path("memory.jsonl")

    # --- NEW: Application & Observability Settings ---
    app_version: str = Field("0.1.0", description="Application version, can be overridden by env.")
    sentry_dsn: Optional[str] = Field(None, description="Sentry DSN for error reporting.")
    otlp_endpoint: Optional[str] = Field(None, description="OpenTelemetry collector endpoint for tracing.")

    # --- NEW: RAG & Memory Tuning Settings ---
    chunk_size: int = Field(512, description="Default chunk size for RAG text splitting.")
    chunk_overlap: int = Field(50, description="Default chunk overlap for RAG text splitting.")
    short_term_flush_threshold: int = Field(10, description="Number of items in working memory to trigger a flush.")
    periodic_flush_interval: Optional[int] = Field(300, description="Seconds between periodic memory flushes (None to disable).")

    # --- Composed Settings ---
    llm: LLMSettings
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    summarizer: SummarizerSettings = Field(default_factory=SummarizerSettings)

    # --- Validators ---
    @field_validator("cors_origins", mode='before')
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    @model_validator(mode='after')
    def _validate_paths_and_models(self) -> 'Settings':
        """Performs robust checks after the model is initialized."""
        # Note: Pydantic now resolves the model_path relative to the .env file.
        # We might need to make it absolute if it's relative to the project root.
        project_root = Path(__file__).parent.parent.parent
        
        # Resolve the model path relative to the project root if it's not absolute
        if not self.llm.model_path.is_absolute():
             self.llm.model_path = project_root / self.llm.model_path

        if not self.llm.model_path.exists():
            raise ValueError(f"LLM model path does not exist: {self.llm.model_path}")

        known_dim = KNOWN_EMBEDDING_MODELS.get(self.embedding.model_name)
        if known_dim is not None and known_dim != self.embedding.dim:
            raise ValueError(
                f"Embedding model mismatch! Model '{self.embedding.model_name}' "
                f"has a dimension of {known_dim}, but configured dimension is {self.embedding.dim}."
            )
        return self

# Dependency getter function for FastAPI
_settings_instance = None
def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance
