import json
from dataclasses import replace

import pytest
import requests

from pipelines.research.config import ResearchConfig
from pipelines.research.fetch import fetch_works
from pipelines.research.http import PoliteClient

from .conftest import FakeClient, FakeResponse


def page(ids, next_cursor):
    return {"meta": {"count": 5, "next_cursor": next_cursor}, "results": [{"id": f"https://openalex.org/{i}"} for i in ids]}


@pytest.fixture
def config(tmp_path):
    return ResearchConfig(cache_dir=tmp_path, max_works=3)


def test_filter_uses_bu_lineage_topics_and_years():
    f = ResearchConfig().openalex_filter()
    assert "authorships.institutions.lineage:I111088046" in f
    assert f"publication_year:{ResearchConfig().from_year}-{ResearchConfig().to_year}" in f
    assert "topics.id:T11396|" in f
    assert "topics.id" not in replace(ResearchConfig(), topic_ids=()).openalex_filter()


def test_cursor_paging_stops_at_cap_and_sends_credentials(config):
    client = FakeClient([page(["W1", "W2"], "c2"), page(["W3", "W4"], "c3")])
    result = fetch_works(config, client=client, api_key="SECRET", mailto="team@example.org")
    assert [w["id"][-2:] for w in result.works] == ["W1", "W2", "W3"]
    assert len(client.calls) == 2
    first, second = (c[2]["params"] for c in client.calls)
    assert first["cursor"] == "*" and second["cursor"] == "c2"
    assert first["api_key"] == "SECRET" and first["mailto"] == "team@example.org"
    assert first["per-page"] == 3


def test_no_cap_pages_until_the_cursor_ends(tmp_path):
    config = ResearchConfig(cache_dir=tmp_path, max_works=None)
    client = FakeClient([page(["W1", "W2"], "c2"), page(["W3"], "c3"), page([], None)])
    result = fetch_works(config, client=client)
    assert len(result.works) == 3
    assert client.calls[0][2]["params"]["per-page"] == 200
    assert len(fetch_works(config, client=FakeClient([])).works) == 3  # cache reused


def test_cache_is_reused_and_has_no_api_key(config, tmp_path):
    fetch_works(config, client=FakeClient([page(["W1", "W2", "W3"], None)]), api_key="SECRET")
    cached_text = "".join(p.read_text() for p in tmp_path.rglob("*.json"))
    assert "SECRET" not in cached_text

    offline = FakeClient([])  # any request would fail
    result = fetch_works(config, client=offline)
    assert result.from_cache and len(result.works) == 3 and offline.calls == []

    refreshed = fetch_works(config, client=FakeClient([page(["W9"], None)]), refresh=True)
    assert [w["id"] for w in refreshed.works] == ["https://openalex.org/W9"]


def test_incomplete_cache_is_refetched(config, tmp_path):
    fetch_works(config, client=FakeClient([page(["W1"], None)]))
    (manifest,) = tmp_path.rglob("manifest.json")
    data = json.loads(manifest.read_text())
    data["complete"] = False
    manifest.write_text(json.dumps(data))
    client = FakeClient([page(["W2"], None)])
    assert fetch_works(config, client=client).works[0]["id"].endswith("W2")


def truncated_work(wid, n):
    return {"id": f"https://openalex.org/{wid}", "authorships": [{"author": {"id": f"A{i}"}} for i in range(n)]}


def test_works_at_the_authorship_limit_are_completed_and_cached(config, tmp_path):
    listing = {"meta": {"count": 2, "next_cursor": None}, "results": [truncated_work("W1", 100), truncated_work("W2", 5)]}
    full = truncated_work("W1", 250)
    client = FakeClient([listing, full])
    result = fetch_works(config, client=client, api_key="SECRET")

    assert [len(w["authorships"]) for w in result.works] == [250, 5]
    method, url, kwargs = client.calls[1]
    assert url.endswith("/works/W1") and kwargs["params"]["api_key"] == "SECRET"
    assert "SECRET" not in (next(tmp_path.rglob("full_W1.json"))).read_text()

    offline = FakeClient([])
    again = fetch_works(config, client=offline)
    assert again.from_cache and len(again.works[0]["authorships"]) == 250 and offline.calls == []


class SequenceSession:
    def __init__(self, items):
        self.items = list(items)
        self.headers = {}

    def request(self, method, url, **kwargs):
        item = self.items.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def test_polite_client_retries_throttling_then_succeeds():
    sleeps = []
    session = SequenceSession(
        [FakeResponse({}, 429, {"Retry-After": "3"}), requests.ConnectionError("boom"), FakeResponse({"ok": True})]
    )
    client = PoliteClient(session=session, interval=0, sleep=sleeps.append)
    assert client.request("GET", "https://example.org").json() == {"ok": True}
    assert sleeps == [3.0, 2]


def test_polite_client_raises_after_retries():
    session = SequenceSession([FakeResponse({}, 503)] * 3)
    client = PoliteClient(session=session, interval=0, max_retries=2, sleep=lambda s: None)
    with pytest.raises(requests.HTTPError):
        client.request("GET", "https://example.org")
