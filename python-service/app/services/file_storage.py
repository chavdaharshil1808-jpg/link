"""FileStorage — temporary media registry.

Prepared downloads are stored here so the same file can be:
  1. streamed inline for the preview player (Range-aware),
  2. downloaded as an attachment afterwards.

Files are kept for a TTL (default 1 hour) and cleaned by a background
janitor so the temp directory never grows unboundedly.
"""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class StoredFile:
    id: str
    filepath: str
    filename: str
    mime_type: str
    size: int
    created_at: float
    expires_at: float


class FileStorage:
    """Thread-safe registry of prepared temp files with TTL expiry."""

    def __init__(self, base_dir: str, ttl_seconds: int = 3600):
        self.base = Path(base_dir)
        self.base.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_seconds
        self._files: dict[str, StoredFile] = {}
        self._lock = threading.Lock()

    def register(
        self,
        filepath: str,
        filename: Optional[str] = None,
        mime_type: str = "application/octet-stream",
        ttl: Optional[int] = None,
    ) -> str:
        """Register an existing file and return its access id."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        file_id = uuid.uuid4().hex
        size = os.path.getsize(filepath)
        now = time.time()
        ttl_seconds = ttl or self.ttl
        stored = StoredFile(
            id=file_id,
            filepath=os.path.abspath(filepath),
            filename=filename or os.path.basename(filepath),
            mime_type=mime_type,
            size=size,
            created_at=now,
            expires_at=now + ttl_seconds,
        )
        with self._lock:
            self._files[file_id] = stored
        logger.info(
            f"FileStorage registered {file_id} -> {stored.filename} ({size} bytes, ttl={ttl_seconds}s)"
        )
        return file_id

    def resolve(self, file_id: str) -> Optional[StoredFile]:
        """Return stored file metadata if it exists and has not expired."""
        with self._lock:
            stored = self._files.get(file_id)
            if not stored:
                return None
            if stored.expires_at < time.time():
                self._files.pop(file_id, None)
                return None
            if not os.path.exists(stored.filepath):
                self._files.pop(file_id, None)
                return None
            return stored

    def touch(self, file_id: str, ttl: Optional[int] = None) -> None:
        """Extend a stored file's TTL (e.g. after it was served)."""
        with self._lock:
            stored = self._files.get(file_id)
            if not stored:
                return
            now = time.time()
            stored.created_at = now
            stored.expires_at = now + (ttl or self.ttl)

    def unregister(self, file_id: str) -> Optional[StoredFile]:
        with self._lock:
            return self._files.pop(file_id, None)

    def cleanup(self) -> int:
        """Delete expired files and remove their registry entries.

        Returns the number of files removed.
        """
        now = time.time()
        removed = 0
        with self._lock:
            expired = [f for f in self._files.values() if f.expires_at < now]
            for stored in expired:
                self._files.pop(stored.id, None)
                try:
                    if os.path.exists(stored.filepath):
                        os.remove(stored.filepath)
                    removed += 1
                    logger.info(f"FileStorage cleanup removed {stored.filename}")
                except OSError as e:
                    logger.warning(
                        f"FileStorage cleanup failed for {stored.filepath}: {e}"
                    )
        return removed

    def sweep(self) -> None:
        """Remove everything currently stored (shutdown safety)."""
        with self._lock:
            ids = list(self._files.keys())
        for file_id in ids:
            stored = self.unregister(file_id)
            if stored and os.path.exists(stored.filepath):
                try:
                    os.remove(stored.filepath)
                except OSError:
                    pass

    def count(self) -> int:
        with self._lock:
            return len(self._files)


file_storage = FileStorage(os.path.join(settings.DOWNLOAD_DIR, "prepared"))
