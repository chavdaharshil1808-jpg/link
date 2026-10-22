import uuid
import os
import json
import re
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Query
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
import httpx
from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    PrepareRequest,
    PrepareResponse,
    DownloadRequest,
    DownloadResponse,
    DownloadStatusResponse,
    CancelRequest,
    DeleteFileRequest,
    FetchRequest,
)
from app.services.downloader import (
    downloader_service,
    DOWNLOAD_TASKS,
    _find_cookie_file,
    _check_cookie_file_has_sessionid,
)
from app.services.download_manager import download_manager
from app.services.file_storage import file_storage
from app.services.media_analyzer import media_analyzer
from app.services.google_drive import (
    analyze_drive_url as google_drive_analyze,
    start_drive_download as google_drive_download,
    download_folder_zip as google_drive_folder_zip,
    extract_file_id,
    is_folder_url,
)
from app.services.spotify import analyze_spotify_url, is_spotify_url
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/download", tags=["download"])

# Known Google Drive URL host patterns
GOOGLE_DRIVE_HOSTS = {"drive.google.com", "docs.google.com"}


def _is_google_drive_url(url: str) -> bool:
    try:
        from urllib.parse import urlparse

        host = urlparse(url).netloc.lower()
        return any(d in host for d in GOOGLE_DRIVE_HOSTS)
    except Exception:
        return False


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_url(req: AnalyzeRequest):
    logger.info(f"Analyze request: url={req.url[:100]} cookies={'yes' if req.cookieContent else 'no'}")
    try:
        # Spotify links: metadata card; real audio download happens via
        # /prepare (spotdl resolves metadata + downloads from YouTube Music).
        if is_spotify_url(req.url):
            result = await analyze_spotify_url(req.url)
            logger.info(
                f"Spotify analyze success: title={result.get('title', '')[:80]}"
            )
            return AnalyzeResponse(**result)

        # Route Google Drive URLs to the Drive handler
        if _is_google_drive_url(req.url):
            result = await google_drive_analyze(req.url)
            logger.info(
                f"Google Drive analyze success: title={result.get('title', '')[:80]}"
            )
            return AnalyzeResponse(**result)

        result = await downloader_service.analyze_url(req.url, cookie_content=req.cookieContent)
        logger.info(f"Analyze success: title={result.get('title', '')[:80]}")
        return AnalyzeResponse(**result)
    except ValueError as e:
        logger.warning(f"Analyze failed (expected): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Analyze failed (unexpected): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/prepare", response_model=PrepareResponse)
async def prepare_url(req: PrepareRequest):
    """Prepare a URL into actual downloadable media.

    Internally: validate → analyze → pick best format → download → store a
    temp file → return real media URLs. The client gets downloadable media,
    never a raw yt-dlp metadata dump.
    """
    logger.info(
        f"Prepare request: url={req.url[:100]} format={req.format_spec} cookies={'yes' if req.cookieContent else 'no'}"
    )
    try:
        result = await download_manager.prepare(
            url=req.url,
            format_spec=req.format_spec,
            cookie_content=req.cookieContent,
            download_subtitles=req.downloadSubtitles,
        )
        file_id = result.get("downloadId")
        if file_id:
            result["downloadUrl"] = f"/api/download/file/{file_id}"
            result["streamUrl"] = f"/api/download/file/{file_id}?inline=1"
        return PrepareResponse(**result)
    except ValueError as e:
        logger.warning(f"Prepare failed (expected): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Prepare failed (unexpected): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prepare failed: {str(e)}")


