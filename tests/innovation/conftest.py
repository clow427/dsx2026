import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
PATENTSVIEW_FIXTURES = FIXTURES / "patentsview"
BU_NAMES = ("BOSTON UNIVERSITY", "BOSTON UNIVERSITY (CHARLES RIVER CAMPUS)", "BOSTON UNIVERSITY MEDICAL CAMPUS")


def _load(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def nih_projects():
    return _load("nih_projects.json")["results"]


@pytest.fixture
def nih_links():
    return _load("nih_publications.json")["results"]


@pytest.fixture
def pmid_works():
    from pipelines.innovation.fetch_awards import _pmid_index

    return _pmid_index(_load("openalex_pmid_works.json")["results"])
