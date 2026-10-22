"""
Google Drive download handler.

Supports:
- Public file downloads via direct download link
- Files requiring virus scan confirmation
- Folder listing (returns metadata for contents)
- Permission error detection
"""

import os
import re
import html
import logging
import asyncio
import shutil
import zipfile
import tempfile
from typing import Optional
from urllib.parse import urlparse, parse_qs

import httpx

logger = logging.getLogger(__name__)

GOOGLE_DRIVE_DOMAIN = "drive.google.com"
DOWNLOAD_CHUNK_SIZE = 8 * 1024 * 1024  # 8MB

MAX_FOLDER_FILES = 300  # Cap on listed/downloaded files per folder
FOLDER_PROBE_CONCURRENCY = 8
FOLDER_DOWNLOAD_CONCURRENCY = 4

# Maps Google Drive MIME types to our internal types
DRIVE_MIME_MAP = {
    # Documents
    "application/pdf": ("DOCUMENT", "pdf"),
    "application/msword": ("DOCUMENT", "doc"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        "DOCUMENT",
        "docx",
    ),
    "application/vnd.google-apps.document": ("DOCUMENT", "docx"),
    "text/plain": ("DOCUMENT", "txt"),
    "text/csv": ("DOCUMENT", "csv"),
    # Spreadsheets
    "application/vnd.ms-excel": ("DOCUMENT", "xls"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
        "DOCUMENT",
        "xlsx",
    ),
    "application/vnd.google-apps.spreadsheet": ("DOCUMENT", "xlsx"),
    # Presentations
    "application/vnd.ms-powerpoint": ("DOCUMENT", "ppt"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": (
        "DOCUMENT",
        "pptx",
    ),
    "application/vnd.google-apps.presentation": ("DOCUMENT", "pptx"),
    # Images
    "image/jpeg": ("IMAGE", "jpg"),
    "image/png": ("IMAGE", "png"),
    "image/gif": ("IMAGE", "gif"),
    "image/webp": ("IMAGE", "webp"),
    "image/svg+xml": ("IMAGE", "svg"),
    "image/bmp": ("IMAGE", "bmp"),
    # Video
    "video/mp4": ("VIDEO", "mp4"),
    "video/webm": ("VIDEO", "webm"),
    "video/x-matroska": ("VIDEO", "mkv"),
    "video/avi": ("VIDEO", "avi"),
    "video/quicktime": ("VIDEO", "mov"),
    # Audio
    "audio/mpeg": ("AUDIO", "mp3"),
    "audio/mp4": ("AUDIO", "m4a"),
    "audio/wav": ("AUDIO", "wav"),
    "audio/ogg": ("AUDIO", "ogg"),
    "audio/flac": ("AUDIO", "flac"),
    # Archives
    "application/zip": ("ARCHIVE", "zip"),
    "application/x-rar-compressed": ("ARCHIVE", "rar"),
    "application/x-7z-compressed": ("ARCHIVE", "7z"),
    "application/gzip": ("ARCHIVE", "gz"),
    "application/x-tar": ("ARCHIVE", "tar"),
    # Google Workspace native
    "application/vnd.google-apps.folder": ("FOLDER", ""),
    "application/vnd.google-apps.audio": ("AUDIO", "mp3"),
    "application/vnd.google-apps.video": ("VIDEO", "mp4"),
    "application/vnd.google-apps.photo": ("IMAGE", "jpg"),
}

# Extensions for direct download (no confirmation page)
DIRECT_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".mp3",
    ".m4a",
    ".wav",
    ".ogg",
    ".flac",
    ".mp4",
    ".webm",
    ".mkv",
    ".mov",
    ".pdf",
    ".zip",
    ".rar",
    ".7z",
    ".gz",
    ".tar",
    ".txt",
    ".csv",
}

FILE_EXTENSION_MAP = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/x-matroska": "mkv",
    "video/avi": "avi",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/x-m4a": "m4a",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-rar-compressed": "rar",
    "application/x-7z-compressed": "7z",
    "application/gzip": "gz",
    "application/x-tar": "tar",
    "text/plain": "txt",
    "text/csv": "csv",
}