@router.post("/start", response_model=DownloadResponse)
async def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    download_id = req.downloadId or str(uuid.uuid4())
    logger.info(
        f"Start download: id={download_id} url={req.url[:100]} format={req.format_spec}"
    )

    # Route Google Drive URLs to the Drive handler
    if _is_google_drive_url(req.url):
        file_id = extract_file_id(req.url)
        if not file_id:
            raise HTTPException(
                status_code=400,
                detail="Could not extract file ID from Google Drive URL.",
            )
        if is_folder_url(req.url):
            raise HTTPException(
                status_code=400,
                detail="Google Drive folder downloads are not yet supported. Download files individually.",
            )

        async def _run_drive():
            try:
                await google_drive_download(file_id, download_id)
                logger.info(f"Google Drive download completed: id={download_id}")
            except Exception as e:
                logger.error(
                    f"Google Drive download failed: id={download_id} error={e}"
                )
                task = DOWNLOAD_TASKS.get(download_id)
                if task:
                    task["status"] = "failed"
                    task["error"] = str(e)

        background_tasks.add_task(_run_drive)

        return DownloadResponse(
            id=download_id,
            status="downloading",
            title=None,
        )

    async def _run():
        try:
            await downloader_service.start_download(
                url=req.url,
                download_id=download_id,
                format_spec=req.format_spec,
                output_template=req.outputTemplate,
                cookie_file=req.cookieFile,
                cookie_content=req.cookieContent,
                download_subtitles=req.downloadSubtitles,
            )
            logger.info(f"Download completed: id={download_id}")
        except Exception as e:
            logger.error(f"Download failed: id={download_id} error={e}")
            task = DOWNLOAD_TASKS.get(download_id)
            if task:
                task["status"] = "failed"
                task["error"] = str(e)

    background_tasks.add_task(_run)

    return DownloadResponse(
        id=download_id,
        status="downloading",
        title=None,
    )


@router.get("/status/{download_id}", response_model=DownloadStatusResponse)
async def get_status(download_id: str):
    status = downloader_service.get_download_status(download_id)
    if not status:
        raise HTTPException(status_code=404, detail="Download not found")
    return DownloadStatusResponse(**status)


@router.post("/cancel")
async def cancel_download(req: CancelRequest):
    logger.info(f"Cancel download: id={req.downloadId}")
    success = downloader_service.cancel_download(req.downloadId)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"success": True, "message": "Download cancelled"}


@router.post("/delete")
async def delete_file(req: DeleteFileRequest):
    logger.info(f"Delete file: {req.filepath}")
    success = downloader_service.delete_file(req.filepath)
    if not success:
        raise HTTPException(
            status_code=404, detail="File not found or could not be deleted"
        )
    parent = os.path.dirname(req.filepath)
    if parent and os.path.isdir(parent) and os.path.basename(parent) in DOWNLOAD_TASKS:
        try:
            shutil.rmtree(parent, ignore_errors=True)
            logger.info(f"Cleaned up directory: {parent}")
        except Exception as e:
            logger.warning(f"Failed to clean up directory {parent}: {e}")
    return {"success": True, "message": "File deleted"}


MIME_TYPE_MAP = {
    # Video
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".m4a": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".3gp": "video/3gpp",
    ".ts": "video/mp2t",
    ".mts": "video/mp2t",
    # Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".wma": "audio/x-ms-wma",
    ".m4a": "audio/mp4",
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
    ".bz2": "application/x-bzip2",
    ".xz": "application/x-xz",
    ".zst": "application/zstd",
}


def _get_mime_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return MIME_TYPE_MAP.get(ext, "application/octet-stream")


def _ascii_fallback_filename(filename: str) -> str:
    """ASCII-only fallback for the plain `filename=` header part."""
    safe = filename.encode("ascii", "ignore").decode("ascii")
    safe = safe.replace('"', "").strip(" .")
    return safe or "download"


def _content_disposition(filename: str, inline: bool) -> str:
    """Build an RFC 5987 Content-Disposition header safe for any Unicode title.

    Media titles frequently contain emoji or non-latin-1 characters (e.g.
    Hindi/Gujarati). Putting them raw into a header crashes Starlette's header
    serialization with ``UnicodeEncodeError: 'latin-1' codec can't encode ...``
    which surfaces to clients as HTTP 500. Percent-encoding via ``filename*=``
    keeps every header byte latin-1-safe.
    """
    filename = filename.replace('"', "")
    mode = "inline" if inline else "attachment"
    encoded = quote(filename, safe="")
    if encoded == filename:
        return f'{mode}; filename="{filename}"'
    fallback = _ascii_fallback_filename(filename)
    return f"{mode}; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"


