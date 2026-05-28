from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./fantag.db"

    # ── OCR provider: "claude" or "openai"
    OCR_PROVIDER: str = "claude"

    # ── Anthropic (Claude Vision)
    ANTHROPIC_API_KEY: str = ""

    # ── OpenAI (GPT-4o Vision)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    DAILY_POLL_HOUR: int = 6
    DAILY_POLL_MINUTE: int = 0
    MLB_STATS_API: str = "https://statsapi.mlb.com/api/v1"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
