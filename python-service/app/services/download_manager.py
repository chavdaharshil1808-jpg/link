"""DownloadManager — orchestrates the "prepare" flow.

User URL
  → validate (SSRF guard)
  → analyze internally
  → choose best format automatically
  → download to a temp file
  → register with FileStorage
  → return real media URLs (downloadUrl / streamUrl) + display metadata

This is the module that guarantees the frontend receives *actual downloadable
media* — never a raw yt-dlp metadata dump.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Optional

from app.config import settings
from app.services.downloader import downloader_service
from app.services.file_storage import file_storage
from app.services.media_analyzer import media_analyzer
from app.services.retry_manager import retry_manager
from app.services.spotify import is_spotify_url, prepare_spotify_url
from app.services.terabox import terabox_service

logger = logging.getLogger(__name__)

# Cap how many items of a playlist/multi-item post we enumerate.
MAX_PLAYLIST_ITEMS = 50


class DownloadManager:
    def __init__(self, base_download_dir: Optional[str] = None):
        self.prepare_dir = os.path.join(base_download_dir or settings.DOWNLOAD_DIR, "prepared")

    async def prepare(
        self,
        url: str,
        format_spec: str = "best",
        cookie_content: Optional[str] = None,
        download_subtitles: bool = False,
    ) -> dict[str, Any]:
        """Prepare a URL into a downloadable media answer.

        Returns a media-oriented dict (mediaType, downloadUrl, streamUrl,
        filename, filesize, mimeType, thumbnail, preview + display fields).
        """
        media_analyzer.validate_url(url)

        if is_spotify_url(url):
            return await prepare_spotify_url(url)

        if terabox_service.is_terabox_url(url):
            return await terabox_service.prepare(url, cookie_content)

        # 1) Analyze internally (raw info stays server-side).
        info = await retry_manager.run(
            downloader_service.extract_raw, url, cookie_content
        )

        media_type = media_analyzer.detect_media_type(info, url)

        # 2) Multi-item media: playlist / gallery. Enumerate items so the
        #    frontend can render a list/gallery and download each one.
        entries = info.get("entries") or []
        if entries:
            return self._build_multi(info, url, entries, media_type)

        # 3) Single media: download the best format and store it.
        return await self._prepare_single(
            url, format_spec, cookie_content, download_subtitles
        )

    async def _prepare_single(
        self,
        url: str,
        format_spec: str,
        cookie_content: Optional[str],
        download_subtitles: bool,
    ) -> dict[str, Any]:
        result = await downloader_service.download_now(
            url=url,
            format_spec=format_spec,
            cookie_content=cookie_content,
            download_subtitles=download_subtitles,
        )
        filepath = result["filepath"]
        if not os.path.exists(filepath):
            raise ValueError("The media was prepared but the file is missing.")

        filename = result["filename"] or os.path.basename(filepath)
        mime = media_analyzer.mime_type(filename)
        media_type = result.get("mediaType") or media_analyzer.media_type_from_extension(filename)

        stored_id = file_storage.register(
            filepath, filename=filename, mime_type=mime
        )
        size = os.path.getsize(filepath)
        extension = filename.rsplit(".", 1)[-1] if "." in filename else None

        return {
            "url": url,
            "title": result.get("title") or filename,
            "thumbnail": "",
            "duration": 0,
            "uploader": "Unknown",
            "platform": "",
            "mediaType": media_type,
            "mimeType": mime,
            "filename": filename,
            "filesize": size,
            "downloadId": stored_id,
            "extension": extension,
            "preview": None,
            "items": None,
        }

    def _build_multi(
        self,
        info: dict[str, Any],
        url: str,
        entries: list[dict[str, Any]],
        media_type: str,
    ) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        entry_types = set()

        for entry in entries[:MAX_PLAYLIST_ITEMS]:
            if not isinstance(entry, dict) or not entry:
                continue
            item_url = entry.get("webpage_url") or entry.get("url") or entry.get("original_url") or url
            entry_type = media_analyzer.detect_media_type(entry, item_url)
            entry_types.add(entry_type)
            ext = entry.get("ext")
            title = entry.get("title") or f"Item {len(items) + 1}"
            items.append(
                {
                    "title": title,
                    "url": item_url,
                    "thumbnail": entry.get("thumbnail") or "",
                    "duration": entry.get("duration") or 0,
                    "mediaType": entry_type,
                    "extension": ext,
                }
            )

        if not items:
            raise ValueError("This media contains no downloadable items.")

        # All items are images → render as a gallery.
        display_type = media_type
        if entry_types and entry_types.issubset({"IMAGE"}) and len(items) > 1:
            display_type = "IMAGE"

        return {
            "url": url,
            "title": info.get("title") or "Playlist",
            "thumbnail": info.get("thumbnail") or (items[0]["thumbnail"] if items else ""),
            "duration": info.get("duration") or 0,
            "uploader": info.get("uploader") or info.get("channel") or "Unknown",
            "platform": info.get("extractor_key") or "",
            "mediaType": display_type,
            "mimeType": "",
            "filename": "",
            "filesize": None,
            "downloadId": None,
            "extension": None,
            "preview": None,
            "items": items,
        }


download_manager = DownloadManager()
