from __future__ import annotations

import os
from dataclasses import dataclass


PROFILE_NAMES = ("fast", "balanced", "quality")


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "si", "sí"}


@dataclass(frozen=True)
class AIConfig:
    enabled: bool
    provider: str
    ollama_base_url: str
    chat_models: dict[str, str]
    embedding_model: str
    default_profile: str
    request_timeout: int
    max_context_chunks: int

    def model_for(self, profile: str) -> str:
        if profile not in PROFILE_NAMES:
            raise ValueError("Perfil de IA inválido")
        return self.chat_models[profile]


def load_ai_config() -> AIConfig:
    profile = os.environ.get("OLLAMA_CHAT_PROFILE", "balanced").strip().lower()
    if profile not in PROFILE_NAMES:
        profile = "balanced"
    return AIConfig(
        enabled=_env_bool("AI_FEATURE_ENABLED", True),
        provider=os.environ.get("AI_PROVIDER", "local").strip().lower(),
        ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
        chat_models={
            "fast": os.environ.get("OLLAMA_CHAT_MODEL_FAST", "qwen3:4b-instruct").strip(),
            "balanced": os.environ.get("OLLAMA_CHAT_MODEL_BALANCED", "qwen3:8b").strip(),
            "quality": os.environ.get("OLLAMA_CHAT_MODEL_QUALITY", "qwen3:14b").strip(),
        },
        embedding_model=os.environ.get("OLLAMA_EMBEDDING_MODEL", "qwen3-embedding:0.6b").strip(),
        default_profile=profile,
        request_timeout=max(10, min(int(os.environ.get("AI_REQUEST_TIMEOUT", "420")), 600)),
        max_context_chunks=max(1, min(int(os.environ.get("AI_MAX_CONTEXT_CHUNKS", "12")), 50)),
    )
