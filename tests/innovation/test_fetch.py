"""Fetch and cache tests for the innovation pipeline (innovation-funding tasks 3 and 6, Req 1.4). No live calls."""

import shutil
import zipfile
from dataclasses import replace

import pytest

from pipelines.innovation.config import InnovationConfig
from pipelines.innovation.fetch_awards import build_query, fetch_awards, is_bu_project
from pipelines.innovation.fetch_patents import MissingColumnError, fetch_patents, select_patents

from ..research.conftest import FakeClient
from .conftest import BU_NAMES, PATENTSVIEW_FIXTURES, _load


def test_nih_query_scopes_to_bu_years_and_topic():
    query = build_query(InnovationConfig())
    criteria = query["criteria"]
    assert criteria["org_names"] == list(BU_NAMES)
    assert criteria["fiscal_years"][0] == 2015 and criteria["fiscal_years"][-1] == 2026
    assert '"machine learning"' in criteria["advanced_text_search"]["search_text"]


def test_bu_project_check_is_exact_not_substring():
    assert is_bu_project({"organization": {"org_name": "BOSTON UNIVERSITY MEDICAL CAMPUS"}}, BU_NAMES)
    assert not is_bu_project({"organization": {"org_name": "TUFTS UNIVERSITY BOSTON"}}, BU_NAMES)
    assert not is_bu_project({"organization": {"org_name": "UNIVERSITY OF MASSACHUSETTS BOSTON"}}, BU_NAMES)


def test_fetch_awards_pages_caches_and_reuses(tmp_path):
    projects = _load("nih_projects.json")["results"]
    links = _load("nih_publications.json")["results"]
    works = _load("openalex_pmid_works.json")["results"]
    client = FakeClient([
        {"meta": {"total": len(projects)}, "results": projects},
        {"meta": {"total": len(links)}, "results": links},
        {"meta": {"count": 3}, "results": works},
    ])
    config = replace(InnovationConfig(), cache_dir=tmp_path)
    result = fetch_awards(config, client=client, openalex_api_key="secret-key")
    assert not result.from_cache
    assert len(result.projects) == 5 and len(result.publication_links) == 5
    assert set(result.pmid_works) == {"10000001", "10000002", "10000003"}

    # Only BU core projects are asked for publications (not Tufts' R01EX000003).
    assert client.calls[1][2]["json"]["criteria"]["core_project_nums"] == ["R01EX000001", "R21EX000002"]
    assert client.calls[2][2]["params"]["filter"].startswith("pmid:")

    # The API key is never written to the cache.
    assert not any("secret-key" in p.read_text() for p in tmp_path.rglob("*.json"))

    cached = fetch_awards(config, client=FakeClient([]))
    assert cached.from_cache
    assert cached.projects == result.projects and cached.pmid_works == result.pmid_works


def test_fetch_awards_follows_offsets(tmp_path):
    first = [{"appl_id": i} for i in range(500)]
    client = FakeClient([
        {"meta": {"total": 501}, "results": first},
        {"meta": {"total": 501}, "results": [{"appl_id": 500}]},
    ])
    result = fetch_awards(replace(InnovationConfig(), cache_dir=tmp_path), client=client)
    assert len(result.projects) == 501
    assert [c[2]["json"]["offset"] for c in client.calls] == [0, 500]


def test_fetch_patents_returns_none_without_bulk_tables(tmp_path):
    assert fetch_patents(replace(InnovationConfig(), patentsview_dir=tmp_path)) is None


def test_fetch_patents_reads_zips_and_caches_subset(tmp_path):
    for tsv in PATENTSVIEW_FIXTURES.glob("*.tsv"):
        with zipfile.ZipFile(tmp_path / f"{tsv.name}.zip", "w") as zf:
            zf.write(tsv, tsv.name)
    config = replace(InnovationConfig(), patentsview_dir=tmp_path)
    first = fetch_patents(config)
    assert not first.from_cache
    assert [p["patent_id"] for p in first.patents] == ["9000001", "9000003"]
    again = fetch_patents(config)
    assert again.from_cache and again.patents == first.patents


def test_missing_column_names_the_file(tmp_path):
    for tsv in PATENTSVIEW_FIXTURES.glob("*.tsv"):
        shutil.copy(tsv, tmp_path / tsv.name)
    path = tmp_path / "g_assignee_disambiguated.tsv"
    path.write_text(path.read_text().replace("disambig_assignee_organization", "organization"))
    with pytest.raises(MissingColumnError, match="g_assignee_disambiguated.tsv"):
        select_patents(tmp_path, InnovationConfig())


def test_max_patents_keeps_most_recent_grants():
    records = select_patents(PATENTSVIEW_FIXTURES, replace(InnovationConfig(), cpc_prefixes=(), max_patents=2))
    assert [r["patent_id"] for r in records] == ["9000001", "9000002"]  # 2022 and 2023 grants
