"""RetryManager — resilient async retry with exponential backoff + jitter.

Used to harden network-dependent operations (URL analysis, downloads,
upstream proxies) against transient failures.
"""
from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Awaitable, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryManager:
    def __init__(
        self,
        attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 20.0,
        jitter: float = 0.5,
        retryable_exceptions: Optional[tuple[type[BaseException], ...]] = None,
    ):
        self.attempts = max(1, attempts)
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter
        self.retryable_exceptions = retryable_exceptions or (
            TimeoutError,
            ConnectionError,
            OSError,
            asyncio.TimeoutError,
        )

    def _should_retry(self, exc: BaseException) -> bool:
        return isinstance(exc, self.retryable_exceptions)

    async def run(
        self,
        fn: Callable[..., Awaitable[T]],
        *args: Any,
        attempts: Optional[int] = None,
        **kwargs: Any,
    ) -> T:
        """Execute `fn(*args, **kwargs)` with retries and backoff."""
        max_attempts = attempts or self.attempts
        last_exc: Optional[BaseException] = None
        for attempt in range(1, max_attempts + 1):
            try:
                return await fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 - retry layer catches all
                last_exc = exc
                if attempt >= max_attempts or not self._should_retry(exc):
                    raise
                delay = min(self.base_delay * (2 ** (attempt - 1)), self.max_delay)
                delay *= 1 + (random.random() * 2 - 1) * self.jitter
                logger.warning(
                    f"RetryManager retry {attempt}/{max_attempts} after {delay:.1f}s "
                    f"({type(exc).__name__}: {exc})"
                )
                await asyncio.sleep(max(0.0, delay))
        # Unreachable, but satisfies type checkers.
        raise last_exc  # type: ignore[misc]


retry_manager = RetryManager()
