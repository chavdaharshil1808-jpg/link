from __future__ import annotations

import os
import re
import uuid
import json
import asyncio
import logging
import shutil
from typing import Any, Optional
from pathlib import Path
from urllib.parse import urlparse

import subprocess
import yt_dlp
from app.config import settings

logger = logging.getLogger(__name__)

MEDIA_TYPE_PATTERNS = {
    "SHORT": re.compile(
        r"(youtube\.com/shorts/|tiktok\.com/|instagram\.com/reel/|facebook\.com/reel/|vm\.tiktok\.com/)",
        re.IGNORECASE,
    ),
    "PLAYLIST": re.compile(r"(list=|playlist\?|/playlist/)", re.IGNORECASE),
}

# Platforms that require authentication/cookies
AUTH_REQUIRED_PLATFORMS = {
    "instagram.com": True,
    "instagram": True,
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".rtf",
    ".odt",
    ".ods",
    ".odp",
}
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".zst"}

DOWNLOAD_TASKS: dict[str, dict[str, Any]] = {}


def _needs_auth(url: str) -> bool:
    """Check if the URL requires authentication (e.g., Instagram)."""
    for platform in AUTH_REQUIRED_PLATFORMS:
        if platform in url.lower():
            return True
    return False


def _is_youtube_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return "youtube.com" in host or "youtu.be" in host


def _is_bot_check(error_msg: str) -> bool:
    lowered = error_msg.lower()
    return (
        "sign in" in lowered
        or "not a bot" in lowered
        or "confirm you're not a bot" in lowered
    )


def _clean_download_error(e: Exception, url: str = "") -> ValueError:
    """Convert a yt-dlp failure into a clean, user-facing ValueError (HTTP 400).

    The raw yt-dlp messages include "ERROR:" prefixes and long instructional
    URLs that are not useful in the UI. Expected failures (bot checks, private
    / unavailable / age-restricted / geo-blocked content) map to clear messages
    instead of leaking as 500 Internal Server Errors.
    """
    msg = str(e)
    if msg.startswith("ERROR: "):
        msg = msg[len("ERROR: "):]
    for marker in ("See https://", "Use --cookies", "Also see", "See  https://"):
        idx = msg.find(marker)
        if idx != -1:
            msg = msg[:idx].rstrip(" .") + "."
            break
    lowered = msg.lower()

    if _is_bot_check(msg):
        return ValueError(
            "This video is currently blocked by YouTube's bot check. "
            "Please try again in a little while, or log in to YouTube in Chrome/Edge "
            "so valid browser cookies can be used."
        )
    if "private" in lowered or "not available" in lowered or "unavailable" in lowered:
        return ValueError("This media is private or no longer available.")
    if "age" in lowered and "restrict" in lowered:
        return ValueError("This content is age-restricted and cannot be downloaded.")
    if "not available in your country" in lowered or "geo" in lowered:
        return ValueError("This content is blocked in your region.")
    if "sign in" in lowered or "login" in lowered or "authentication" in lowered:
        return ValueError("Authentication may be required to access this content.")
    return ValueError(msg or "Download failed")


def _with_youtube_client_override(opts: dict[str, Any]) -> dict[str, Any]:
    """Force YouTube player clients as a last-resort fallback.

    NOT applied by default: forcing android/ios/tv clients returns far fewer
    usable formats than yt-dlp's own default extraction (which handles PO
    tokens), so it makes bot-checked videos worse. Only used to retry after the
    default attempt is blocked with a "Sign in to confirm you're not a bot"
    error, where the alternate clients can sometimes still be bypassed.
    """
    opts = dict(opts)
    opts["extractor_args"] = {
        "youtube": {
            "player_client": ["android", "ios", "web_safari", "tv", "web"],
        },
    }
    return opts


