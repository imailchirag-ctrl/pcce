from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    app_name: str = "SkillBridge AI Services"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"

    # Local persistence. The demo uses SQLite so the platform works without a
    # Supabase connection; the Prisma schema remains the production contract.
    data_dir: Path = Field(default=BACKEND_DIR / "data")
    database_path: Path = Field(default=BACKEND_DIR / "data" / "skillbridge.db")

    # Models are cached inside the repo but excluded from Git.
    model_cache_dir: Path = Field(default=BACKEND_DIR / "models")

    # Pretrained NLP / embedding models.
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_model_fallback: str = "sentence-transformers/paraphrase-MiniLM-L3-v2"
    spacy_model: str = "en_core_web_sm"
    enable_embeddings: bool = True
    enable_spacy: bool = True

    # Optional reranker (not downloaded automatically because BGE-M3 is ~2.2 GB).
    enable_reranker: bool = False
    reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # Optional local generation through Ollama.
    enable_llm: bool = True
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5-coder:3b"
    ollama_timeout_seconds: int = 75
    ollama_num_predict: int = 420

    # Career Quest routes tasks to installed local models, one at a time.
    career_quest_manager_model: str = "qwen2.5:7b"
    career_quest_coder_model: str = "qwen2.5-coder:3b"
    career_quest_fallback_model: str = "gemma2:2b"
    career_quest_model_timeout_seconds: int = 20

    # Player code is sent only to a separately operated isolated Judge0 service.
    # No local execution fallback is supported.
    career_quest_runner_url: str = ""
    career_quest_runner_token: str = ""
    career_quest_runner_language_id: int = 71
    career_quest_runner_timeout_seconds: int = 20

    # Optional speech-to-text. Browser speech recognition is the default voice
    # path so no weight download is required for the core interview flow.
    enable_whisper: bool = False
    whisper_model: str = "small"

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Shared secret for trusted server-to-server calls from Next.js (for example
    # the Google OAuth callback). Set the same value in the root .env.
    internal_api_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", PROJECT_DIR / ".env.local", PROJECT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.model_cache_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
