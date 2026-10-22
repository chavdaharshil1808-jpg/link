"""
Spotify handler.

Spotify's own streams are DRM-encrypted and are never touched. For downloads
we use `spotdl` (isolated in its own venv) which:
  1. resolves track/album/playlist metadata from Spotify,
  2. finds a matching audio copy on YouTube (Music),
  3. downloads it and tags it (title/artist/album/cover) as .mp3.

Spotify links are therefore downloadable without any DRM bypass.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import uuid
import zipfile
from typing import Optional
from urllib.parse import urlparse, urlencode

import httpx

from app.config import settings
from app.services.file_storage import file_storage

logger = logging.getLogger(__name__)

SPOTIFY_HOSTS = (
    "open.spotify.com",
    "play.spotify.com",
    "spotify.link",
    "link.spotify.com",
)

# Entity types the public embed endpoint supports, keyed to their URL segment.
EMBED_TYPES = ("track", "album", "playlist", "artist", "show", "episode")

# Entity types we can actually download via spotdl.
DOWNLOADABLE_TYPES = ("track", "album", "playlist")

_AUDIO_EXTS = (".mp3", ".m4a", ".opus", ".flac", ".ogg", ".wav")


def is_spotify_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(h in host for h in SPOTIFY_HOSTS)


def _spotdl_python() -> str:
    path = getattr(settings, "SPOTDL_PYTHON", "") or ""
    if not path or not os.path.exists(path):
        raise ValueError(
            "Spotify downloads are not configured. "
            "Set SPOTDL_PYTHON to the python.exe of the spotdl venv."
        )
    return path


def _entity_type(canonical: str) -> Optional[str]:
    """Return the Spotify entity type from a canonical URL path."""
    try:
        path = urlparse(canonical).path.strip("/")
        parts = [p for p in path.split("/") if p]
        if parts and parts[0] in EMBED_TYPES:
            return parts[0]
    except Exception:
        pass
    return None


async def _resolve_spotify_url(url: str) -> str:
    """Resolve Spotify short links (spotify.link) to the canonical URL."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(url)
    return str(resp.url)


def _embed_url_for(canonical: str) -> Optional[str]:
    """Build the public embed URL for a canonical Spotify link, if supported."""
    try:
        parsed = urlparse(canonical)
        path = parsed.path.strip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) >= 2 and parts[0] in EMBED_TYPES:
            return f"https://open.spotify.com/embed/{parts[0]}/{parts[1]}"
    except Exception:
        pass
    return None


def _extract_embed_metadata(page_text: str) -> Optional[dict]:
    """Parse the entity JSON block embedded in a Spotify embed page.

    Returns {"title", "artist", "duration"} or None. Duration is in seconds.
    """
    idx = -1
    for entity_type in EMBED_TYPES:
        idx = page_text.find(f'"type":"{entity_type}"')
        if idx != -1:
            break
    if idx == -1:
        return None

    start = page_text.rfind("{", 0, idx)
    if start == -1:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(page_text, start)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None

    title = data.get("name") or data.get("title") or ""
    artist = ""
    artists = data.get("artists") or []
    if isinstance(artists, list) and artists and isinstance(artists[0], dict):
        artist = artists[0].get("name") or ""
    if not artist:
        owner = data.get("owner") or data.get("creator") or {}
        if isinstance(owner, dict):
            artist = owner.get("name") or ""
    if not artist:
        subtitle = data.get("subtitle") or ""
        artist = subtitle if isinstance(subtitle, str) else ""

    duration_ms = data.get("duration") or 0
    if isinstance(duration_ms, (int, float)) and duration_ms > 0:
        duration_ms = duration_ms / 1000

    return {
        "title": str(title).strip(),
        "artist": str(artist).strip(),
        "duration": int(duration_ms),
    }


