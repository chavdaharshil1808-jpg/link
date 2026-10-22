"""MediaAnalyzer — media type detection, format selection, MIME mapping.

Centralizes all logic that converts raw yt-dlp info into the *actual* media
answer (what kind of file it is, the best playable stream, the size, the MIME
type, a safe filename). This keeps the router layer free of extractor details
and ensures raw yt-dlp JSON never leaks to the client.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import re
import socket
import unicodedata
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

MEDIA_TYPE_PATTERNS = {
    "SHORT": re.compile(
        r"(youtube\.com/shorts/|tiktok\.com/|instagram\.com/reel/|facebook\.com/reel/|vm\.tiktok\.com/)",
        re.IGNORECASE,
    ),
    "PLAYLIST": re.compile(r"(list=|playlist\?|/playlist/)", re.IGNORECASE),
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".opus", ".m4a", ".wma", ".m4b"}
DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".rtf", ".odt", ".ods", ".odp", ".md",
}
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".zst", ".tgz"}
VIDEO_EXTENSIONS = {".mp4", ".m4v", ".webm", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".3gp", ".ts", ".mts", ".mpeg", ".mpg"}

MIME_TYPE_MAP = {
    # Video
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".3gp": "video/3gpp",
    ".ts": "video/mp2t",
    ".mts": "video/mp2t",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    # Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".wma": "audio/x-ms-wma",
    ".m4a": "audio/mp4",
    ".m4b": "audio/mp4",
    # Image
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    # Documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".rtf": "application/rtf",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    # Archives
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".tgz": "application/gzip",
    ".bz2": "application/x-bzip2",
    ".xz": "application/x-xz",
    ".zst": "application/zstd",
}

# Private / link-local / reserved networks we never proxy to (SSRF guard).
_PRIVATE_NETS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
]


class UrlSafetyError(ValueError):
    """Raised when a URL fails safety validation."""


class MediaAnalyzer:
    def detect_media_type(self, info: dict[str, Any], url: str) -> str:
        """Classify what the media actually is: VIDEO/AUDIO/IMAGE/DOCUMENT/..."""
        for media_type, pattern in MEDIA_TYPE_PATTERNS.items():
            if pattern.search(url):
                if media_type == "PLAYLIST":
                    return "PLAYLIST"
                return media_type

        if info.get("extractor_key") and info.get("entries"):
            return "PLAYLIST"

        if info.get("vcodec") == "none" and info.get("acodec") != "none":
            return "AUDIO"

        ext = (info.get("ext") or "").lower().lstrip(".")
        if ext in {"mp3", "wav", "flac", "aac", "ogg", "opus", "m4a", "wma", "m4b"}:
            return "AUDIO"
        if ext in {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"}:
            return "IMAGE"
        if ext in {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf", "odt", "ods", "odp"}:
            return "DOCUMENT"
        if ext in {"zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst"}:
            return "ARCHIVE"

        if info.get("url", "").lower().endswith(tuple(IMAGE_EXTENSIONS)):
            return "IMAGE"
        if info.get("url", "").lower().endswith(tuple(DOCUMENT_EXTENSIONS)):
            return "DOCUMENT"
        if info.get("url", "").lower().endswith(tuple(ARCHIVE_EXTENSIONS)):
            return "ARCHIVE"

        return "VIDEO"

    def media_type_from_extension(self, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext in VIDEO_EXTENSIONS:
            return "VIDEO"
        if ext in AUDIO_EXTENSIONS:
            return "AUDIO"
        if ext in IMAGE_EXTENSIONS:
            return "IMAGE"
        if ext in DOCUMENT_EXTENSIONS:
            return "DOCUMENT"
        if ext in ARCHIVE_EXTENSIONS:
            return "ARCHIVE"
        return "FILE"

    def mime_type(self, filename: str, fallback: str = "application/octet-stream") -> str:
        ext = os.path.splitext(filename)[1].lower()
        return MIME_TYPE_MAP.get(ext, fallback)

    def is_progressive(self, fmt: dict[str, Any]) -> bool:
        """True for directly-playable (non-HLS/non-DASH-segmented) URLs."""
        protocol = (fmt.get("protocol") or "").lower()
        if protocol in ("http", "https"):
            return True
        url = (fmt.get("url") or "").split("?")[0].lower()
        return url.endswith(
            (".mp4", ".webm", ".m4v", ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac")
        )

    def pick_preview_stream(
        self,
        info: dict[str, Any],
        media_type: str,
        formats: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        """Choose the best stream for inline playback, preferring progressive URLs."""
        if media_type in ("DOCUMENT", "ARCHIVE", "FOLDER"):
            return None

        candidates: list[dict[str, Any]] = []
        if media_type == "AUDIO":
            candidates = [f for f in formats if f.get("hasAudio") and f.get("url")]
            key = lambda x: x.get("abr") or 0  # noqa: E731
        elif media_type == "IMAGE":
            candidates = [f for f in formats if f.get("url")]
            key = lambda x: x.get("width") or x.get("height") or 0  # noqa: E731
        else:
            candidates = [
                f for f in formats if f.get("hasVideo") and f.get("url")
            ]
            key = lambda x: x.get("height") or 0  # noqa: E731

        progressive = [f for f in candidates if self.is_progressive(f)]
        best = max((progressive or candidates), key=key, default=None)
        if not best and info.get("url"):
            return {"url": info["url"], "formatId": None, "ext": info.get("ext"), "mediaType": media_type}
        if not best:
            return None
        return {
            "url": best.get("url"),
            "formatId": best.get("formatId"),
            "ext": best.get("ext"),
            "mediaType": media_type,
        }

    def estimate_file_size(
        self,
        formats: list[dict[str, Any]],
        best_video: Optional[dict[str, Any]],
        best_audio: Optional[dict[str, Any]],
        duration: float,
    ) -> Optional[int]:
        """Best-effort size estimate for the auto-selected best media."""
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
                return int(((best_video.get("tbr") or best_video.get("abr") or 5000) * duration) / 8)
            if best_audio:
                return int(((best_audio.get("abr") or 192) * duration) / 8)
        return None

    def safe_filename(self, title: str, ext: str, fallback: str = "download") -> str:
        """Build a filesystem + header safe filename from a media title."""
        cleaned = unicodedata.normalize("NFKC", title or "")
        cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", cleaned).strip(" .")
        cleaned = re.sub(r"\s+", " ", cleaned)
        if not cleaned:
            cleaned = fallback
        cleaned = cleaned[:120].rstrip(".")
        if ext:
            ext = ext.lstrip(".").lower()
            if not re.match(r"^[a-z0-9]+$", ext):
                ext = "bin"
            return f"{cleaned}.{ext}"
        return cleaned

    def validate_url(self, url: str, allow_private: bool = False) -> str:
        """Validate scheme + host and block SSRF into private networks.

        Returns the normalized URL. Raises UrlSafetyError on unsafe input.
        """
        if not url or len(url) > 2048:
            raise UrlSafetyError("URL is missing or too long.")
        try:
            parsed = urlparse(url)
        except Exception as exc:
            raise UrlSafetyError("The URL is invalid.") from exc
        if parsed.scheme not in ("http", "https"):
            raise UrlSafetyError("Only http:// and https:// URLs are supported.")
        host = parsed.hostname or ""
        if not host:
            raise UrlSafetyError("The URL has no host.")

        if not allow_private:
            # Fast, obvious local/private host names.
            lowered = host.lower().rstrip(".")
            if lowered in {"localhost", "localtest.me"} or lowered.endswith(".localhost"):
                raise UrlSafetyError("Local addresses are not allowed.")
            try:
                ips = socket.getaddrinfo(lowered, None)
                for addr in ips:
                    ip = ipaddress.ip_address(addr[4][0])
                    if any(ip in net for net in _PRIVATE_NETS):
                        raise UrlSafetyError("Private network addresses are not allowed.")
            except UrlSafetyError:
                raise
            except Exception:
                # DNS failure — let the extractor produce the real error.
                logger.debug(f"validate_url: DNS lookup failed for {lowered}")

        return url


media_analyzer = MediaAnalyzer()
