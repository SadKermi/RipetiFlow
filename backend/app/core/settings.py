"""Application settings, read from environment variables (and `.env` in development)."""

from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_ISSUER = "ripetiflow-dev"
DEFAULT_DEV_JWT_SECRET = "ripetiflow-dev-only-secret-never-use-in-production"  # noqa: S105

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-6-luna",
    "anthropic": "claude-haiku-4-5",
}


class ModelPrice(BaseModel):
    """USD per 1M tokens (equivalently: micro-USD per token)."""

    input: Decimal
    output: Decimal
    cached_input: Decimal


DEFAULT_PRICES: dict[str, ModelPrice] = {
    "gpt-6-luna": ModelPrice(input=Decimal("0.10"), output=Decimal("0.50"), cached_input=Decimal("0.01")),
    "claude-haiku-4-5": ModelPrice(input=Decimal("1"), output=Decimal("5"), cached_input=Decimal("0.10")),
    "claude-sonnet-5-5": ModelPrice(input=Decimal("2"), output=Decimal("10"), cached_input=Decimal("0.20")),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "production"] = "development"
    log_level: str = "INFO"

    database_url: str = "postgresql://postgres@localhost:54329/ripetiflow"
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10

    supabase_url: str = "https://afaowzrghvqnqcovxtqu.supabase.co"
    supabase_publishable_key: str = ""
    google_login_enabled: bool = True
    magic_link_enabled: bool = True

    public_app_url: str = "http://localhost:5173"
    static_dir: Path | None = None

    # Google Calendar (D-31)
    google_client_id: str = ""
    google_client_secret: SecretStr | None = None
    token_encryption_key: SecretStr | None = None
    calendar_worker_enabled: bool = True
    calendar_worker_interval_seconds: float = 10.0

    # Matita (D-40..D-42)
    assistant_provider: Literal["openai", "anthropic", "none"] = "openai"
    assistant_model: str | None = None
    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    assistant_daily_limit: int = Field(default=60, ge=1)
    assistant_timeout_seconds: float = 45.0
    assistant_max_output_tokens: int = 2000
    assistant_prices: dict[str, ModelPrice] = Field(default_factory=lambda: dict(DEFAULT_PRICES))

    # Demo mode (D-30): never allowed in production.
    dev_auth: bool = False
    dev_jwt_secret: SecretStr = SecretStr(DEFAULT_DEV_JWT_SECRET)

    @model_validator(mode="after")
    def _guard_dev_auth(self) -> Settings:
        if self.dev_auth and self.app_env == "production":
            raise ValueError("DEV_AUTH=1 non è ammesso con APP_ENV=production")
        return self

    @property
    def dev_auth_enabled(self) -> bool:
        return self.dev_auth and self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def calendar_sync_available(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.token_encryption_key)

    @property
    def resolved_assistant_model(self) -> str:
        if self.assistant_model:
            return self.assistant_model
        return DEFAULT_MODELS.get(self.assistant_provider, "")

    @property
    def assistant_available(self) -> bool:
        if self.assistant_provider == "openai":
            return self.openai_api_key is not None
        if self.assistant_provider == "anthropic":
            return self.anthropic_api_key is not None
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()
