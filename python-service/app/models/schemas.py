from pydantic import BaseModel, Field
from typing import Optional


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    cookieContent: Optional[str] = None


class PrepareRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    format_spec: str = Field(default="best", min_length=1, max_length=500)
    cookieContent: Optional[str] = None
    downloadSubtitles: bool = False


class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    downloadId: str = Field(default="")
    format_spec: str = Field(default="best", min_length=1, max_length=500)
    downloadSubtitles: bool = False
    cookieFile: Optional[str] = None
    cookieContent: Optional[str] = None
    outputTemplate: str = "%(title)s.%(ext)s"


class FetchRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    format_spec: str = Field(default="best", min_length=1, max_length=500)
    cookieContent: Optional[str] = None
    downloadSubtitles: bool = False
    drive_all: bool = False


class CancelRequest(BaseModel):
    downloadId: str


class DeleteFileRequest(BaseModel):
    filepath: str


class DriveFileInfo(BaseModel):
    """A single item inside a Google Drive folder listing."""

    id: str
    name: str
    size: int = 0
    mimeType: str = ""
    mediaType: str = "OTHER"
    extension: str = "bin"
    isFolder: bool = False


class AnalyzeResponse(BaseModel):
    """Clean, UI-safe media card DTO.

    Only display metadata is exposed. Everything else (format tables,
    raw extractor output, cookies/headers) stays internal to the backend.
    """

    url: str
    title: str
    thumbnail: str = ""
    duration: float = 0
    uploader: str = "Unknown"
    mediaType: str
    platform: str
    platformUrl: str = ""
    preview: Optional[dict] = None
    resolution: Optional[str] = None
    fileSize: Optional[int] = None
    extension: Optional[str] = None
    # Google Drive specific fields
    driveFileId: Optional[str] = None
    driveIsFolder: bool = False
    driveFiles: Optional[list[DriveFileInfo]] = None
    error: Optional[str] = None


class DownloadResponse(BaseModel):
    id: str
    status: str
    filename: Optional[str] = None
    filepath: Optional[str] = None
    title: Optional[str] = None


class PrepareItem(BaseModel):
    """A single downloadable item inside a playlist / multi-image post."""

    title: str
    url: str
    thumbnail: str = ""
    duration: float = 0
    mediaType: str = "VIDEO"
    extension: Optional[str] = None


class PrepareResponse(BaseModel):
    """Media-first DTO for the /prepare endpoint.

    The final answer is always *downloadable media*:
      - downloadUrl → attachment download (real bytes)
      - streamUrl   → inline, Range-aware streaming (real bytes)
      - filename / filesize / mimeType → what the file actually is

    Metadata (title, duration, uploader) exists only to render the media card.
    No raw yt-dlp JSON / extractor output is ever exposed.
    """

    url: str
    title: str
    thumbnail: str = ""
    duration: float = 0
    uploader: str = "Unknown"
    platform: str = ""
    mediaType: str
    mimeType: str = ""
    filename: str = ""
    filesize: Optional[int] = None
    downloadUrl: str = ""
    streamUrl: str = ""
    preview: Optional[dict] = None
    extension: Optional[str] = None
    items: Optional[list[PrepareItem]] = None
    error: Optional[str] = None


class DownloadStatusResponse(BaseModel):
    id: str
    status: str
    progress: float = 0
    speed: float = 0
    eta: float = 0
    filename: Optional[str] = None
    filepath: Optional[str] = None
    error: Optional[str] = None
    step: Optional[str] = None
