from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    fb_host: str
    fb_port: str = "3050"
    fb_database: str
    fb_user: str
    fb_password: str
    fb_charset: str = "ISO8859_1"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Provedor de LLM para recomendação. Primário + fallback opcional.
    llm_provider: str = "gemini"  # gemini | openai | anthropic
    llm_fallback: str = ""        # vazio = sem fallback

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"

    monitor_interval_minutes: int = 5
    stock_alert_factor: float = 1.1
    stock_restore_factor: float = 1.5

    # Remessas: alerta quando consumo do estoque antigo atinge (1 - threshold).
    stock_preco_alert_pct: float = 0.20
    remessa_check_minutes: int = 5

    catalog_refresh_seconds: int = 60

    cache_ttl_hours: int = 24

    backup_retention: int = 7

    sqlite_path: Path = Field(default=PROJECT_ROOT / "data" / "casa_granum.db")

    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
