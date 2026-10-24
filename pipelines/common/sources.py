"""Source/evidence reference builder (shared-data-contract task 3.2)."""

from __future__ import annotations

from urllib.parse import urlparse

from .contract import SOURCES


def is_http_url(url: object) -> bool:
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def source_ref(
    source: str,
    url: str,
    record_id: str | None = None,
    retrieved_at: str | None = None,
    note: str | None = None,
) -> dict:
    """Build a sourceRef dict. Optional fields are omitted when not provided."""
    if source not in SOURCES:
        raise ValueError(f"unknown source: {source!r}")
    if not is_http_url(url):
        raise ValueError(f"source url must be an http(s) URL: {url!r}")
    ref: dict = {"source": source}
    if record_id:
        ref["record_id"] = record_id
    ref["url"] = url
    if retrieved_at:
        ref["retrieved_at"] = retrieved_at
    if note:
        ref["note"] = note
    return ref


def ref_key(ref: dict) -> tuple:
    """Deduplication key for source/evidence refs: (source, record_id, url)."""
    return (ref.get("source"), ref.get("record_id"), ref.get("url"))


def merge_refs(existing: list[dict], new: list[dict]) -> list[dict]:
    """Append refs from `new` that aren't already in `existing` (by ref_key)."""
    seen = {ref_key(r) for r in existing}
    merged = list(existing)
    for ref in new:
        key = ref_key(ref)
        if key not in seen:
            seen.add(key)
            merged.append(ref)
    return merged