def _get_browser_cookies() -> Optional[str]:
    """Try to extract cookies from installed browsers for authentication-required sites.
    Returns browser name if available, None otherwise.
    Does NOT test Chrome cookie extraction to avoid locked-DB errors."""
    browsers_to_try = [
        ("chrome", "chrome.exe"),
        ("chromium", "chromium.exe"),
        ("brave", "brave.exe"),
        ("edge", "msedge.exe"),
        ("firefox", "firefox.exe"),
        ("opera", "opera.exe"),
    ]
    for browser_name, browser_exe in browsers_to_try:
        try:
            result = subprocess.run(
                ["where", browser_exe], capture_output=True, text=True, timeout=3
            )
            if result.returncode == 0:
                logger.info(f"Found browser: {browser_name}")
                return browser_name
        except Exception:
            continue
    return None


def _find_cookie_file() -> Optional[str]:
    """Look for cookies.txt files in standard locations."""
    search_paths = [
        os.path.join(settings.COOKIES_DIR, "cookies.txt"),
        os.path.join(os.path.dirname(settings.COOKIES_DIR), "cookies.txt"),
        os.path.join(
            os.path.dirname(os.path.dirname(settings.COOKIES_DIR)), "cookies.txt"
        ),
    ]
    for path in search_paths:
        if os.path.exists(path):
            logger.info(f"Found cookie file: {path}")
            return path
    return None


