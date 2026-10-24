"""Polite HTTP helper: fixed request spacing, retries with backoff, Retry-After support."""

from __future__ import annotations

import logging
import time

import requests

log = logging.getLogger(__name__)

RETRY_STATUS = {429, 500, 502, 503, 504}


class PoliteClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        interval: float = 0.2,
        max_retries: int = 5,
        timeout: float = 30.0,
        sleep=time.sleep,
    ) -> None:
        self.session = session or requests.Session()
        self.session.headers.setdefault("User-Agent", "dsx2026-alumni-network-graph/0.1 (research pipeline)")
        self.interval = interval
        self.max_retries = max_retries
        self.timeout = timeout
        self._sleep = sleep
        self._last = 0.0

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Send a request, retrying throttling and server errors. Raises on final failure."""
        kwargs.setdefault("timeout", self.timeout)
        for attempt in range(self.max_retries + 1):
            wait = self.interval - (time.monotonic() - self._last)
            if wait > 0:
                self._sleep(wait)
            self._last = time.monotonic()
            try:
                resp = self.session.request(method, url, **kwargs)
            except (requests.ConnectionError, requests.Timeout) as exc:
                if attempt == self.max_retries:
                    raise
                delay = 2**attempt
                log.warning("%s %s failed (%s); retrying in %ss", method, url, exc, delay)
                self._sleep(delay)
                continue

            if resp.status_code in RETRY_STATUS and attempt < self.max_retries:
                delay = _retry_after(resp) or 2**attempt
                log.warning("%s %s returned %s; retrying in %ss", method, url, resp.status_code, delay)
                self._sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        raise RuntimeError("unreachable")


def _retry_after(resp: requests.Response) -> float | None:
    value = resp.headers.get("Retry-After")
    if not value:
        return None
    try:
        return min(float(value), 120.0)
    except ValueError:
        return None
