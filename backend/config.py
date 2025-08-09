# File: backend/config.py
"""
Centralized, validated configuration for the Mindshard backend (v2).

Highlights
- Robust .env precedence (process env > .env.{ENV} > .env.local > .env)
- Root-level .env discovery (project root), optional explicit MIND_ENV_FILE
- Secrets via value OR file (/run/secrets friendly)
- Flexible CORS: list or regex, plus methods/headers
- Paths resolved relative to project root; optional auto-create dirs
- Observability toggles (json logs, tracing, metrics)
- Operational controls (timeouts, concurrency, queues)
- Feature flags via MIND_FEATURES__X=true
- Config fingerprint & sanitized dump for safe diagnostics
- Optional hot reload for debugging
"""

from __future__ import annotations

import json
import os
import re
import warnings
import hashlib
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from dotenv import find_dotenv, load_dotenv
except Exception:  # pragma: no cover
    find_dotenv = None  # type: ignore
    load_dotenv = None  # type: ignore


# -------------------- Environment / .env resolution --------------------

class Env(str, Enum):
    dev = "dev"
    staging = "staging"
    prod = "prod"


def _resolve_env_files() -> list[str]:
    override_path = os.getenv("MIND_ENV_FILE")
    if override_path:
        if load_dotenv:
            load_dotenv(override_path, override=True)
        return [override_path]

    files: list[str] = []
    if find_dotenv:
        base = find_dotenv(".env", usecwd=True) or ""
        local = find_dotenv(".env.local", usecwd=True) or ""
        env_name = os.getenv("MIND_ENV", "dev")
        typed = find_dotenv(f".env.{env_name}", usecwd=True) or ""
        for f in [base, local, typed]:
            if f and load_dotenv:
                load_dotenv(f, override=True)
                files.append(f)
    return files


_ENV_FILES = _resolve_env_files()

if _ENV_FILES:
    PROJECT_ROOT = Path(_ENV_FILES[-1]).resolve().parent
else:
    PROJECT_ROOT = Path(__file__).resolve().parents[1]


# -------------------- Reference tables / defaults --------------------

KNOWN_EMBEDDING_MODELS: Dict[str, int] = {
    "all-MiniLM-L6-v2": 384,
    "all-mpnet-base-v2": 768,
    "multi-qa-mpnet-base-dot-v1": 768,
}


# -------------------- Sub-settings --------------------

class LLMSettings(BaseModel):
    model_path: Path = Field(..., description="Path to the GGUF model file.")
    gpu_layers: int = Field(-1, description="Layers offloaded to GPU (-1 = max allowed).")
    context_window: int = Field(4096, description="Context window size.")


class EmbeddingSettings(BaseModel):
    model_name: str = Field("all-MiniLM-L6-v2")
    dim: int = Field(384)
    vector_backend: Literal["chroma", "faiss"] = "chroma"
    chroma_dir: Path = Field(Path("chroma_db"))
    faiss_index_path: Path = Field(Path(".db/faiss.index"))


class SummarizerSettings(BaseModel):
    model_name: str = Field("sshleifer/distilbart-cnn-12-6")
    min_length: int = Field(30)
    max_length: int = Field(150)
    strategy_threshold: int = Field(500)


