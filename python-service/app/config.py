import os
import shutil
from pathlib import Path
from pydantic import computed_field
from pydantic_settings import BaseSettings

_BASE_DIR = Path(__file__).resolve().parent.parent.parent  # python-service/


def _resolve_ffmpeg() -> str:
    """Resolve the ffmpeg path, searching PATH if needed."""
    env_path = os.getenv("FFMPEG_PATH", "")
    if env_path:
        resolved = shutil.which(env_path)
        if resolved:
            return resolved
        return env_path
    resolved = shutil.which("ffmpeg")
    if resolved:
        return resolved
    resolved = shutil.which("ffmpeg.exe")
    if resolved:
        return resolved
    # Common Windows locations
    common_paths = [
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    ]
    for p in common_paths:
        if os.path.exists(p):
            return p
    return "ffmpeg"


def _resolve_ytdlp() -> str:
    """Resolve the yt-dlp path, searching PATH if needed."""
    env_path = os.getenv("YT_DLP_PATH", "")
    if env_path:
        resolved = shutil.which(env_path)
        if resolved:
            return resolved
        return env_path
    resolved = shutil.which("yt-dlp")
    if resolved:
        return resolved
    return "yt-dlp"


class Settings(BaseSettings):
    APP_NAME: str = "Universal Downloader Python Service"
    APP_VERSION: str = "1.0.0"
    HOST: str = os.getenv("PYTHON_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PYTHON_PORT", "8001"))
    DOWNLOAD_DIR: str = os.getenv("DOWNLOAD_DIR", str(_BASE_DIR / "downloads"))
    YT_DLP_PATH: str = ""
    FFMPEG_PATH: str = ""
    COOKIES_DIR: str = str(_BASE_DIR / "cookies")
    MAX_CONCURRENT_DOWNLOADS: int = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
    DEFAULT_FORMAT: str = os.getenv("DEFAULT_FORMAT", "best")
    PROXY_URL: str = os.getenv("PROXY_URL", "")
    SERVER_URL: str = os.getenv("SERVER_URL", "http://localhost:3001")
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3001"]
    INSTAGRAM_USERNAME: str = os.getenv("INSTAGRAM_USERNAME", "")
    INSTAGRAM_PASSWORD: str = os.getenv("INSTAGRAM_PASSWORD", "")
    SPOTIFY_CLIENT_ID: str = os.getenv("SPOTIFY_CLIENT_ID", "")
    SPOTIFY_CLIENT_SECRET: str = os.getenv("SPOTIFY_CLIENT_SECRET", "")
    SPOTDL_PYTHON: str = os.getenv("SPOTDL_PYTHON", "")
    USER_AGENT: str = os.getenv(
        "USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    @computed_field
    @property
    def DEBUG(self) -> bool:
        return os.getenv("PYTHON_ENV", "development") == "development"

    class Config:
        # Root .env (shared with the Node server). Relative fallback for when
        # the service is started from inside python-service/.
        env_file = str(
            os.path.join(_BASE_DIR, ".env")
            if os.path.exists(os.path.join(_BASE_DIR, ".env"))
            else ".env"
        )
        extra = "ignore"


settings = Settings()
# Resolve actual paths after initialization
settings.FFMPEG_PATH = _resolve_ffmpeg()
settings.YT_DLP_PATH = _resolve_ytdlp()
# spotdl is isolated in its own venv so its heavy deps never touch the app.
if not settings.SPOTDL_PYTHON:
    _default_spotdl = _BASE_DIR / "venv-spotdl" / "Scripts" / "python.exe"
    if os.path.exists(_default_spotdl):
        settings.SPOTDL_PYTHON = str(_default_spotdl)
else:
    # Allow SPOTDL_PYTHON to be relative to the repo root (e.g. from .env).
    if not os.path.exists(settings.SPOTDL_PYTHON):
        _joined = os.path.normpath(os.path.join(_BASE_DIR, settings.SPOTDL_PYTHON))
        if os.path.exists(_joined):
            settings.SPOTDL_PYTHON = _joined

print(f"[Config] FFmpeg path: {settings.FFMPEG_PATH}")
print(f"[Config] yt-dlp path: {settings.YT_DLP_PATH}")
print(f"[Config] Download dir: {settings.DOWNLOAD_DIR}")
print(f"[Config] spotdl python: {settings.SPOTDL_PYTHON or '(not found)'}")

os.makedirs(settings.DOWNLOAD_DIR, exist_ok=True)
os.makedirs(settings.COOKIES_DIR, exist_ok=True)