def _serve_file_streaming(
    filepath: str,
    filename: str,
    media_type: str,
    request: Request,
    inline: bool = False,
) -> StreamingResponse:
    """Serve a file with Range (206) support and inline/attachment disposition."""
    try:
        file_size = os.path.getsize(filepath)
    except OSError as e:
        logger.warning(f"File disappeared before serving: {filepath} error={e}")
        raise HTTPException(status_code=404, detail="File not found on disk")

    range_header = request.headers.get("range")
    start = 0
    end = file_size - 1
    status_code = 200

    if range_header:
        match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
        if match:
            start_s, end_s = match.groups()
            if start_s:
                start = int(start_s)
            if end_s:
                end = min(int(end_s), file_size - 1)
            if start > end or start >= file_size:
                return StreamingResponse(
                    iter([]),
                    status_code=416,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            status_code = 206

    length = end - start + 1

    def _chunks():
        try:
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(1024 * 256, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
        except OSError as e:
            logger.warning(f"Stream interrupted for {filepath}: {e}")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Disposition": _content_disposition(filename, inline),
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        _chunks(),
        status_code=status_code,
        media_type=media_type,
        headers=headers,
    )


@router.get("/file/{download_id}")
async def download_file(download_id: str, request: Request, inline: int = Query(default=0)):
    """Serve a prepared (stored) or task-based download file.

    - Prepared files: Range-aware, kept until TTL expiry so the preview player
      and the download button can both use the same stored file.
    - Task files: streamed once with cleanup after transfer (legacy flow).
    """
    try:
        stored = file_storage.resolve(download_id)
        if stored:
            file_storage.touch(download_id)
            return _serve_file_streaming(
                stored.filepath,
                stored.filename,
                stored.mime_type,
                request,
                inline=bool(inline),
            )

        task = DOWNLOAD_TASKS.get(download_id)
        if not task or task["status"] != "completed" or not task.get("filepath"):
            raise HTTPException(
                status_code=404, detail="Download not found or not yet completed"
            )

        filepath = task["filepath"]
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File not found on disk")

        filename = task.get("filename") or os.path.basename(filepath)
        media_type = _get_mime_type(filename)

        logger.info(f"Serving task file: {filepath} as {media_type}")

        def cleanup():
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.info(f"Cleaned up file: {filepath}")
                parent = os.path.dirname(filepath)
                if parent and os.path.isdir(parent):
                    shutil.rmtree(parent, ignore_errors=True)
                    logger.info(f"Cleaned up directory: {parent}")
            except Exception as e:
                logger.warning(f"Cleanup error: {e}")

        return FileResponse(
            path=filepath,
            media_type=media_type,
            filename=filename,
            background=BackgroundTask(cleanup),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to serve file {download_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Failed to serve file")


@router.post("/fetch")
async def fetch_media(req: FetchRequest):
    """Download media synchronously and return the real file (never JSON).

    This is the direct-download endpoint used by the frontend "Download Now"
    button. It downloads the selected/best format via yt-dlp and streams the
    actual media bytes back with the correct Content-Type / Content-Disposition.
    """
    logger.info(
        f"Fetch request: url={req.url[:100]} format={req.format_spec} drive_all={req.drive_all}"
    )
    try:
        if _is_google_drive_url(req.url):
            file_id = extract_file_id(req.url)
            if not file_id:
                raise ValueError(
                    "Could not extract file ID from Google Drive URL."
                )
            if req.drive_all and is_folder_url(req.url):
                logger.info(f"Google Drive folder ZIP download: {file_id}")
                zip_path, zip_name, zip_type = await google_drive_folder_zip(file_id)
                return _stream_file(
                    filepath=zip_path,
                    filename=zip_name,
                    download_id=str(uuid.uuid4()),
                    media_type=zip_type,
                )
            if is_folder_url(req.url):
                raise ValueError(
                    "This is a Google Drive folder. Use the folder's Download All button to bundle its files into a ZIP."
                )
            result = await google_drive_download(file_id, str(uuid.uuid4()))
            return _stream_file(
                filepath=result["filepath"],
                filename=result["filename"],
                download_id=result["id"],
            )

        result = await downloader_service.download_now(
            url=req.url,
            format_spec=req.format_spec,
            cookie_content=req.cookieContent,
            download_subtitles=req.downloadSubtitles,
        )
        return _stream_file(
            filepath=result["filepath"],
            filename=result["filename"],
            download_id=result["downloadId"],
        )
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Fetch failed (expected): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Fetch failed (unexpected): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


def _stream_file(
    filepath: str, filename: str, download_id: str, media_type: Optional[str] = None
) -> FileResponse:
    """Stream a downloaded file to the client and clean it up afterwards."""
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Downloaded file not found on disk")

    media_type = media_type or _get_mime_type(filename)
    logger.info(f"Fetch streaming: {filename} as {media_type}")

    def cleanup():
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"Cleaned up file: {filepath}")
            parent = os.path.dirname(filepath)
            if parent and os.path.isdir(parent):
                shutil.rmtree(parent, ignore_errors=True)
                logger.info(f"Cleaned up directory: {parent}")
        except Exception as e:
            logger.warning(f"Cleanup error: {e}")
        DOWNLOAD_TASKS.pop(download_id, None)

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        headers={
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(cleanup),
    )


@router.get("/stream")
async def stream_media(url: str, request: Request):
    """Proxy a direct media URL for inline playback (Range-aware)."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid media URL")

    headers = {"User-Agent": settings.USER_AGENT}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    try:
        req = client.build_request("GET", url, headers=headers)
        resp = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        logger.warning(f"Stream upstream request failed: url={url[:100]} error={e}")
        raise HTTPException(status_code=502, detail="Failed to reach media source")

    async def passthrough():
        for key in (
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges",
            "etag",
            "last-modified",
            "cache-control",
        ):
            val = resp.headers.get(key)
            if val:
                yield key, val

    async def stream():
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        status_code=resp.status_code,
        headers=dict(passthrough()),
    )


def _detect_browsers() -> list[str]:
    """Detect installed browsers available for cookie extraction."""
    browsers_found = []
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
                browsers_found.append(browser_name)
        except Exception:
            continue
    return browsers_found


@router.get("/instagram/browsers")
async def instagram_browsers():
    """List browsers available for cookie extraction."""
    return {
        "browsers": _detect_browsers(),
        "message": "Browser detection complete",
    }


@router.get("/instagram/auth/status")
async def instagram_auth_status():
    """Check if valid Instagram cookies exist."""
    cookie_file = _find_cookie_file()
    has_valid_cookies = bool(
        cookie_file and _check_cookie_file_has_sessionid(cookie_file)
    )

    browsers_found = _detect_browsers()

    return {
        "authenticated": has_valid_cookies,
        "hasCookieFile": cookie_file is not None,
        "browsersAvailable": browsers_found,
        "message": "Instagram session is valid"
        if has_valid_cookies
        else "Instagram authentication required",
    }


@router.post("/instagram/auth/browser")
async def instagram_auth_browser():
    """Trigger browser-based cookie extraction using Chrome CDP."""
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    temp_dir = os.path.join(os.environ.get("TEMP", "/tmp"), "ud_ig_cookies")
    cookies_path = os.path.join(settings.COOKIES_DIR, "cookies.txt")

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/IM", "chrome.exe"],
            capture_output=True,
            text=True,
            timeout=5,
        )

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        proc = subprocess.Popen(
            [
                chrome_path,
                "--remote-debugging-port=9222",
                f"--user-data-dir={temp_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "https://www.instagram.com/",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {
            "success": True,
            "message": "Chrome opened. Please log into Instagram in the Chrome window.",
            "chromeOpened": True,
            "debugPort": 9222,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "message": "Chrome not found. Please install Chrome or export cookies manually.",
            "chromeOpened": False,
        }


@router.get("/instagram/auth/poll")
async def instagram_auth_poll():
    """Poll whether cookies have been obtained via the Chrome CDP process."""
    import urllib.request

    try:
        resp = urllib.request.urlopen("http://localhost:9222/json", timeout=3)
        tabs = json.loads(resp.read())
        if not tabs:
            return {"authenticated": False, "message": "No browser tabs found"}
    except Exception:
        return {"authenticated": False, "message": "Chrome debugger not available"}

    try:
        import asyncio
        import websockets

        async def check_cookies():
            async with websockets.connect(tabs[0]["webSocketDebuggerUrl"]) as ws:
                msg = json.dumps({"id": 1, "method": "Network.getAllCookies"})
                await ws.send(msg)
                result = json.loads(await ws.recv())
                return result.get("result", {}).get("cookies", [])

        cookies = asyncio.run(check_cookies())
        insta_cookies = [
            c for c in cookies if "instagram" in c.get("domain", "").lower()
        ]
        sessionid = [c for c in insta_cookies if c["name"] == "sessionid"]

        if sessionid:
            cookie_content = ""
            for dest_path in [
                settings.COOKIES_DIR,
                os.path.dirname(os.path.dirname(settings.COOKIES_DIR)),
            ]:
                os.makedirs(dest_path, exist_ok=True)
                target = os.path.join(dest_path, "cookies.txt")
                with open(target, "w") as f:
                    f.write(
                        "# Netscape HTTP Cookie File\n# Generated by Instagram Auth\n\n"
                    )
                    for c in cookies:
                        if "instagram" not in c.get("domain", "").lower():
                            continue
                        d = c.get("domain", ".instagram.com")
                        if not d.startswith("."):
                            d = "." + d
                        line = (
                            f"{d}\tTRUE\t{c.get('path', '/')}\t{'TRUE' if c.get('secure') else 'FALSE'}\t{int(c.get('expires', 0))}\t{c['name']}\t{c['value']}\n"
                        )
                        f.write(line)
                        cookie_content += line
            return {
                "authenticated": True,
                "message": "Instagram cookies obtained successfully",
                "cookieContent": cookie_content,
            }
        return {
            "authenticated": False,
            "message": "sessionid not found. Please log into Instagram in Chrome.",
        }
    except Exception as e:
        return {"authenticated": False, "message": f"Error checking cookies: {str(e)}"}


@router.post("/instagram/analyze")
async def instagram_analyze(req: AnalyzeRequest):
    """Analyze Instagram URL with retry logic."""
    max_retries = 2
    last_error = None
    for attempt in range(max_retries):
        try:
            logger.info(
                f"Instagram analyze attempt {attempt + 1}/{max_retries}: {req.url[:80]} cookies={'yes' if req.cookieContent else 'no'}"
            )
            result = await downloader_service.analyze_url(
                req.url, cookie_content=req.cookieContent
            )
            return AnalyzeResponse(**result)
        except HTTPException:
            raise
        except ValueError as e:
            last_error = str(e)
            error_lower = last_error.lower()
            if (
                "login" in error_lower
                or "sign in" in error_lower
                or "authentication" in error_lower
            ):
                if attempt == 0:
                    logger.info("Auth required, retrying Instagram analyze...")
                    continue
            if attempt < max_retries - 1:
                logger.info(f"Retrying Instagram analyze (attempt {attempt + 1})...")
                continue
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                continue
            break
    raise HTTPException(
        status_code=400, detail=last_error or "Failed to analyze Instagram URL"
    )


@router.get("/formats")
async def get_formats(url: str):
    logger.info(f"Get formats: url={url[:100]}")
    try:
        result = await downloader_service.get_formats(url)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Get formats failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get formats: {str(e)}")