def _write_cookie_content(cookie_content: Optional[str]) -> Optional[str]:
    """Write Netscape cookie content to a temp file and return its path."""
    if not cookie_content or not cookie_content.strip():
        return None
    try:
        temp_dir = os.path.join(settings.COOKIES_DIR, "session")
        os.makedirs(temp_dir, exist_ok=True)
        path = os.path.join(temp_dir, f"cookies_{uuid.uuid4().hex}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(cookie_content)
        return path
    except Exception as e:
        logger.warning(f"Failed to write cookie content: {e}")
        return None


def _cleanup_cookie_file(path: Optional[str]) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _check_cookie_file_has_sessionid(cookie_path: str) -> bool:
    """Check if the cookie file contains a sessionid cookie for Instagram."""
    if not cookie_path or not os.path.exists(cookie_path):
        return False
    try:
        with open(cookie_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "sessionid" in line:
                    parts = line.split("\t")
                    if len(parts) >= 7 and parts[5] == "sessionid" and parts[6]:
                        return True
    except Exception:
        pass
    return False


def _detect_media_type(info: dict[str, Any], url: str) -> str:
    for media_type, pattern in MEDIA_TYPE_PATTERNS.items():
        if pattern.search(url):
            return media_type

    if info.get("extractor_key") and info.get("entries"):
        return "PLAYLIST"

    duration = info.get("duration", 0) or 0
    if duration > 0 and duration <= 60:
        if info.get("extractor_key") in ("TikTok", "Instagram", "Youtube", "Facebook"):
            return "SHORT"

    ext = (info.get("ext") or "").lower()
    if ext in {"mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus"}:
        return "AUDIO"

    if any(
        info.get("url", "").lower().endswith(img)
        or ext.lstrip(".") in {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"}
        for img in IMAGE_EXTENSIONS
    ):
        return "IMAGE"

    if ext.lstrip(".") in {
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "txt",
        "csv",
        "rtf",
        "odt",
    }:
        return "DOCUMENT"

    if ext.lstrip(".") in {"zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst"}:
        return "ARCHIVE"

    if ext.lstrip(".") in {"avi", "mkv", "mov", "wmv", "flv", "3gp", "ts", "mts"}:
        return "VIDEO"

    return "VIDEO"


def _extract_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    formats = []
    seen = set()
    for fmt in info.get("formats", []):
        format_id = fmt.get("format_id", "")
        height = fmt.get("height")
        vcodec = fmt.get("vcodec", "none")
        acodec = fmt.get("acodec", "none")

        if vcodec == "none" and acodec == "none":
            continue

        label = (
            f"{height}p"
            if height and height != "none"
            else ("Audio Only" if vcodec == "none" else "Default")
        )
        key = f"{label}_{fmt.get('ext')}_{fmt.get('abr', 0)}"
        if key in seen:
            continue
        seen.add(key)

        formats.append(
            {
                "formatId": format_id,
                "url": fmt.get("url"),
                "ext": fmt.get("ext", "unknown"),
                "resolution": f"{fmt.get('width', '?')}x{fmt.get('height', '?')}"
                if fmt.get("width") and fmt.get("height")
                else "N/A",
                "height": height if height and height != "none" else None,
                "fps": fmt.get("fps"),
                "vcodec": vcodec if vcodec != "none" else None,
                "acodec": acodec if acodec != "none" else None,
                "abr": fmt.get("abr"),
                "filesize": fmt.get("filesize") or fmt.get("filesize_approx"),
                "formatNote": fmt.get("format_note", ""),
                "label": label,
                "hasVideo": vcodec != "none",
                "hasAudio": acodec != "none",
                "tbr": fmt.get("tbr"),
                "protocol": fmt.get("protocol"),
            }
        )
    return formats


def _is_progressive(fmt: dict[str, Any]) -> bool:
    """True for directly-playable (non-HLS/non-DASH-segmented) media URLs."""
    protocol = (fmt.get("protocol") or "").lower()
    if protocol in ("http", "https"):
        return True
    url = (fmt.get("url") or "").split("?")[0].lower()
    return url.endswith((".mp4", ".webm", ".m4v", ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac"))


def _compute_preview(
    info: dict[str, Any],
    media_type: str,
    formats: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Pick the best directly-playable stream for inline preview.

    Progressive (http/https) URLs are preferred so the browser can play the
    media natively; HLS manifests are only used as a last resort.
    """
    if media_type in ("DOCUMENT", "ARCHIVE", "FOLDER"):
        return None

    best = None
    if media_type == "AUDIO":
        candidates = [f for f in formats if f.get("hasAudio") and f.get("url")]
        progressive = [f for f in candidates if _is_progressive(f)]
        best = max(
            (progressive or candidates),
            key=lambda x: x.get("abr") or 0,
            default=None,
        )
    elif media_type == "IMAGE":
        best = next((f for f in formats if f.get("url")), None)
        if not best and info.get("url"):
            return {
                "url": info["url"],
                "formatId": None,
                "ext": info.get("ext"),
                "mediaType": media_type,
            }
    else:
        candidates = [
            f for f in formats if f.get("hasVideo") and f.get("hasAudio") and f.get("url")
        ]
        progressive = [f for f in candidates if _is_progressive(f)]
        best = max(
            (progressive or candidates),
            key=lambda x: x.get("height") or 0,
            default=None,
        )
        if not best:
            candidates = [f for f in formats if f.get("hasVideo") and f.get("url")]
            progressive = [f for f in candidates if _is_progressive(f)]
            best = max(
                (progressive or candidates),
                key=lambda x: x.get("height") or 0,
                default=None,
            )

    if not best or not best.get("url"):
        return None

    return {
        "url": best["url"],
        "formatId": best.get("formatId"),
        "ext": best.get("ext"),
        "mediaType": media_type,
    }


def _estimate_file_size(
    formats: list[dict[str, Any]],
    best_video: Optional[dict[str, Any]],
    best_audio: Optional[dict[str, Any]],
    duration: float,
) -> Optional[int]:
    """Best-effort estimate of the size of the auto-selected (best) media.

    Prefers an actual filesize reported for a merged/progressive format,
    then the sum of the best video + audio filesizes, then a bitrate-based
    approximation from the duration.
    """
    merged = [
        f.get("filesize")
        for f in formats
        if f.get("hasVideo") and f.get("hasAudio") and f.get("filesize")
    ]
    if merged:
        return int(max(merged))

    sizes = []
    if best_video and best_video.get("filesize"):
        sizes.append(int(best_video["filesize"]))
    if best_audio and best_audio.get("filesize"):
        sizes.append(int(best_audio["filesize"]))
    if sizes:
        return int(sum(sizes))

    if duration > 0:
        if best_video and best_audio:
            combined = (best_video.get("tbr") or best_video.get("abr") or 5000) + (
                best_audio.get("abr") or 192
            )
            return int((combined * duration) / 8)
        if best_video:
            return int(
                ((best_video.get("tbr") or best_video.get("abr") or 5000) * duration) / 8
            )
        if best_audio:
            return int(((best_audio.get("abr") or 192) * duration) / 8)
    return None


def _extract_subtitles(info: dict[str, Any]) -> list[dict[str, str]]:
    subtitles = []
    for lang, subs in (info.get("subtitles") or {}).items():
        if subs:
            subtitles.append(
                {
                    "lang": lang,
                    "url": subs[0].get("url", ""),
                    "name": subs[0].get("name", lang),
                }
            )
    auto_subs = info.get("automatic_captions") or {}
    for lang, subs in auto_subs.items():
        if lang not in (info.get("subtitles") or {}) and subs:
            subtitles.append(
                {
                    "lang": f"{lang} (auto)",
                    "url": subs[0].get("url", ""),
                    "name": subs[0].get("name", lang),
                }
            )
    return subtitles


class DownloaderService:
    def __init__(self):
        self.ytdlp_path = settings.YT_DLP_PATH
        self.ffmpeg_path = settings.FFMPEG_PATH
        self.download_dir = settings.DOWNLOAD_DIR
        self._active_downloads: dict[str, asyncio.Task] = {}

    def _base_opts(
        self, url: str = "", cookie_file: Optional[str] = None
    ) -> dict[str, Any]:
        opts: dict[str, Any] = {
            "paths": {"home": self.download_dir},
            "ffmpeg_location": self.ffmpeg_path,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 30,
            "retries": 3,
            "user_agent": settings.USER_AGENT,
        }
        if settings.PROXY_URL:
            opts["proxy"] = settings.PROXY_URL

        host = ""
        try:
            host = urlparse(url).netloc.lower()
        except Exception:
            pass

        is_youtube = "youtube.com" in host or "youtu.be" in host
        # Instagram + YouTube are the platforms that almost always need cookies.
        if url and (_needs_auth(url) or is_youtube):
            # Strategy 1: User-provided cookie content (highest priority)
            if cookie_file and os.path.exists(cookie_file):
                logger.info(f"Using user cookie file for {url}: {cookie_file}")
                opts["cookiefile"] = cookie_file
            # Strategy 2: Cookie file stored on disk
            if "cookiefile" not in opts:
                found_cookie_file = _find_cookie_file()
                if found_cookie_file:
                    if "instagram" in host:
                        if _check_cookie_file_has_sessionid(found_cookie_file):
                            logger.info(f"Using cookie file for {url}: {found_cookie_file}")
                            opts["cookiefile"] = found_cookie_file
                    elif os.path.getsize(found_cookie_file) > 0:
                        logger.info(f"Using cookie file for {url}: {found_cookie_file}")
                        opts["cookiefile"] = found_cookie_file
            # Strategy 3: Browser cookies - try Chrome, Edge, Firefox
            if "cookiefile" not in opts:
                for browser_name in ["chrome", "edge", "firefox"]:
                    try:
                        test_result = subprocess.run(
                            ["where", f"{browser_name}.exe"]
                            if os.name == "nt"
                            else ["which", browser_name],
                            capture_output=True,
                            text=True,
                            timeout=3,
                        )
                        if test_result.returncode == 0:
                            logger.info(f"Using cookies from {browser_name} for {url}")
                            opts["cookiesfrombrowser"] = (browser_name,)
                            break
                    except Exception:
                        continue
            # Strategy 4: Instagram credentials
            if (
                "cookiefile" not in opts
                and "cookiesfrombrowser" not in opts
                and "instagram" in host
                and settings.INSTAGRAM_USERNAME
                and settings.INSTAGRAM_PASSWORD
            ):
                logger.info(f"Using Instagram credentials for {url}")
                opts["username"] = settings.INSTAGRAM_USERNAME
                opts["password"] = settings.INSTAGRAM_PASSWORD
        return opts

    async def extract_raw(
        self, url: str, cookie_content: Optional[str] = None
    ) -> dict[str, Any]:
        """Extract the full (raw) yt-dlp info dict for a URL.

        Used internally by the DownloadManager so it can inspect entries
        (playlists / multi-item posts) without leaking the raw payload.
        """
        temp_cookie_file = _write_cookie_content(cookie_content)
        try:
            return await self._do_extract_raw(url, temp_cookie_file)
        finally:
            _cleanup_cookie_file(temp_cookie_file)

    async def _do_extract_raw(
        self, url: str, temp_cookie_file: Optional[str]
    ) -> dict[str, Any]:
        def _extract(use_client_override: bool = False):
            opts = self._base_opts(url, temp_cookie_file)
            if use_client_override:
                opts = _with_youtube_client_override(opts)
            opts["skip_download"] = True
            opts["format"] = "best"
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        def _handle_extract_error(e: Exception) -> None:
            error_msg = str(e).lower()
            if "private" in error_msg or "not available" in error_msg:
                raise ValueError("This media is private or unavailable.")
            if (
                "sign in" in error_msg
                or "login" in error_msg
                or "authentication" in error_msg
            ):
                raise ValueError(
                    "Authentication may be required to access this content."
                )
            if "age" in error_msg and "restrict" in error_msg:
                raise ValueError("This content is age-restricted.")
            if "not available in your country" in error_msg or "geo" in error_msg:
                raise ValueError("This content is blocked in your region.")
            raise ValueError(f"Could not extract info: {e}")

        for use_client_override in (False, True):
            try:
                return await asyncio.to_thread(_extract, use_client_override)
            except yt_dlp.utils.DownloadError as e:
                if (
                    not use_client_override
                    and _is_youtube_url(url)
                    and _is_bot_check(str(e))
                ):
                    logger.warning(
                        "YouTube bot-check on default clients, retrying with player-client override"
                    )
                    continue
                _handle_extract_error(e)
        raise ValueError("Could not extract info.")

    async def analyze_url(
        self, url: str, cookie_content: Optional[str] = None
    ) -> dict[str, Any]:
        temp_cookie_file = _write_cookie_content(cookie_content)

        try:
            return await self._do_analyze(url, temp_cookie_file)
        finally:
            _cleanup_cookie_file(temp_cookie_file)

    async def _do_analyze(
        self, url: str, temp_cookie_file: Optional[str]
    ) -> dict[str, Any]:
        def _extract(use_client_override: bool = False):
            opts = self._base_opts(url, temp_cookie_file)
            if use_client_override:
                opts = _with_youtube_client_override(opts)
            opts["skip_download"] = True
            opts["format"] = "best"
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        def _handle_extract_error(e: Exception) -> None:
            error_msg = str(e).lower()
            if "private" in error_msg or "not available" in error_msg:
                raise ValueError("This media is private or unavailable.")
            if (
                "sign in" in error_msg
                or "login" in error_msg
                or "authentication" in error_msg
            ):
                cookie_file = _find_cookie_file()
                has_sessionid = (
                    _check_cookie_file_has_sessionid(cookie_file)
                    if cookie_file
                    else False
                )
                if cookie_file and not has_sessionid and _needs_auth(url):
                    raise ValueError(
                        "Instagram requires a valid 'sessionid' cookie. "
                        "Your cookies.txt is missing 'sessionid'. "
                        "Run 'python export_instagram_cookies.py' to export cookies from Chrome, "
                        "or use a browser extension after logging into Instagram."
                    )
                raise ValueError(
                    "Authentication may be required to access this content."
                )
            if "age" in error_msg and "restrict" in error_msg:
                raise ValueError("This content is age-restricted.")
            if "not available in your country" in error_msg or "geo" in error_msg:
                raise ValueError("This content is blocked in your region.")
            raise ValueError(f"Could not extract info: {e}")

        info = None
        for use_client_override in (False, True):
            try:
                info = await asyncio.to_thread(_extract, use_client_override)
                break
            except yt_dlp.utils.DownloadError as e:
                if (
                    not use_client_override
                    and _is_youtube_url(url)
                    and _is_bot_check(str(e))
                ):
                    logger.warning(
                        "YouTube bot-check on default clients, retrying with player-client override"
                    )
                    continue
                _handle_extract_error(e)
        if info is None:
            raise ValueError("Could not extract info.")

        media_type = _detect_media_type(info, url)
        formats = _extract_formats(info)
        preview = _compute_preview(info, media_type, formats)

        video_formats = [f for f in formats if f["hasVideo"]]
        audio_formats = [f for f in formats if not f["hasVideo"] and f["hasAudio"]]

        best_video = max(
            video_formats, key=lambda x: x.get("height") or 0, default=None
        )
        best_audio = max(audio_formats, key=lambda x: x.get("abr") or 0, default=None)

        duration = info.get("duration") or 0
        file_size = _estimate_file_size(formats, best_video, best_audio, duration)
        extension = (
            info.get("ext")
            or (preview or {}).get("ext")
            or (best_video or best_audio or {}).get("ext")
        )
        resolution = info.get("resolution")
        if not resolution and best_video and best_video.get("height"):
            resolution = f"{best_video['height']}p"

        return {
            "url": url,
            "title": info.get("title", "Untitled"),
            "thumbnail": info.get("thumbnail", ""),
            "duration": duration,
            "uploader": info.get("uploader")
            or info.get("channel")
            or info.get("creator", "Unknown"),
            "mediaType": media_type,
            "platform": info.get("extractor_key", "Unknown"),
            "platformUrl": info.get("webpage_url") or info.get("original_url", url),
            "preview": preview,
            "resolution": resolution,
            "fileSize": file_size,
            "extension": extension,
        }

    async def get_formats(self, url: str) -> dict[str, Any]:
        def _extract():
            opts = self._base_opts(url)
            opts["skip_download"] = True
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        info = await asyncio.to_thread(_extract)
        formats = _extract_formats(info)
        return {
            "url": url,
            "title": info.get("title", "Untitled"),
            "formats": formats,
        }

    def _check_ffmpeg(self) -> bool:
        """Check if FFmpeg is usable by testing version query."""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                first_line = result.stdout.split("\n")[0] if result.stdout else ""
                logger.info(f"FFmpeg detected: {first_line[:80]}")
                # Check if FFmpeg is too old (before 2015)
                if "built on" in first_line:
                    import re

                    match = re.search(r"built on (\w+)\s+(\d+)", first_line)
                    if match:
                        year = int(match.group(2))
                        if year < 2020:
                            logger.warning(
                                f"FFmpeg is from {year} (very old). Modern codec merging may fail."
                            )
                return True
            logger.warning(
                f"FFmpeg at {self.ffmpeg_path} returned error code {result.returncode}"
            )
            return False
        except Exception as e:
            logger.warning(f"FFmpeg check failed: {e}")
            return False

    def _find_downloaded_file(self, dl_dir: str) -> Optional[str]:
        """Find the downloaded file in the download directory."""
        if not os.path.exists(dl_dir):
            return None
        for root, dirs, files in os.walk(dl_dir):
            for f in sorted(
                files,
                key=lambda x: os.path.getmtime(os.path.join(root, x)),
                reverse=True,
            ):
                return os.path.join(root, f)
        return None

    async def start_download(
        self,
        url: str,
        download_id: str,
        format_spec: str = "best",
        output_template: str = "%(title)s.%(ext)s",
        cookie_file: Optional[str] = None,
        cookie_content: Optional[str] = None,
        download_subtitles: bool = False,
    ) -> dict[str, Any]:
        dl_id = download_id or str(uuid.uuid4())
        temp_cookie_file = _write_cookie_content(cookie_content)
        if cookie_content and not cookie_file:
            cookie_file = temp_cookie_file
        dl_dir = os.path.join(self.download_dir, dl_id)
        output_path = os.path.join(dl_dir, output_template)
        os.makedirs(dl_dir, exist_ok=True)

        ffmpeg_usable = self._check_ffmpeg()

        task_info = {
            "id": dl_id,
            "url": url,
            "status": "downloading",
            "progress": 0,
            "speed": 0,
            "eta": 0,
            "filename": None,
            "filepath": None,
            "error": None,
            "step": "preparing",
        }
        DOWNLOAD_TASKS[dl_id] = task_info

        # Build format spec - prefer single-stream to avoid FFmpeg merging
        if format_spec == "audio":
            format_str = "bestaudio/best"
        elif format_spec in ("best", "merged"):
            if ffmpeg_usable:
                format_str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
            else:
                format_str = "best[ext=mp4]/best"
        else:
            format_str = format_spec

        try:
            return await self._do_download(
                dl_id, dl_dir, url, output_path, format_str, format_spec, cookie_file,
                download_subtitles, ffmpeg_usable, task_info, temp_cookie_file,
            )
        finally:
            _cleanup_cookie_file(temp_cookie_file)

    async def download_now(
        self,
        url: str,
        format_spec: str = "best",
        cookie_content: Optional[str] = None,
        download_subtitles: bool = False,
    ) -> dict[str, Any]:
        """Synchronously download media and return the resulting file.

        Used by the direct /api/download/fetch endpoint so the user always gets
        the real media bytes back (video/image/audio/document) instead of JSON.
        """
        dl_id = str(uuid.uuid4())
        result = await self.start_download(
            url=url,
            download_id=dl_id,
            format_spec=format_spec,
            cookie_content=cookie_content,
            download_subtitles=download_subtitles,
        )
        if result.get("status") != "completed" or not result.get("filepath"):
            raise ValueError(result.get("error") or "Download failed")
        filepath = result["filepath"]
        if not os.path.exists(filepath):
            raise ValueError("Downloaded file not found on disk")
        filename = result.get("filename") or os.path.basename(filepath)
        ext = os.path.splitext(filename)[1].lower()
        media_type = "FILE"
        if ext in IMAGE_EXTENSIONS:
            media_type = "IMAGE"
        elif ext in {
            ".mp3", ".wav", ".flac", ".aac", ".ogg", ".opus", ".wma", ".m4a",
        }:
            media_type = "AUDIO"
        elif ext in DOCUMENT_EXTENSIONS:
            media_type = "DOCUMENT"
        elif ext in ARCHIVE_EXTENSIONS:
            media_type = "ARCHIVE"
        elif ext in {
            ".mp4", ".m4v", ".webm", ".mkv", ".avi", ".mov", ".wmv", ".flv",
            ".3gp", ".ts", ".mts",
        }:
            media_type = "VIDEO"
        logger.info(f"download_now completed: {dl_id} -> {filepath} ({media_type})")
        return {
            "downloadId": dl_id,
            "status": "completed",
            "filepath": filepath,
            "filename": filename,
            "mediaType": media_type,
            "title": result.get("title"),
        }

    async def _do_download(
        self,
        dl_id: str,
        dl_dir: str,
        url: str,
        output_path: str,
        format_str: str,
        format_spec: str,
        cookie_file: Optional[str],
        download_subtitles: bool,
        ffmpeg_usable: bool,
        task_info: dict[str, Any],
        temp_cookie_file: Optional[str],
    ) -> dict[str, Any]:
        try:

            def _attempt_download(fmt: str, needs_merge: bool) -> Any:
                opts = self._base_opts(url, cookie_file)
                opts.update(
                    {
                        "outtmpl": {"default": output_path},
                        "progress_hooks": [lambda d: self._progress_hook(dl_id, d)],
                        "format": fmt,
                        "quiet": False,
                    }
                )
                if needs_merge and ffmpeg_usable:
                    opts["merge_output_format"] = "mp4"
                if cookie_file and os.path.exists(cookie_file):
                    opts["cookiefile"] = cookie_file
                if download_subtitles:
                    opts["writesubtitles"] = True
                    opts["writeautomaticsub"] = True
                    opts["subtitleslangs"] = ["en"]

                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=True)

            info = await asyncio.to_thread(
                _attempt_download, format_str, format_spec not in ("audio",)
            )

            downloaded_file = self._find_downloaded_file(dl_dir)

            # If merge failed (FFmpeg error) and we used a split format, try single-stream fallback
            if (
                not downloaded_file
                and format_spec in ("best", "merged")
                and ffmpeg_usable
            ):
                logger.warning(
                    f"Download with merge failed for {dl_id}, retrying with single-stream format"
                )
                task_info["status"] = "downloading"
                task_info["progress"] = 0
                info = await asyncio.to_thread(
                    _attempt_download, "best[ext=mp4]/best", False
                )
                downloaded_file = self._find_downloaded_file(dl_dir)

            # Final fallback: any best format without merge
            if not downloaded_file:
                logger.warning(
                    f"MP4 download failed for {dl_id}, retrying with any format"
                )
                task_info["status"] = "downloading"
                task_info["progress"] = 0
                info = await asyncio.to_thread(
                    _attempt_download, "best/bestvideo+bestaudio", False
                )
                downloaded_file = self._find_downloaded_file(dl_dir)

            if not downloaded_file:
                raise ValueError("Download completed but no file found")

            task_info["status"] = "completed"
            task_info["progress"] = 100
            task_info["filename"] = os.path.basename(downloaded_file)
            task_info["filepath"] = downloaded_file

            logger.info(f"Download completed: {dl_id} → {downloaded_file}")
            return {
                "id": dl_id,
                "status": "completed",
                "filename": task_info["filename"],
                "filepath": task_info["filepath"],
                "title": info.get("title") if info else None,
            }

        except Exception as e:
            error_msg = str(e)
            lowered = error_msg.lower()
            logger.error(f"Download failed: {dl_id} error={error_msg}")

            strategies = []
            if (
                "ffmpeg" in lowered
                or "postprocess" in lowered
                or "codec" in lowered
            ):
                strategies.append(("no-postprocess", False))
            if _is_youtube_url(url) and _is_bot_check(error_msg):
                strategies.append(("player-client-override", True))

            for name, use_client_override in strategies:
                try:
                    logger.warning(
                        f"{name} fallback for {dl_id}: retrying without merge"
                    )
                    task_info["status"] = "downloading"
                    task_info["progress"] = 0
                    fallback_opts = self._base_opts(url, cookie_file)
                    if use_client_override:
                        fallback_opts = _with_youtube_client_override(fallback_opts)
                    fallback_opts.update(
                        {
                            "outtmpl": {"default": output_path},
                            "format": "best[ext=mp4]/best",
                            "progress_hooks": [lambda d: self._progress_hook(dl_id, d)],
                        }
                    )
                    if cookie_file and os.path.exists(cookie_file):
                        fallback_opts["cookiefile"] = cookie_file

                    def _fallback_download():
                        with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                            return ydl.extract_info(url, download=True)

                    info = await asyncio.to_thread(_fallback_download)
                    downloaded_file = self._find_downloaded_file(dl_dir)

                    if downloaded_file:
                        task_info["status"] = "completed"
                        task_info["progress"] = 100
                        task_info["filename"] = os.path.basename(downloaded_file)
                        task_info["filepath"] = downloaded_file
                        logger.info(
                            f"Fallback ({name}) succeeded: {dl_id} → {downloaded_file}"
                        )
                        return {
                            "id": dl_id,
                            "status": "completed",
                            "filename": task_info["filename"],
                            "filepath": task_info["filepath"],
                            "title": info.get("title") if info else None,
                        }
                except Exception as fallback_error:
                    logger.error(f"Fallback ({name}) also failed: {fallback_error}")

            task_info["status"] = "failed"
            task_info["error"] = error_msg
            raise _clean_download_error(e, url)

    def _progress_hook(self, dl_id: str, d: dict[str, Any]):
        task = DOWNLOAD_TASKS.get(dl_id)
        if not task:
            return

        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            task["progress"] = round((downloaded / total) * 100, 1) if total > 0 else 0
            task["speed"] = d.get("speed") or 0
            task["eta"] = d.get("eta") or 0
            task["filename"] = d.get("filename")
            task["step"] = "downloading"

        elif d.get("status") == "finished":
            task["progress"] = 100
            task["status"] = "processing"
            task["step"] = "merging"
            task["filename"] = d.get("filename")

    def get_download_status(self, dl_id: str) -> Optional[dict[str, Any]]:
        task = DOWNLOAD_TASKS.get(dl_id)
        if not task:
            return None
        return {
            "id": task["id"],
            "status": task["status"],
            "progress": task["progress"],
            "speed": task["speed"],
            "eta": task["eta"],
            "filename": task["filename"],
            "filepath": task["filepath"],
            "error": task["error"],
            "step": task.get("step", "downloading"),
        }

    def cancel_download(self, dl_id: str) -> bool:
        task = DOWNLOAD_TASKS.get(dl_id)
        if not task:
            return False
        task["status"] = "cancelled"
        return True

    def delete_file(self, filepath: str) -> bool:
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                return True
        except OSError:
            pass
        return False


downloader_service = DownloaderService()
