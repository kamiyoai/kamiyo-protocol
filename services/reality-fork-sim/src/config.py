"""Environment-based configuration for the Reality Fork simulation service."""

import os
import sys


def _require_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        print(f"FATAL: {key} environment variable is required but not set", file=sys.stderr)
        sys.exit(1)
    return val


ANTHROPIC_API_KEY: str = _require_env("ANTHROPIC_API_KEY")
LLM_MODEL: str = os.environ.get("LLM_MODEL", "claude-sonnet-4-5-20250514")
LLM_MODEL_LARGE: str = os.environ.get("LLM_MODEL_LARGE", "claude-sonnet-4-5-20250514")
PORT: int = int(os.environ.get("PORT", "10000"))
OASIS_ENABLED: bool = os.environ.get("OASIS_ENABLED", "false").lower() == "true"

# Concurrency / timeout settings
LLM_MAX_RETRIES: int = int(os.environ.get("LLM_MAX_RETRIES", "2"))
LLM_TIMEOUT_SECONDS: int = int(os.environ.get("LLM_TIMEOUT_SECONDS", "120"))
MAX_UPLOAD_SIZE_MB: int = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "20"))

# Allowed origins for CORS (comma-separated, or * for all)
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
] or ["*"]
