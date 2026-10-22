from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers.download import router as download_router
from app.services.file_storage import file_storage
import asyncio
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(download_router)


async def _storage_janitor() -> None:
    """Periodically delete expired prepared files."""
    while True:
        try:
            removed = await asyncio.to_thread(file_storage.cleanup)
            if removed:
                logger.info(f"Janitor removed {removed} expired prepared files")
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Janitor pass failed: {exc}")
        await asyncio.sleep(300)


@app.on_event("startup")
async def _startup() -> None:
    asyncio.create_task(_storage_janitor())


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }
