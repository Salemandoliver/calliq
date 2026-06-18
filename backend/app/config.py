"""Central configuration. Everything is set via environment variables (see .env.example)."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Core
    app_name: str = "CallIQ"
    database_url: str = "sqlite:///./calliq.db"
    jwt_secret: str = "change-me-in-production"
    jwt_expiry_hours: int = 12
    audio_dir: str = "./audio"
    cors_origins: str = "*"

    # Demo mode: app runs fully on synthetic data, no external APIs needed
    demo_mode: bool = True

    # Transcription (Deepgram)
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en-GB"

    # LLM (Anthropic Claude)
    anthropic_api_key: str = ""
    claude_call_model: str = "claude-haiku-4-5-20251001"   # per-call analysis (cheap, fast)
    claude_report_model: str = "claude-sonnet-4-6"          # weekly coaching reports

    # RingCentral
    ringcentral_server_url: str = "https://platform.ringcentral.com"
    ringcentral_client_id: str = ""
    ringcentral_client_secret: str = ""
    ringcentral_jwt: str = ""
    ringcentral_webhook_secret: str = ""  # validation token we set on the subscription
    # Pilot/local mode: poll the call log every N minutes instead of relying on the
    # webhook (use when the app has no public URL). 0 = disabled.
    rc_poll_minutes: int = 0
    # CallIQ Agent (Teams recordings)
    recordings_api_key: str = ""

    # Compliance
    retention_days: int = 0  # 0 = keep forever; >0 = worker purges audio+transcripts older than N days

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