async def _spotify_metadata(url: str) -> dict:
    """Fetch display metadata (title/artist/duration/cover) for a link."""
    try:
        canonical = await _resolve_spotify_url(url)
    except httpx.RequestError as e:
        raise ValueError(f"Failed to reach Spotify: {str(e)}")

    try:
        parsed = urlparse(canonical)
        if parsed.netloc.lower() not in SPOTIFY_HOSTS or not parsed.path.strip("/"):
            raise ValueError("This does not appear to be a valid Spotify link.")
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Invalid Spotify link: {str(e)}")

    oembed_url = "https://open.spotify.com/oembed?" + urlencode({"url": canonical})
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            oembed_resp = await client.get(oembed_url)
            embed_page_text = ""
            embed_url = _embed_url_for(canonical)
            if embed_url:
                try:
                    embed_resp = await client.get(embed_url)
                    if embed_resp.status_code == 200:
                        embed_page_text = embed_resp.text
                except httpx.RequestError:
                    logger.warning("Spotify embed fetch failed; using oEmbed only")
    except httpx.RequestError as e:
        raise ValueError(f"Failed to fetch Spotify metadata: {str(e)}")

    if oembed_resp.status_code == 404:
        raise ValueError(
            "This Spotify link could not be found. The track, album, or playlist may have been removed."
        )
    if oembed_resp.status_code >= 400:
        raise ValueError(
            f"Spotify could not be reached for this link (HTTP {oembed_resp.status_code})."
        )

    try:
        oembed = oembed_resp.json()
    except ValueError as e:
        raise ValueError(f"Spotify returned an unexpected response: {str(e)}")

    embed_meta = _extract_embed_metadata(embed_page_text) if embed_page_text else None
    title = (
        embed_meta["title"]
        if embed_meta and embed_meta["title"]
        else oembed.get("title") or "Spotify media"
    )
    artist = embed_meta["artist"] if embed_meta else ""
    if not artist:
        artist = "Spotify"

    return {
        "url": url,
        "canonical": canonical,
        "entity": _entity_type(canonical),
        "title": title,
        "artist": artist,
        "duration": embed_meta["duration"] if embed_meta else 0,
        "thumbnail": oembed.get("thumbnail_url") or "",
    }


async def analyze_spotify_url(url: str) -> dict:
    """Resolve Spotify metadata for a link.

    Returns an AnalyzeResponse-compatible DTO. Downloads are offered through
    the /prepare flow (spotdl resolves metadata and downloads a matching
    YouTube Music copy, tagged as .mp3).
    """
    meta = await _spotify_metadata(url)
    return {
        "url": url,
        "title": meta["title"],
        "thumbnail": meta["thumbnail"],
        "duration": meta["duration"],
        "uploader": meta["artist"],
        "mediaType": "AUDIO",
        "platform": "Spotify",
        "platformUrl": meta["canonical"],
        "preview": None,
        "resolution": None,
        "fileSize": None,
        "extension": "mp3",
        "driveFileId": None,
        "driveIsFolder": False,
        "driveFiles": None,
        "error": None,
    }


