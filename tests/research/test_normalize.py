from pipelines.common.validation import validate_graph
from pipelines.research.normalize import normalize_works

BU = "I111088046"


def build(works, **kwargs):
    g, stats = normalize_works(works, retrieved_at="2026-10-24", bu_institution_id=BU, **kwargs)
    return g, stats, g.to_document("research", generated_at="2026-10-24T00:00:00Z")


def edges_of(doc, edge_type):
    return [e for e in doc["edges"] if e["type"] == edge_type]


def test_output_passes_validator(works):
    _, _, doc = build(works)
    result = validate_graph(doc)
    assert result.errors == []


def test_publication_node_has_source_and_attributes(works):
    g, _, _ = build(works)
    pub = g.nodes["publication:openalex:W9000000001"]
    assert pub["label"] == "Example Study of Machine Learning for Clinical Triage"
    assert pub["sources"] == [
        {"source": "openalex", "record_id": "W9000000001", "url": "https://openalex.org/W9000000001", "retrieved_at": "2026-10-24"}
    ]
    assert pub["attributes"] == {
        "year": 2021,
        "venue": "Example Journal of Medical AI",
        "doi": "10.0000/example.0001",
        "citation_count": 42,
        "work_type": "article",
    }


def test_missing_values_are_omitted_not_guessed(works):
    g, _, _ = build(works)
    attrs = g.nodes["publication:openalex:W9000000002"]["attributes"]
    assert "venue" not in attrs and "doi" not in attrs
    assert "attributes" not in g.nodes["person:openalex:A9000000003"]  # no ORCID


def test_untitled_work_and_unidentified_author_are_skipped(works):
    g, stats, _ = build(works)
    assert "publication:openalex:W9000000003" not in g.nodes
    assert stats.works == 2
    assert stats.skipped["work_without_title"] == 1
    assert stats.skipped["authorship_without_author_id_or_name"] == 1
    assert len([n for n in g.nodes.values() if n["type"] == "person"]) == 3


def test_work_without_any_identified_author_is_skipped():
    work = {
        "id": "https://openalex.org/W9000000098",
        "display_name": "Example Paper With Anonymous Author",
        "authorships": [{"author": {"id": None, "display_name": "Example Anonymous"}, "institutions": []}],
        "topics": [{"id": "https://openalex.org/T11396", "display_name": "Artificial Intelligence in Healthcare"}],
    }
    g, stats, _ = build([work])
    assert g.nodes == {} and g.edges == {}
    assert stats.works == 0 and stats.skipped["work_without_identified_authors"] == 1


def test_bu_affiliation_rules(works):
    g, stats, _ = build(works)
    one = g.nodes["person:openalex:A9000000001"]["bu_affiliation"]
    assert one["status"] == "bu_affiliated_researcher"
    assert sorted(e["record_id"] for e in one["evidence"]) == ["W9000000001", "W9000000002"]

    # A BU child institution (BU in lineage) counts as BU.
    two = g.nodes["person:openalex:A9000000002"]["bu_affiliation"]
    assert two["status"] == "bu_affiliated_researcher"
    assert two["evidence"][0]["note"] == "Authorship institution: Example BU Child Study"

    # A related-but-not-child institution does not.
    assert g.nodes["person:openalex:A9000000003"]["bu_affiliation"] == {"status": "unverified", "evidence": []}

    statuses = {n["bu_affiliation"]["status"] for n in g.nodes.values() if n["type"] == "person"}
    assert "verified_alumnus" not in statuses
    assert (stats.bu_authors, stats.unverified_authors) == (2, 1)


def test_orcid_is_kept_for_identity_matching(works):
    g, _, _ = build(works)
    assert g.nodes["person:openalex:A9000000001"]["attributes"] == {"orcid": "0000-0000-0000-0001"}


def test_authored_affiliated_and_topic_edges(works):
    g, _, doc = build(works)
    assert len(edges_of(doc, "AUTHORED")) == 5
    authored = g.edges["edge:authored:person:openalex:A9000000001|publication:openalex:W9000000001"]
    assert authored["derivation"] == "source_record" and authored["confidence"] == "high"
    assert authored["note"] == "Author position: first; corresponding author"

    # ROR preferred, OpenAlex fallback.
    assert "organization:ror:05qwgg493" in g.nodes
    assert "organization:openalex:I9000000010" in g.nodes
    bu_aff = g.edges["edge:affiliated_with:person:openalex:A9000000001|organization:ror:05qwgg493"]
    assert sorted(e["record_id"] for e in bu_aff["evidence"]) == ["W9000000001", "W9000000002"]

    topic_edge = g.edges["edge:has_topic:publication:openalex:W9000000001|topic:openalex:T11396"]
    assert topic_edge["note"] == "OpenAlex topic score: 0.9876; primary topic"
    assert g.nodes["topic:openalex:T11396"]["attributes"]["field"] == "Health Professions"
    assert len(edges_of(doc, "HAS_TOPIC")) == 3


def test_coauthor_edges_accumulate_shared_works(works):
    g, _, doc = build(works)
    coauthor = edges_of(doc, "COAUTHORED_WITH")
    # W1: 3 pairs among A1, A2, A3. W2: A1-A3 again (unidentified author skipped).
    assert len(coauthor) == 3
    e13 = g.edges["edge:coauthored_with:person:openalex:A9000000001|person:openalex:A9000000003"]
    assert e13["derivation"] == "derived"
    assert sorted(e["record_id"] for e in e13["evidence"]) == ["W9000000001", "W9000000002"]


def test_large_author_lists_skip_coauthor_edges_but_keep_authored():
    work = {
        "id": "https://openalex.org/W9000000099",
        "display_name": "Example Consortium Paper",
        "authorships": [
            {"author": {"id": f"https://openalex.org/A90000001{i:02d}", "display_name": f"Example Member {i}"}, "institutions": []}
            for i in range(4)
        ],
        "topics": [],
    }
    g, stats, doc = build([work], max_authors_for_coauthor=3)
    assert stats.coauthor_skipped_works == 1
    assert edges_of(doc, "COAUTHORED_WITH") == []
    assert len(edges_of(doc, "AUTHORED")) == 4

    _, _, doc = build([work], max_authors_for_coauthor=4)
    assert len(edges_of(doc, "COAUTHORED_WITH")) == 6


def test_normalization_is_deterministic(works):
    assert build(works)[2] == build(list(works))[2]