def _media_type_from_ext(ext: str) -> str:
    """Infer a media type from a file extension (fallback when MIME is unknown)."""
    ext_lower = ext.lower()
    if ext_lower in {"mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "3gp", "m4v", "ts", "mts"}:
        return "VIDEO"
    if ext_lower in {"mp3", "m4a", "wav", "ogg", "flac", "aac", "wma", "opus"}:
        return "AUDIO"
    if ext_lower in {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"}:
        return "IMAGE"
    if ext_lower in {
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf", "odt", "ods", "odp",
    }:
        return "DOCUMENT"
    if ext_lower in {"zip", "rar", "7z", "gz", "tar", "bz2", "xz", "zst"}:
        return "ARCHIVE"
    return "OTHER"


def _parse_embedded_folderview(text: str) -> tuple[list[dict], list[dict], bool]:
    """Parse the public 'embeddedfolderview' HTML into file/folder entries.

    Returns (files, folders, truncated) where each entry has id + name.
    """
    files: list[dict] = []
    folders: list[dict] = []
    seen: set[str] = set()

    for href, label in re.findall(r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', text, re.S):
        label = re.sub(r"<[^>]+>", "", label).strip()
        if not label or not href:
            continue
        if "/file/d/" in href:
            match = re.search(r"/file/d/([\w-]+)", href)
            if match and match.group(1) not in seen:
                seen.add(match.group(1))
                files.append({"id": match.group(1), "name": label})
        elif "/open?id=" in href:
            match = re.search(r"/open\?id=([\w-]+)", href)
            if match and match.group(1) not in seen:
                seen.add(match.group(1))
                files.append({"id": match.group(1), "name": label})
        elif "/folders/" in href:
            match = re.search(r"/folders/([\w-]+)", href)
            if match and match.group(1) not in seen:
                seen.add(match.group(1))
                folders.append({"id": match.group(1), "name": label})

    truncated = "many items" in text.lower() or "show more" in text.lower()
    return files, folders, truncated


def _extract_folder_name(text: str) -> str:
    """Best-effort folder name from the embedded listing page."""
    match = re.search(
        r'<meta\s+property="og:title"\s+content="([^"]+)"', text, re.IGNORECASE
    )
    if match:
        return html.unescape(match.group(1)).strip() or "Google Drive Folder"
    match = re.search(r"<title>([^<]+)</title>", text, re.IGNORECASE)
    if match:
        title = html.unescape(match.group(1)).strip()
        title = title.replace("Google Drive Folder -", "").replace("- Google Drive", "").strip()
        if title and "sign in" not in title.lower():
            return title
    return "Google Drive Folder"


async def _probe_file_metadata(
    file_id: str, name: str, sem: asyncio.Semaphore
) -> dict:
    """Lightweight HEAD-based metadata for a listed Drive file."""
    async with sem:
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                head = await client.head(
                    f"https://drive.google.com/uc?export=download&id={file_id}"
                )
            content_type = head.headers.get("content-type", "")
            media_type, ext = DRIVE_MIME_MAP.get(content_type, ("OTHER", ""))
            if not ext:
                _, file_ext = os.path.splitext(name)
                ext = file_ext.lstrip(".") if file_ext else "bin"
            if media_type == "OTHER":
                media_type = _media_type_from_ext(ext)
            size = int(head.headers.get("content-length") or 0)
            return {
                "id": file_id,
                "name": name,
                "size": size,
                "mimeType": content_type,
                "mediaType": media_type,
                "extension": ext,
                "isFolder": False,
            }
        except Exception as e:
            logger.warning(f"Failed to probe Drive file {file_id}: {e}")
            _, file_ext = os.path.splitext(name)
            ext = file_ext.lstrip(".") if file_ext else "bin"
            return {
                "id": file_id,
                "name": name,
                "size": 0,
                "mimeType": "",
                "mediaType": _media_type_from_ext(ext),
                "extension": ext,
                "isFolder": False,
            }


async def list_folder_contents(folder_id: str) -> dict:
    """List the contents of a public Google Drive folder.

    Returns:
        dict with keys: folderName, files, folders, totalSize, truncated
    """
    list_url = f"https://drive.google.com/embeddedfolderview?id={folder_id}"
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            resp = await client.get(list_url)
    except httpx.RequestError as e:
        raise ValueError(f"Failed to connect to Google Drive: {str(e)}")

    if resp.status_code in (401, 403):
        raise ValueError(
            "This Google Drive folder is not public or requires signing in to view."
        )
    if resp.status_code == 404:
        raise ValueError(
            "Google Drive folder not found. The link may be invalid or the folder was removed."
        )
    if resp.status_code >= 400:
        raise ValueError(f"Google Drive folder error: {resp.status_code}")

    text = resp.text
    if (
        "sign in" in text.lower()
        and ("drive.google" in text.lower() or "google.com" in text.lower())
        and "embeddedfolderview" not in text
    ):
        raise ValueError(
            "This Google Drive folder is private or requires signing in to view."
        )

    folder_name = _extract_folder_name(text)
    files, folders, truncated = _parse_embedded_folderview(text)

    if not files and not folders:
        raise ValueError(
            "Could not list the contents of this Google Drive folder. It may be private, empty, or too large to preview."
        )

    sem = asyncio.Semaphore(FOLDER_PROBE_CONCURRENCY)
    enriched = await asyncio.gather(
        *(_probe_file_metadata(f["id"], f["name"], sem) for f in files[:MAX_FOLDER_FILES])
    )
    total_size = sum(f.get("size", 0) for f in enriched)
    truncated = truncated or len(files) > MAX_FOLDER_FILES

    return {
        "folderName": folder_name,
        "files": enriched,
        "folders": folders[:MAX_FOLDER_FILES],
        "totalSize": total_size,
        "truncated": truncated,
    }


def extract_file_id(url: str) -> Optional[str]:
    """Extract Google Drive file ID from various URL formats."""
    patterns = [
        r"/file/d/([\w-]+)",
        r"id=([\w-]+)",
        r"/folderview\?id=([\w-]+)",
        r"/folders/([\w-]+)",
        r"/open\?id=([\w-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def is_folder_url(url: str) -> bool:
    """Check if the URL points to a Google Drive folder."""
    return bool(re.search(r"/folders/|folderview\?id=", url, re.IGNORECASE))


def get_filename_from_disposition(content_disposition: str) -> str:
    """Extract filename from Content-Disposition header."""
    filename = "download"
    if not content_disposition:
        return filename
    # Try filename*=UTF-8''name (RFC 5987)
    match = re.search(r"filename\*=UTF-8''([^;]+)", content_disposition, re.IGNORECASE)
    if match:
        filename = match.group(1)
    else:
        # Try filename="name"
        match = re.search(r'filename="([^"]+)"', content_disposition, re.IGNORECASE)
        if match:
            filename = match.group(1)
        else:
            # Try filename=name
            match = re.search(r"filename=([^;]+)", content_disposition, re.IGNORECASE)
            if match:
                filename = match.group(1).strip()
    return filename


async def get_file_metadata(file_id: str) -> dict:
    """Get metadata for a Google Drive file using the public API endpoint.

    Returns:
        dict with keys: name, mimeType, size, mediaType, extension, isFolder
    """
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    params = {
        "fields": "name,mimeType,size,id",
        "key": None,
    }  # No API key needed for public files

    # Use the alternate metadata endpoint that works without API key
    metadata_url = f"https://drive.google.com/uc?id={file_id}&export=metadata"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # First try HEAD to get content info
            head_resp = await client.head(
                f"https://drive.google.com/uc?export=download&id={file_id}",
                follow_redirects=True,
            )

            content_type = head_resp.headers.get("content-type", "")
            content_disposition = head_resp.headers.get("content-disposition", "")

            # Upstream (drive.usercontent.google.com after the uc redirect) uses
            # real HTTP status codes for hard failures. 404 means the file does
            # not exist; 403 means access is denied.
            if head_resp.status_code == 404:
                raise ValueError(
                    "Google Drive file not found. The link may be invalid, expired, or the file was removed."
                )
            if head_resp.status_code == 403:
                raise ValueError(
                    "Access denied. You do not have permission to access this Google Drive file."
                )
            if head_resp.status_code >= 400:
                raise ValueError(
                    f"Google Drive could not serve this file (HTTP {head_resp.status_code}). The link may be invalid or the file was removed."
                )

            # HTML responses mean Google served an error/confirm page, not the
            # real file. Fetch the small HTML body to distinguish a not-found /
            # permission error from a virus-scan confirmation page.
            if "text/html" in content_type:
                page = await client.get(
                    f"https://drive.google.com/uc?export=download&id={file_id}",
                    follow_redirects=True,
                )
                page_text = page.text
                lowered = page_text.lower()
                if (
                    "does not exist" in lowered
                    or "file you have requested" in lowered
                    or "could not find" in lowered
                    or "link expired" in lowered
                    or "that's an error" in lowered
                    or "requested url was not found" in lowered
                    or "no longer available" in lowered
                ):
                    raise ValueError(
                        "Google Drive file not found. The link may be invalid, expired, or the file was removed."
                    )
                if (
                    "permission" in lowered
                    and "request access" in lowered
                    or "you need access" in lowered
                ):
                    raise ValueError(
                        "Access denied. You do not have permission to access this Google Drive file."
                    )

            media_type, ext = DRIVE_MIME_MAP.get(content_type, ("OTHER", ""))

            # Try to get filename from content-disposition
            filename = "download"
            if content_disposition:
                filename = get_filename_from_disposition(content_disposition)
            else:
                filename = f"drive-file-{file_id[:8]}"

            # Determine extension from filename or content-type
            if not ext:
                _, file_ext = os.path.splitext(filename)
                ext = file_ext.lstrip(".") if file_ext else "bin"

            # Detect media type from extension if content-type gave us OTHER
            if media_type == "OTHER":
                ext_lower = ext.lower()
                if ext_lower in {
                    "mp4",
                    "webm",
                    "mkv",
                    "avi",
                    "mov",
                    "wmv",
                    "flv",
                    "3gp",
                }:
                    media_type = "VIDEO"
                elif ext_lower in {
                    "mp3",
                    "m4a",
                    "wav",
                    "ogg",
                    "flac",
                    "aac",
                    "wma",
                    "opus",
                }:
                    media_type = "AUDIO"
                elif ext_lower in {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"}:
                    media_type = "IMAGE"
                elif ext_lower in {
                    "pdf",
                    "doc",
                    "docx",
                    "xls",
                    "xlsx",
                    "ppt",
                    "pptx",
                    "txt",
                    "csv",
                }:
                    media_type = "DOCUMENT"
                elif ext_lower in {"zip", "rar", "7z", "gz", "tar"}:
                    media_type = "ARCHIVE"

            content_length = head_resp.headers.get("content-length", "0")

            return {
                "id": file_id,
                "name": filename,
                "mimeType": content_type,
                "size": int(content_length) if content_length.isdigit() else 0,
                "mediaType": media_type,
                "extension": ext,
                "isFolder": False,
            }
    except httpx.TimeoutException:
        raise ValueError(
            "Google Drive request timed out. The file may be too large or the service is unavailable."
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise ValueError(
                "Google Drive file not found. The link may be invalid or the file was removed."
            )
        if e.response.status_code == 403:
            raise ValueError(
                "Access denied. You do not have permission to access this Google Drive file."
            )
        raise ValueError(f"Google Drive error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise ValueError(f"Failed to connect to Google Drive: {str(e)}")


async def download_public_file(
    file_id: str, dest_dir: Optional[str] = None
) -> tuple[str, str, str]:
    """Download a publicly accessible Google Drive file.

    Handles virus-scan confirmation pages, files too large for scanning, and
    native Google Docs export pages. Streams directly to disk so large files
    (multi-GB) are supported.

    Returns:
        Tuple of (filepath, filename, content_type)
    """
    if dest_dir is None:
        dest_dir = os.path.join(tempfile.gettempdir(), "google_drive_downloads")
    os.makedirs(dest_dir, exist_ok=True)

    direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"

    async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
        # First GET to check for virus scan warning
        resp = await client.get(direct_url)

        content_type = resp.headers.get("content-type", "application/octet-stream")
        content_disposition = resp.headers.get("content-disposition", "")

        filename = (
            get_filename_from_disposition(content_disposition)
            or f"drive-file-{file_id[:8]}"
        )

        # Native Google Docs / Sheets / Slides export page
        form_match = re.search(
            r'<form[^>]*id="downloadForm"[^>]*action="([^"]+)"', resp.text
        ) if "text/html" in content_type else None
        if form_match:
            export_url = html.unescape(form_match.group(1))
            resp = await client.get(export_url)
            content_type = resp.headers.get("content-type", content_type)
            content_disposition = resp.headers.get(
                "content-disposition", content_disposition
            )
            if content_disposition:
                filename = get_filename_from_disposition(content_disposition)

        # Check if we got a virus scan warning page
        if "text/html" in content_type and "Google Drive" in resp.text:
            # Look for the download confirmation form
            confirm_match = re.search(r'name="uuid"\s+value="([^"]+)"', resp.text)
            if confirm_match:
                uuid = confirm_match.group(1)
                download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t&uuid={uuid}"
                resp = await client.get(download_url)
                content_type = resp.headers.get("content-type", content_type)
                content_disposition = resp.headers.get(
                    "content-disposition", content_disposition
                )
                if content_disposition:
                    filename = get_filename_from_disposition(content_disposition)
            else:
                # Try alternative confirmation token
                confirm_match = re.search(r'confirm=([^&"\']+)', resp.text)
                if confirm_match:
                    confirm_token = confirm_match.group(1)
                    download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm={confirm_token}"
                    resp = await client.get(download_url)
                    content_type = resp.headers.get("content-type", content_type)
                    content_disposition = resp.headers.get(
                        "content-disposition", content_disposition
                    )
                    if content_disposition:
                        filename = get_filename_from_disposition(content_disposition)
                else:
                    # Check for error messages in the HTML
                    if (
                        "We're sorry" in resp.text
                        and "unable to scan this file for viruses" in resp.text
                    ):
                        # The file is too large for virus scan, but still downloadable
                        download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
                        resp = await client.get(download_url)
                        content_type = resp.headers.get("content-type", content_type)
                        content_disposition = resp.headers.get(
                            "content-disposition", content_disposition
                        )
                        if content_disposition:
                            filename = get_filename_from_disposition(
                                content_disposition
                            )

        # Sanitize filename
        safe_filename = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
        filepath = os.path.join(dest_dir, f"{file_id}_{safe_filename}")

        # Write file in chunks
        with open(filepath, "wb") as f:
            async for chunk in resp.aiter_bytes(chunk_size=DOWNLOAD_CHUNK_SIZE):
                f.write(chunk)

        return filepath, safe_filename, content_type


async def analyze_drive_url(url: str) -> dict:
    """Analyze a Google Drive URL and return metadata.

    Returns metadata in the same format as yt-dlp analyze_url.
    """
    file_id = extract_file_id(url)
    if not file_id:
        raise ValueError("Could not extract file ID from Google Drive URL.")

    is_folder = is_folder_url(url)

    if is_folder:
        listing = await list_folder_contents(file_id)
        drive_files = [
            {
                "id": f["id"],
                "name": f["name"],
                "size": f.get("size", 0),
                "mimeType": f.get("mimeType", ""),
                "mediaType": f.get("mediaType", "OTHER"),
                "extension": f.get("extension", "bin"),
                "isFolder": False,
            }
            for f in listing["files"]
        ]
        drive_files += [
            {
                "id": d["id"],
                "name": d["name"],
                "size": 0,
                "mimeType": "application/vnd.google-apps.folder",
                "mediaType": "FOLDER",
                "extension": "",
                "isFolder": True,
            }
            for d in listing["folders"]
        ]
        note = ""
        if listing.get("truncated"):
            note = f" (showing first {MAX_FOLDER_FILES} items)"
        return {
            "url": url,
            "title": listing["folderName"],
            "description": (
                f"{len(listing['files'])} files · {len(listing['folders'])} folders"
                f" · {format_size(listing['totalSize'])}{note}"
            ),
            "thumbnail": "",
            "duration": 0,
            "uploader": "Google Drive",
            "uploadDate": None,
            "viewCount": None,
            "likeCount": None,
            "mediaType": "FOLDER",
            "platform": "GoogleDrive",
            "platformUrl": url,
            "preview": None,
            "resolution": None,
            "fileSize": listing["totalSize"],
            "extension": None,
            "fps": None,
            "tags": [],
            "categories": [],
            "driveFileId": file_id,
            "driveIsFolder": True,
            "driveFiles": drive_files,
            "error": None,
        }

    try:
        metadata = await get_file_metadata(file_id)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to get Google Drive file info: {str(e)}")

    file_size = metadata.get("size", 0)
    media_type = metadata.get("mediaType", "OTHER")
    ext = metadata.get("extension", "bin")
    name = metadata.get("name", "download")

    preview = None
    if media_type in ("VIDEO", "IMAGE", "AUDIO"):
        preview = {
            "url": f"https://drive.google.com/uc?export=download&id={file_id}",
            "formatId": "drive_original",
            "ext": ext,
            "mediaType": media_type,
        }

    return {
        "url": url,
        "title": name,
        "description": f"Google Drive file ({ext.upper()}, {format_size(file_size)})",
        "thumbnail": "",
        "duration": 0,
        "uploader": "Google Drive",
        "uploadDate": None,
        "viewCount": None,
        "likeCount": None,
        "mediaType": media_type,
        "platform": "GoogleDrive",
        "platformUrl": url,
        "preview": preview,
        "resolution": "Original" if media_type in ("VIDEO", "IMAGE") else None,
        "fileSize": file_size,
        "extension": ext,
        "fps": None,
        "tags": [],
        "categories": [],
        "driveFileId": file_id,
        "driveIsFolder": False,
        "driveFiles": None,
        "error": None,
    }


async def start_drive_download(file_id: str, download_id: str) -> dict:
    """Start downloading a Google Drive file.

    Returns:
        dict with download task info
    """
    from app.services.downloader import DOWNLOAD_TASKS

    task_info = {
        "id": download_id,
        "url": f"https://drive.google.com/uc?export=download&id={file_id}",
        "status": "downloading",
        "progress": 0,
        "speed": 0,
        "eta": 0,
        "filename": None,
        "filepath": None,
        "error": None,
        "step": "preparing",
    }
    DOWNLOAD_TASKS[download_id] = task_info

    try:
        task_info["step"] = "downloading"
        filepath, filename, content_type = await download_public_file(file_id)

        task_info["status"] = "completed"
        task_info["progress"] = 100
        task_info["filename"] = filename
        task_info["filepath"] = filepath

        return {
            "id": download_id,
            "status": "completed",
            "filename": filename,
            "filepath": filepath,
            "title": filename,
        }
    except Exception as e:
        task_info["status"] = "failed"
        task_info["error"] = str(e)
        raise


async def download_folder_zip(folder_id: str) -> tuple[str, str, str]:
    """Download all files in a public folder and bundle them into a ZIP.

    Returns:
        Tuple of (zip_path, zip_filename, content_type)
    """
    listing = await list_folder_contents(folder_id)
    files = listing["files"]
    if not files:
        raise ValueError(
            "This Google Drive folder is empty or has no downloadable files."
        )

    tmp_root = os.path.join(tempfile.gettempdir(), "google_drive_downloads")
    os.makedirs(tmp_root, exist_ok=True)
    dl_dir = os.path.join(tmp_root, f"folder_{folder_id[:16]}")
    os.makedirs(dl_dir, exist_ok=True)

    sem = asyncio.Semaphore(FOLDER_DOWNLOAD_CONCURRENCY)

    async def _grab(entry: dict) -> Optional[tuple[str, str]]:
        async with sem:
            try:
                fp, fn, _ = await download_public_file(entry["id"], dest_dir=dl_dir)
                return fn, fp
            except Exception as e:
                logger.warning(
                    f"Failed to download '{entry.get('name', entry['id'])}' from folder: {e}"
                )
                return None

    results = await asyncio.gather(*(_grab(f) for f in files))
    pairs = [r for r in results if r]
    if not pairs:
        raise ValueError(
            "None of the files in this folder could be downloaded. They may be private or require sign-in."
        )

    safe_folder = re.sub(r"[^a-zA-Z0-9._-]", "_", listing["folderName"])
    zip_name = f"{safe_folder or 'folder'}.zip"
    zip_path = os.path.join(tmp_root, f"{folder_id[:16]}.zip")

    used: dict[str, int] = {}
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
        for fn, fp in pairs:
            base, ext = os.path.splitext(fn)
            n = used.get(base, 0)
            used[base] = n + 1
            arcname = fn if n == 0 else f"{base} ({n}){ext}"
            zf.write(fp, arcname)

    shutil.rmtree(dl_dir, ignore_errors=True)
    return zip_path, zip_name, "application/zip"


def format_size(size: int) -> str:
    """Format byte size to human readable."""
    s = float(size)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if s < 1024:
            return f"{s:.1f} {unit}"
        s /= 1024
    return f"{s:.1f} PB"


def _resolve_drive_filename(filename: str) -> str:
    return filename
