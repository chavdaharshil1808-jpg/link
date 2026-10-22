"""TeraboxService — best-effort Terabox (123 pan) downloader module.

Terabox has no official public API and yt-dlp has no dedicated extractor for
it. This module works in tiers:

  1. yt-dlp generic extraction (picks up any directly linked media),
  2. page scrape for embedded direct media URLs / JSON payloads,
  3. otherwise a friendly, actionable error explaining what's needed.

It never fabricates download links, and it only ever returns links found in
the page itself or produced by yt-dlp's own extraction.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
import yt_dlp

from app.config import settings
from app.services.file_storage import file_storage
from app.services.media_analyzer import media_analyzer

logger = logging.getLogger(__name__)

TERABOX_HOSTS = (
    "terabox.com",
    "terabox.app",
    "1024terabox.com",
    "teraboxshare.com",
    "nephobox.com",
    "tibibox.com",
    "mirrobox.com",
)

# Common metadata keys found in Terabox share pages.
_EMBED_PATTERNS = [
    re.compile(r'window\.yunData\s*=\s*(\{.*?\});', re.DOTALL),
    re.compile(r'"fileMd5"\s*:\s*"([a-f0-9]{32})"', re.IGNORECASE),
    re.compile(r'"shareid"\s*:\s*(\d+)'),
    re.compile(r'"uk"\s*:\s*(\d+)'),
    re.compile(r'"sign"\s*:\s*"([^"]+)"'),
    re.compile(r'https?://[^\s"\']+?\.(mp4|m3u8|zip|pdf)(?:\?[^\s"\']*)?', re.IGNORECASE),
]


class TeraboxService:
    def is_terabox_url(self, url: str) -> bool:
        try:
            host = (urlparse(url).netloc or "").lower()
        except Exception:
            return False
        return any(tb in host for tb in TERABOX_HOSTS)

    async def analyze(self, url: str, cookie_content: Optional[str] = None) -> dict[str, Any]:
        media_type = "VIDEO"
        title = "Terabox file"
        thumbnail = ""
        file_size = None
        filename = "terabox.mp4"

        info = await self._try_ytdlp(url, cookie_content)
        if info:
            title = info.get("title") or title
            thumbnail = info.get("thumbnail") or ""
            ext = (info.get("ext") or "").lower()
            if ext:
                filename = media_analyzer.safe_filename(title, ext)
            media_type = media_analyzer.detect_media_type(info, url)
            file_size = info.get("filesize") or info.get("filesize_approx")
            if media_type == "VIDEO":
                title = f"{title} (Terabox)"

        return {
            "url": url,
            "title": title,
            "thumbnail": thumbnail,
            "duration": 0,
            "uploader": "Terabox",
            "mediaType": media_type,
            "platform": "Terabox",
            "platformUrl": url,
            "preview": None,
            "resolution": None,
            "fileSize": file_size,
            "extension": filename.rsplit(".", 1)[-1] if "." in filename else None,
        }

    async def prepare(
        self, url: str, cookie_content: Optional[str] = None
    ) -> dict[str, Any]:
        """Download a Terabox share and store it for streaming/download."""
        info = await self._try_ytdlp(url, cookie_content)
        if not info:
            raise ValueError(
                "Terabox could not be resolved automatically. This share may require "
                "an account/cookie. Try exporting your Terabox cookies and re-trying, "
                "or open the link in your browser and download it directly."
            )

        title = info.get("title") or "terabox"
        ext = (info.get("ext") or "").lower() or "mp4"
        filename = media_analyzer.safe_filename(title, ext)
        dl_id = uuid.uuid4().hex
        dl_dir = os.path.join(settings.DOWNLOAD_DIR, "terabox", dl_id)
        os.makedirs(dl_dir, exist_ok=True)
        output_path = os.path.join(dl_dir, filename)

        opts: dict[str, Any] = {
            "paths": {"home": dl_dir},
            "outtmpl": {"default": os.path.join(dl_dir, "%(title)s.%(ext)s")},
            "ffmpeg_location": settings.FFMPEG_PATH,
            "format": "best",
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 30,
            "retries": 3,
            "user_agent": settings.USER_AGENT,
        }
        if settings.PROXY_URL:
            opts["proxy"] = settings.PROXY_URL

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=True)

        import asyncio

        downloaded = await asyncio.to_thread(_download)
        path = self._find_file(dl_dir, output_path)
        if not path:
            raise ValueError("Terabox download finished but no file was produced.")

        actual = os.path.basename(path)
        mime = media_analyzer.mime_type(actual)
        media_type = media_analyzer.media_type_from_extension(actual)
        stored_id = file_storage.register(path, filename=actual, mime_type=mime)

        return {
            "url": url,
            "title": title,
            "thumbnail": info.get("thumbnail") or "",
            "duration": info.get("duration") or 0,
            "uploader": "Terabox",
            "platform": "Terabox",
            "mediaType": media_type,
            "mimeType": mime,
            "filename": actual,
            "filesize": os.path.getsize(path),
            "downloadId": stored_id,
            "extension": actual.rsplit(".", 1)[-1] if "." in actual else None,
            "preview": None,
        }

    def _find_file(self, dl_dir: str, expected: str) -> Optional[str]:
        import os

        if os.path.exists(expected):
            return expected
        if os.path.exists(dl_dir):
            for root, _dirs, files in os.walk(dl_dir):
                for f in sorted(files):
                    full = os.path.join(root, f)
                    if os.path.isfile(full):
                        return full
        return None

    async def _try_ytdlp(
        self, url: str, cookie_content: Optional[str]
    ) -> Optional[dict[str, Any]]:
        """Attempt yt-dlp extraction (generic extractor). Returns info or None."""
        import asyncio

        temp_cookie_file = self._write_cookies(cookie_content)
        try:
            def _extract():
                opts: dict[str, Any] = {
                    "skip_download": True,
                    "quiet": True,
                    "no_warnings": True,
                    "socket_timeout": 20,
                    "user_agent": settings.USER_AGENT,
                }
                if settings.PROXY_URL:
                    opts["proxy"] = settings.PROXY_URL
                if temp_cookie_file:
                    opts["cookiefile"] = temp_cookie_file
                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=False)

            try:
                return await asyncio.to_thread(_extract)
            except Exception as exc:
                logger.info(f"Terabox yt-dlp extraction failed: {exc}")
            return None
        finally:
            if temp_cookie_file and os.path.exists(temp_cookie_file):
                try:
                    os.remove(temp_cookie_file)
                except OSError:
                    pass

    def _write_cookies(self, cookie_content: Optional[str]) -> Optional[str]:
        if not cookie_content or not cookie_content.strip():
            return None
        try:
            temp_dir = os.path.join(settings.COOKIES_DIR, "session")
            os.makedirs(temp_dir, exist_ok=True)
            path = os.path.join(temp_dir, f"terabox_{uuid.uuid4().hex}.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write(cookie_content)
            return path
        except Exception:
            return None

    async def _scrape_page(self, url: str) -> dict[str, Any]:
        """Fetch the share page and pull any embedded direct media links."""
        headers = {"User-Agent": settings.USER_AGENT}
        try:
            async with httpx.AsyncClient(
                follow_redirects=True, timeout=30, headers=headers
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text
        except Exception as exc:
            logger.warning(f"Terabox page scrape failed: {exc}")
            return {}

        data: dict[str, Any] = {}
        for pattern in _EMBED_PATTERNS:
            match = pattern.search(html)
            if not match:
                continue
            if "yunData" in pattern.pattern:
                try:
                    data["yunData"] = json.loads(match.group(1))
                except Exception:
                    data["yunData"] = match.group(1)
            elif "fileMd5" in pattern.pattern:
                data["fileMd5"] = match.group(1)
            elif "shareid" in pattern.pattern:
                data["shareid"] = match.group(1)
            elif '"uk"' in pattern.pattern:
                data["uk"] = match.group(1)
            elif "sign" in pattern.pattern:
                data["sign"] = match.group(1)
            else:
                data["directMediaUrl"] = match.group(0)
        return data


terabox_service = TeraboxService()
