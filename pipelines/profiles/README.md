# Person profiles

Adds what a person's card shows beyond the graph: their current position, biography, research keywords and websites (from their **public ORCID record**), and all-time paper, citation and h-index counts, recent institutions and top topics (from their **OpenAlex author record**).

```bash
python -m pipelines.profiles.run      # fetch (cached under data/raw/profiles/), write data/modules/profiles.json, attach to data/graph.json
python -m pipelines.merge.run         # re-applies data/modules/profiles.json, so re-merging keeps profiles
```

- **Keyed by ORCID iD and OpenAlex author ID**, not by graph node ID, so profiles reattach to the right person after every merge. A merged person with several OpenAlex IDs uses the one with the most works.
- **Attached as `attributes.profile`** on person nodes, with an `openalex` source ref and a `user_submitted` source ref for the ORCID record (the same convention as `data/curation/people.yaml`).
- **Only stated facts:** a position is shown only if the ORCID record lists it with no end date. Fields a record doesn't state are left out. Email and postal addresses in ORCID records are never read.
- **Sources we don't fetch:** BU Profiles (its robots.txt disallows automated access to profile and search pages) and BU Directory (requires a BU login). The card links to a person's BU Profiles page only when they list it on ORCID, and offers Google Scholar and LinkedIn as name searches that open in the viewer's browser, labeled as searches.

Tests: `tests/profiles/test_profiles.py` (fixtures plus property P1: applying profiles only adds `attributes.profile` and source refs to person nodes).
