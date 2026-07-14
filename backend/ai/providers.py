from __future__ import annotations

import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any

from .config import AIConfig


class AIProviderError(RuntimeError):
    """Error seguro que no incluye contenido jurídico ni secretos."""


class AIProvider(ABC):
    @abstractmethod
    def health_check(self) -> dict[str, Any]: ...

    @abstractmethod
    def list_available_models(self) -> list[str]: ...

    @abstractmethod
    def generate(self, prompt: str, model: str, *, think: bool = False) -> str: ...

    @abstractmethod
    def generate_structured(self, prompt: str, model: str, schema: dict[str, Any]) -> dict[str, Any]: ...

    @abstractmethod
    def create_embeddings(self, texts: list[str], model: str) -> list[list[float]]: ...


class LocalAIProvider(AIProvider):
    def __init__(self, config: AIConfig):
        self.config = config

    def _request(self, path: str, payload: dict[str, Any] | None = None, timeout: int | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            f"{self.config.ollama_base_url}{path}", data=data,
            headers={"Content-Type": "application/json"} if data else {},
            method="POST" if data else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout or self.config.request_timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise AIProviderError("Ollama no está disponible o no respondió a tiempo") from error

    def health_check(self) -> dict[str, Any]:
        try:
            version = self._request("/api/version", timeout=5).get("version", "")
            return {"available": True, "version": str(version)}
        except AIProviderError:
            return {"available": False, "version": ""}

    def list_available_models(self) -> list[str]:
        result = self._request("/api/tags", timeout=10)
        return sorted(str(item.get("name", "")) for item in result.get("models", []) if item.get("name"))

    def generate(self, prompt: str, model: str, *, think: bool = False) -> str:
        result = self._request("/api/generate", {
            "model": model, "prompt": prompt, "stream": False, "think": think,
            "options": {"temperature": 0},
        })
        return str(result.get("response", "")).strip()

    def generate_structured(self, prompt: str, model: str, schema: dict[str, Any]) -> dict[str, Any]:
        result = self._request("/api/generate", {
            "model": model, "prompt": prompt, "stream": False, "think": False,
            "format": schema, "options": {"temperature": 0, "num_predict": 180},
        })
        try:
            parsed = json.loads(str(result.get("response", "")))
        except json.JSONDecodeError as error:
            raise AIProviderError("El modelo no devolvió una respuesta estructurada válida") from error
        if not isinstance(parsed, dict):
            raise AIProviderError("El resultado estructurado no es un objeto")
        return parsed

    def create_embeddings(self, texts: list[str], model: str) -> list[list[float]]:
        result = self._request("/api/embed", {"model": model, "input": texts})
        embeddings = result.get("embeddings", [])
        if len(embeddings) != len(texts):
            raise AIProviderError("Ollama devolvió una cantidad inesperada de vectores")
        return embeddings


class MockAIProvider(AIProvider):
    def health_check(self) -> dict[str, Any]:
        return {"available": True, "version": "mock"}

    def list_available_models(self) -> list[str]:
        return ["mock-chat", "mock-embedding"]

    def generate(self, prompt: str, model: str, *, think: bool = False) -> str:
        return f"Respuesta simulada para {model}."

    def generate_structured(self, prompt: str, model: str, schema: dict[str, Any]) -> dict[str, Any]:
        if "answer" in schema.get("properties", {}):
            return {"answer": "Respuesta simulada respaldada.", "source_ids": ["S1"], "caveats": ["Revisión humana requerida."], "insufficient_evidence": False}
        return {"summary": "Resultado simulado", "sources": [], "human_review_required": True}

    def create_embeddings(self, texts: list[str], model: str) -> list[list[float]]:
        return [[float(len(text)), 0.0, 1.0] for text in texts]