# -------------------- Main settings --------------------

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MIND_",
        env_file=(_ENV_FILES[-1] if _ENV_FILES else None),
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    env: Env = Env.dev
    app_version: str = Field("0.1.0")
    log_level: str = Field("INFO")
    log_json: bool = False
    log_timestamp: bool = True

    sentry_dsn: Optional[str] = None
    tracing_enabled: bool = False
    metrics_enabled: bool = False
    otlp_endpoint: Optional[str] = None

    api_key: Optional[str] = None
    api_key_file: Optional[Path] = None
    secrets_dir: Optional[Path] = None
    api_key_required: bool = False
    api_key_secret: str | None = None

    cors_origins: list[str] | str = ["*"]
    cors_origin_regex: Optional[str] = None
    cors_methods: List[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    cors_headers: List[str] = ["*"]

    http_timeout_s: int = 60
    worker_concurrency: int = 4
    ingest_queue_size: int = 1024
    max_tokens_per_request: int = 4096
    max_concurrent_requests: int = 100

    memory_jsonl: Path = Path("memory.jsonl")
    chunk_size: int = 512
    chunk_overlap: int = 50
    short_term_flush_threshold: int = 10
    periodic_flush_interval: Optional[int] = 300
    allow_autocreate_dirs: bool = True

    features: Dict[str, bool] = Field(default_factory=dict)

    llm: LLMSettings = Field(
        default_factory=lambda: LLMSettings(
            model_path=Path("models/UNSET.gguf"),
            gpu_layers=-1,
            context_window=4096,
        )
    )
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    summarizer: SummarizerSettings = Field(default_factory=SummarizerSettings)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _normalize_cors_origins(cls, v):
        if v is None:
            return ["*"]
        if isinstance(v, list):
            return [str(x).strip().rstrip("/") for x in v]
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                try:
                    arr = json.loads(s)
                    return [str(x).strip().rstrip("/") for x in arr]
                except Exception:
                    pass
            return [o.strip().rstrip("/") for o in s.split(",") if o.strip()]
        return [str(v).strip().rstrip("/")]

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _validate_cors_origins(cls, origins: List[str]) -> List[str]:
        validated: List[str] = []
        for o in origins:
            if o == "*":
                validated.append(o)
                continue
            if not (o.startswith("http://") or o.startswith("https://")):
                raise ValueError(
                    f"Invalid CORS origin (must include scheme): {o} (set MIND_CORS_ORIGINS)"
                )
            validated.append(o)
        return validated

    @field_validator("cors_origin_regex")
    @classmethod
    def _validate_cors_regex(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        try:
            re.compile(v)
        except re.error as e:
            raise ValueError(f"Invalid CORS regex in MIND_CORS_ORIGIN_REGEX: {e}")
        return v

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, v: str) -> str:
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}
        val = v.upper()
        if val not in allowed:
            raise ValueError(f"Invalid MIND_LOG_LEVEL='{v}'. Allowed: {sorted(allowed)}")
        return val

    @model_validator(mode="after")
    def _load_secret_files(self) -> "Settings":
        if self.api_key_file and Path(self.api_key_file).is_file():
            self.api_key = Path(self.api_key_file).read_text(encoding="utf-8").strip()
        if not self.api_key and self.secrets_dir and self.secrets_dir.is_dir():
            candidate = self.secrets_dir / "API_KEY"
            if candidate.exists():
                self.api_key = candidate.read_text(encoding="utf-8").strip()
        return self

    @model_validator(mode="after")
    def _resolve_paths_and_validate(self) -> "Settings":
        mp = self.llm.model_path
        if not mp.is_absolute():
            mp = (PROJECT_ROOT / mp).resolve()
            self.llm.model_path = mp

        if mp.name == "UNSET.gguf":
            warnings.warn(
                f"LLM model path is set to sentinel '{mp.name}' — backend starting with no model loaded."
            )
        elif not mp.exists():
            warnings.warn(
                f"LLM model path does not exist yet: {mp} — backend will start but the model is not loaded."
            )

        if not self.embedding.chroma_dir.is_absolute():
            self.embedding.chroma_dir = (PROJECT_ROOT / self.embedding.chroma_dir).resolve()
        if not self.embedding.faiss_index_path.is_absolute():
            self.embedding.faiss_index_path = (PROJECT_ROOT / self.embedding.faiss_index_path).resolve()
        if not self.memory_jsonl.is_absolute():
            self.memory_jsonl = (PROJECT_ROOT / self.memory_jsonl).resolve()

        if self.allow_autocreate_dirs:
            for d in {
                self.embedding.chroma_dir,
                self.embedding.chroma_dir.parent,
                self.embedding.faiss_index_path.parent,
                self.memory_jsonl.parent,
            }:
                d.mkdir(parents=True, exist_ok=True)

        known_dim = KNOWN_EMBEDDING_MODELS.get(self.embedding.model_name)
        if known_dim is not None and known_dim != self.embedding.dim:
            raise ValueError(
                f"Embedding dim mismatch for '{self.embedding.model_name}': expected {known_dim}, got {self.embedding.dim}"
            )
        return self

    def fingerprint(self) -> str:
        safe = self.model_dump(exclude={"api_key"})
        return hashlib.sha256(json.dumps(safe, sort_keys=True).encode()).hexdigest()[:12]

    def sanitized(self) -> dict:
        return self.model_dump(exclude={"api_key"})

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT


_settings_instance: Optional[Settings] = None

def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance

def reload_settings() -> Settings:
    global _settings_instance
    _settings_instance = Settings()
    return _settings_instance
