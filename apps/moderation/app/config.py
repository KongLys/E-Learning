"""Runtime configuration loaded from environment variables."""
import json
import os
from functools import lru_cache

# Canonical labels the rest of the system understands. Only `it` is allowed.
CANONICAL_LABELS = ("it", "spam_toxic", "others")
ALLOWED_LABEL = "it"


class Settings:
    def __init__(self) -> None:
        # Path to the trained HuggingFace model directory (config.json, weights, tokenizer).
        self.model_path: str = os.getenv("MODEL_PATH", "/app/models")
        # Max tokens fed to the model per segment (PhoBERT-base = 256).
        self.max_length: int = int(os.getenv("MODEL_MAX_LENGTH", "256"))
        # Optional API key; when set, requests must send header `X-Api-Key`.
        self.api_key: str = os.getenv("MODERATION_API_KEY", "")
        # Run inference on GPU when available and explicitly enabled.
        self.use_cuda: bool = os.getenv("MODEL_USE_CUDA", "false").lower() == "true"
        # Log every classify request + result (toggle for easy tracing).
        self.log_requests: bool = os.getenv("LOG_REQUESTS", "true").lower() == "true"
        # Optional mapping: raw model label (from config.id2label) -> canonical label.
        # Example: LABEL_MAP='{"LABEL_0":"spam_toxic","LABEL_1":"it","LABEL_2":"others"}'
        raw = os.getenv("LABEL_MAP", "").strip()
        self.label_map: dict[str, str] = json.loads(raw) if raw else {}


@lru_cache
def get_settings() -> Settings:
    return Settings()
