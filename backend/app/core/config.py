"""Application configuration.

All values are read from environment variables (or an untracked .env file).
No configuration is imported into browser code; only the public API URL is
exposed to the frontend via NEXT_PUBLIC_API_BASE_URL.
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "ORBITAL API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # Local defaults are development-only. Never reuse these credentials outside
    # a developer workstation. The value is never logged or sent to the browser.
    database_url: str = (
        "postgresql+psycopg://orbital:orbital_dev_only@localhost:5432/orbital"
    )

    # Comma-separated list of exact browser origins allowed by CORS.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    api_v1_prefix: str = "/api/v1"

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        normalized = value.upper()
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
        if normalized not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}")
        return normalized

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("database_url must not be empty")
        return value.strip()

    @field_validator("cors_origins")
    @classmethod
    def _validate_cors_origins(cls, value: str) -> str:
        origins = [item.strip() for item in value.split(",") if item.strip()]
        if not origins:
            raise ValueError("cors_origins must contain at least one origin")
        if "*" in origins:
            raise ValueError(
                "cors_origins must list explicit origins; '*' is not allowed"
            )
        for origin in origins:
            if not (origin.startswith("http://") or origin.startswith("https://")):
                raise ValueError(f"cors origin must be an http(s) origin: {origin}")
        return ",".join(origins)

    @property
    def cors_origin_list(self) -> list[str]:
        return [item for item in self.cors_origins.split(",") if item]


@lru_cache
def get_settings() -> Settings:
    return Settings()
