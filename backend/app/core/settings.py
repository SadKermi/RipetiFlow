"""Application settings, read from environment variables (and `.env` in development)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_ISSUER = "ripetiflow-dev"
DEFAULT_DEV_JWT_SECRET = "ripetiflow-dev-only-secret-never-use-in-production"  # noqa: S105
# The only identity a demo (HS256) token may carry (D-30): never a real tutor.
DEV_DEMO_USER_ID = uuid.UUID("00000000-0000-4000-8000-00000000de30")
DEV_DEMO_EMAIL = "demo@ripetiflow.local"
_LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres", "db"}

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-6-luna",
    "anthropic": "claude-haiku-4-5",
}


class ModelPrice(BaseModel):
    """USD per 1M tokens (equivalently: micro-USD per token)."""

    input: Decimal
    output: Decimal
    cached_input: Decimal
    # Prompt-cache writes; None = billed as plain input (no write premium).
    cache_write: Decimal | None = None


DEFAULT_PRICES: dict[str, ModelPrice] = {
    "gpt-6-luna": ModelPrice(input=Decimal("0.10"), output=Decimal("0.50"), cached_input=Decimal("0.01")),
    # Anthropic: 5-minute cache writes cost 1.25x input (the adapter uses the default 5-minute TTL).
    "claude-haiku-4-5": ModelPrice(
        input=Decimal("1"), output=Decimal("5"), cached_input=Decimal("0.10"), cache_write=Decimal("1.25")
    ),
    "claude-sonnet-5-5": ModelPrice(
        input=Decimal("2"), output=Decimal("10"), cached_input=Decimal("0.20"), cache_write=Decimal("2.50")
    ),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Fail closed: without an explicit APP_ENV=development the app behaves as production.
    app_env: Literal["development", "production"] = "production"
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
    assistant_timeout_seconds: float = 45.0  # each model call
    assistant_total_timeout_seconds: float = Field(default=60.0, gt=0)  # the whole request (all rounds)
    # Reasoning/thinking tokens count toward this limit too: it must leave room for the JSON answer.
    assistant_max_output_tokens: int = Field(default=8000, ge=1000)
    assistant_prices: dict[str, ModelPrice] = Field(default_factory=lambda: dict(DEFAULT_PRICES))

    # Demo mode (D-30): never allowed in production.
    dev_auth: bool = False
    dev_jwt_secret: SecretStr = SecretStr(DEFAULT_DEV_JWT_SECRET)

    @field_validator(
        "google_client_secret", "token_encryption_key", "openai_api_key", "anthropic_api_key", mode="before"
    )
    @classmethod
    def _blank_secret_is_unset(cls, value: Any) -> Any:
        # `KEY=` in a .env copied from the template means "not configured", not "empty key".
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("token_encryption_key")
    @classmethod
    def _valid_fernet_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            try:
                Fernet(value.get_secret_value())
            except ValueError as exc:
                raise ValueError(
                    "TOKEN_ENCRYPTION_KEY non è una chiave Fernet valida (32 byte in base64 url-safe). "
                    'Generala con: python -c "from cryptography.fernet import Fernet; '
                    'print(Fernet.generate_key().decode())"'
                ) from exc
        return value

    @model_validator(mode="after")
    def _guard_dev_auth(self) -> Settings:
        if not self.dev_auth:
            return self
        if self.app_env == "production":
            raise ValueError("DEV_AUTH=1 non è ammesso con APP_ENV=production")
        host = urlsplit(self.database_url).hostname or ""
        if host not in _LOCAL_DB_HOSTS:
            # Demo tokens are signed with a shared secret: never against a real (remote) database.
            raise ValueError(f"DEV_AUTH=1 è ammesso solo con un database locale (host attuale: {host!r})")
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
            key = self.openai_api_key
        elif self.assistant_provider == "anthropic":
            key = self.anthropic_api_key
        else:
            return False
        return key is not None and bool(key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
