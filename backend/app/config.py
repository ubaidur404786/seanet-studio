"""
app/config.py - every setting the backend reads, in one place.

All settings come from environment variables, so the SAME code runs on my laptop, in Docker and on
Render - only the variables change. Nothing secret (like the LLM key) is ever written
in the code or committed to git.

The LLM part uses the "OpenAI-compatible" chat API. Many free providers speak that same format
(Groq, Google Gemini, OpenRouter, a local Ollama), so switching provider = changing 3 variables,
no code change.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # where the model folders live (each one has a manifest.json)
    models_dir: Path = BACKEND_DIR / "models"
    # the built frontend (Docker copies it here). None = API only, e.g. during local dev
    static_dir: Path | None = None

    # LLM (free tier). no key -> we still answer, with a template explanation instead.
    # providers retire models from time to time (on 2026-10-13 Groq no longer offered llama-3.3-70b-versatile),
    # so the server checks at start-up that the model is still offered - see Explainer.check()
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    # gpt-oss is a "thinking" model: it reasons first, then writes. "low" keeps that short and fast.
    # leave it empty for models that do not think (they may reject the setting)
    llm_reasoning_effort: str = "low"
    # the thinking tokens count too, so this is much higher than the ~160 words we actually want
    llm_max_tokens: int = 1000
    llm_timeout_s: float = 20.0

    # protect the free LLM quota on a public demo: max explanations per visitor per window
    explain_limit: int = 20
    explain_window_s: int = 600

    allowed_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key)


def load_settings() -> Settings:
    """Build the settings from environment variables (missing ones keep the defaults above)."""
    defaults = Settings()
    static = _env("STATIC_DIR")
    origins = _env("ALLOWED_ORIGINS")
    return Settings(
        models_dir=Path(_env("MODELS_DIR")) if _env("MODELS_DIR") else defaults.models_dir,
        static_dir=Path(static) if static else None,
        llm_base_url=_env("LLM_BASE_URL", defaults.llm_base_url).rstrip("/"),
        llm_api_key=_env("LLM_API_KEY"),
        llm_model=_env("LLM_MODEL", defaults.llm_model),
        # LLM_REASONING_EFFORT= (set but empty) turns it off, a missing variable keeps "low"
        llm_reasoning_effort=_env("LLM_REASONING_EFFORT", defaults.llm_reasoning_effort),
        llm_max_tokens=int(_env("LLM_MAX_TOKENS", str(defaults.llm_max_tokens))),
        llm_timeout_s=float(_env("LLM_TIMEOUT_S", str(defaults.llm_timeout_s))),
        explain_limit=int(_env("EXPLAIN_LIMIT", str(defaults.explain_limit))),
        explain_window_s=int(_env("EXPLAIN_WINDOW_S", str(defaults.explain_window_s))),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()] if origins
        else defaults.allowed_origins,
    )
