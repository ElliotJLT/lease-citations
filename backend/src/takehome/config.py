from __future__ import annotations

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://lease:lease@db:5432/lease_citations"
    anthropic_api_key: str = ""
    upload_dir: str = "uploads"
    max_upload_size: int = 25 * 1024 * 1024  # 25MB

    # `.env` also carries the Docker Compose service env (API_PORT, POSTGRES_*) — this process
    # doesn't use them, but running natively means they arrive through the same file, not just
    # as container env vars pydantic-settings would otherwise never see. Ignoring unknown keys
    # is what keeps that shared file from crashing the app before it serves a request.
    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

# Ensure the Anthropic API key is available as an environment variable
# so that pydantic-ai's Anthropic integration can pick it up.
if settings.anthropic_api_key:
    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