async def _run_spotdl(canonical: str, output_dir: str, timeout: int = 1200) -> list[str]:
    """Download a Spotify entity into output_dir via the spotdl venv.

    Returns the absolute paths of the produced audio files.
    """
    exe = _spotdl_python()
    template = (output_dir + "/{artists} - {title}.{output-ext}").replace("\\", "/")
    args = [
        exe,
        "-m",
        "spotdl",
        "download",
        canonical,
        "--format",
        "mp3",
        "--threads",
        "2",
        "--output",
        template,
        "--print-errors",
    ]
    env = os.environ.copy()
    if settings.SPOTIFY_CLIENT_ID:
        env["SPOTIFY_CLIENT_ID"] = settings.SPOTIFY_CLIENT_ID
    if settings.SPOTIFY_CLIENT_SECRET:
        env["SPOTIFY_CLIENT_SECRET"] = settings.SPOTIFY_CLIENT_SECRET

    def _run() -> subprocess.CompletedProcess:
        return subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    try:
        proc = await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired:
        raise ValueError("Spotify download timed out. Try a shorter playlist or a single track.")

    out_text = (proc.stdout or b"").decode("utf-8", "replace")
    err_text = (proc.stderr or b"").decode("utf-8", "replace")

    if proc.returncode != 0:
        logger.error(
            f"spotdl failed for {canonical}\nSTDOUT: {out_text[-1500:]}\nSTDERR: {err_text[-1500:]}"
        )
        msg = err_text.strip().splitlines()[-1] if err_text.strip() else "spotdl download failed"
        raise ValueError(f"Spotify download failed: {msg}")

    files = sorted(
        os.path.join(output_dir, f)
        for f in os.listdir(output_dir)
        if f.lower().endswith(_AUDIO_EXTS)
    )
    if not files:
        logger.error(f"spotdl produced no audio for {canonical}\n{out_text[-1500:]}\n{err_text[-1500:]}")
        raise ValueError(
            "No audio could be matched for this track. The song may be missing from YouTube Music."
        )
    return files


def _safe_name(name: str, fallback: str) -> str:
    cleaned = "".join(c for c in (name or "") if c not in '\\/:*?"<>|\r\n\t').strip(" .")
    return (cleaned[:120] or fallback).rstrip(".")


async def prepare_spotify_url(url: str) -> dict:
    """Download a Spotify track/album/playlist via spotdl and register the files.

    Single track → one .mp3. Album/playlist → a .zip of every matched track.
    Returns a PrepareResponse-compatible dict with downloadId set.
    """
    meta = await _spotify_metadata(url)
    entity = meta["entity"]
    if entity not in DOWNLOADABLE_TYPES:
        raise ValueError(
            f"Only Spotify tracks, albums, and playlists can be downloaded (got {entity or 'an unknown type'})."
        )

    out_dir = os.path.join(
        settings.DOWNLOAD_DIR, "prepared", f"spotify-{uuid.uuid4().hex}"
    )
    os.makedirs(out_dir, exist_ok=True)

    try:
        files = await _run_spotdl(meta["canonical"], out_dir)
    except Exception:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise

    if len(files) == 1:
        filepath = files[0]
        filename = os.path.basename(filepath)
        stored_id = file_storage.register(
            filepath, filename=filename, mime_type="audio/mpeg"
        )
        size = os.path.getsize(filepath)
        return {
            "url": url,
            "title": meta["title"],
            "thumbnail": meta["thumbnail"],
            "duration": meta["duration"],
            "uploader": meta["artist"],
            "platform": "Spotify",
            "mediaType": "AUDIO",
            "mimeType": "audio/mpeg",
            "filename": filename,
            "filesize": size,
            "downloadId": stored_id,
            "extension": "mp3",
            "preview": None,
            "items": None,
        }

    # Collection (album/playlist): bundle every matched track into one zip.
    zip_name = _safe_name(meta["title"], "Spotify collection") + ".zip"
    zip_path = os.path.join(out_dir, zip_name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, os.path.basename(f))
    stored_id = file_storage.register(
        zip_path, filename=zip_name, mime_type="application/zip"
    )
    # The raw tracks are only bundled into the zip; drop them so the prepared
    # dir holds just the zip (removed by FileStorage's TTL janitor when done).
    for f in files:
        try:
            os.remove(f)
        except OSError:
            pass
    return {
        "url": url,
        "title": meta["title"],
        "thumbnail": meta["thumbnail"],
        "duration": meta["duration"],
        "uploader": meta["artist"],
        "platform": "Spotify",
        "mediaType": "ARCHIVE",
        "mimeType": "application/zip",
        "filename": zip_name,
        "filesize": os.path.getsize(zip_path),
        "downloadId": stored_id,
        "extension": "zip",
        "preview": None,
        "items": None,
    }
