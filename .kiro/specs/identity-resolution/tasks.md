# Tasks: Alumni Discovery and Identity Resolution

**Owner:** P2. Also leads `.kiro/specs/shared-data-contract/tasks.md`.

> **Current focus — curated-people path (unblocked).** P3's `data/modules/innovation.json` does not exist yet, so full matching and the merge into `data/graph.json` cannot complete. The curated person directory (`data/curation/people.yaml` → `data/modules/people.json`) is missing and blocked by nobody. Tasks 1–6 below are a granular, data-grounded breakdown that builds that path now and lets matching run against P1's `data/modules/research.json` immediately, using a clearly-labeled mock `innovation.json` as a stand-in for P3. Tasks 7–8 remain as originally scoped.
>
> **Guardrails for every task below** (from `.kiro/steering/data-integrity.md` and the schemas):
> - Never invent facts. Every curated fact (degree, department, graduation year, employer) needs a public evidence URL from a source that states it. Leave a field out rather than guess.
> - `verified_alumnus` requires a source that explicitly states a BU degree; otherwise use `bu_affiliated_researcher`.
> - Mock data uses fictional names and `example.org`/`example.com`/`example.edu` URLs, is clearly labeled as mock, and is never mixed into real module outputs.
> - Reuse the existing helpers in `pipelines/common/` (`ids.py`, `sources.py`, `graph.py`, `contract.py`, `validation.py`) rather than reinventing ID construction or the sorted graph writer.
> - Conform to `schema/graph.schema.json` and `schema/identity_matches.schema.json`. Canonical IDs are `person:canonical:[a-z0-9-]+`. A `merged` match can never be `low` confidence. Signal enum: `orcid`, `exact_name`, `name_variant`, `shared_affiliation`, `shared_coauthor`, `shared_topic`, `institutional_bio`, `user_submitted`, `manual_review`.
> - Run `scripts/validate_graph.py` on any emitted graph file.
>
> **Dependency note:** Tasks 1–6 need nothing from P3. When P3's real `innovation.json` arrives, swap it in for the mock and re-run — that is the only remaining step before the merge (which lives in `.kiro/specs/shared-data-contract/` task 6). Confirm the contract sign-off (`.kiro/specs/shared-data-contract/` tasks 1 and 2) in parallel, since all of this builds on the current schema.

- [x] 1. Extract a candidate shortlist from `research.json` and author the curation files, then seed them with 5 to 10 real, publicly documented people relevant to the demo topic
  - [x] 1.1 Write a read-only shortlist extractor
    - Add a helper (e.g. `pipelines/identity/shortlist.py`) that reads `data/modules/research.json` and lists `person:openalex:*` nodes whose `bu_affiliation.status` is `bu_affiliated_researcher` and that carry an `attributes.orcid`, printing label, ORCID, and source URL for each.
    - Rank by signal strength (has ORCID **and** BU affiliation ranks highest) and emit a shortlist of ~15 candidates to curate down to 5–10.
    - Read-only: the helper must not mutate `research.json` or write into `data/modules/`.
    - _Test:_ assert the extractor returns only nodes with `type == "person"` and includes the ORCID and affiliation fields where present on the source node.
    - _Demo:_ run the helper and show a printed shortlist of real BU-affiliated researchers pulled straight from P1's data.
    - _Requirements: 1.1, 3.1_
  - [x] 1.2 Verify candidates and author `data/curation/people.yaml` and `data/curation/reviews.yaml`
    - Define the YAML formats following the shape in `design.md`. For each of 5–10 chosen people, check a public source (BU institutional bio, BU repository, or ORCID record) for a *stated* degree, department, or graduation year.
    - Record only facts a source states; omit any field that is not stated. Set `status: verified_alumnus` only where a degree is explicitly stated, otherwise `bu_affiliated_researcher`. Every fact carries a public evidence URL and `source: manual_curation` (or `user_submitted`).
    - Seed `reviews.yaml` with its format and at least one example manual decision so downstream override logic has a fixture to target.
    - _Test:_ a schema/lint check asserting each `people.yaml` entry has a `slug`, a `name`, at least one evidence URL, and that no entry is `verified_alumnus` without a stated degree.
    - _Demo:_ open `people.yaml` and show 5–10 evidence-backed people, each traceable to a real public URL.
    - _Requirements: 1.2, 1.3, 2.1_
- [x] 2. Implement directory building that turns curation entries into canonical person nodes (`people.json`)
  - Implement `pipelines/identity/directory.py` to turn `people.yaml` into canonical person nodes with IDs `person:canonical:<slug>`, reusing the `pipelines/common` ID builders, `SourceRef` builder, and the sorted graph writer. Emit a valid graph file at `data/modules/people.json` with `producer: identity`, and wire a `python -m pipelines.identity.run` entry point for the directory step.
  - Include a BU degree, department, or graduation year in a node only when the curation entry's evidence states it. Run `scripts/validate_graph.py` on the output.
  - Copy a curation entry's `photo` into `attributes.photo` only when `url`/`source`/`license`/`attribution`/`evidence` are all present; otherwise omit it.
  - _Test:_ fixture `people.yaml` → expected nodes; assert canonical ID format (`person:canonical:[a-z0-9-]+`) and that `scripts/validate_graph.py` passes on the emitted file. Also assert an entry with a complete photo emits it, an entry with an incomplete photo omits it, and an entry without a photo still validates.
  - _Demo:_ run `python -m pipelines.identity.run` (directory step) and show a validated `people.json`.
  - _Requirements: 1.1, 1.4, 4.1, 7_
- [x] 3. Implement name normalization and blocking
  - Implement `pipelines/identity/normalize_names.py`: lowercase, strip accents and punctuation, and handle initials. Blocking key = normalized last name + first initial. The normalization must help surface the known data-quality cases in `research.json` (e.g. the typo "Francine Parftt") and name variants.
  - _Test:_ fixtures covering accented names, initials-only names, and the known typo; assert the expected blocking keys are produced.
  - _Demo:_ feed a handful of real `research.json` names through and show which ones get grouped into the same block.
  - _Requirements: 3.1_
- [x] 4. Implement signal scoring and the decision rules
  - Implement `pipelines/identity/match.py` to score candidate pairs (canonical people vs `research.json` persons, limited by the blocking step) on the schema signal enum, then apply the `design.md` decision table: ORCID equal → `merged`/`high`; exact name + two or more corroborating signals → `merged`/`medium`; exact name + one corroborating signal → `candidate`/`medium`; name variant only or name only → `candidate`/`low`; ORCID conflict → `rejected`/`high`.
  - Enforce the invariant that a `merged` match is never `low` confidence. Write `data/modules/identity_matches.json` sorted by `canonical_id`, conforming to `schema/identity_matches.schema.json`.
  - _Test:_ the four required cases — ORCID merge, name-only candidate, rejection on ORCID conflict, and low-confidence matches never merged.
  - _Demo:_ run matching of the curated people against `research.json` and show a schema-valid `identity_matches.json` with at least one high-confidence ORCID merge.
  - _Requirements: 3.2, 3.3, 4.2_
- [x] 5. Implement manual review overrides
  - Load `data/curation/reviews.yaml` in `match.py` so a manual decision replaces the automated result for the referenced members, and fill in the match's `reviewed` field with the reviewer (`by`) and date (`at`).
  - _Test:_ a fixture review decision that flips an automated `candidate` to `rejected` (and one that promotes to `merged`); assert the automated result is overridden and `reviewed.by`/`reviewed.at` are recorded.
  - _Demo:_ run matching with a `reviews.yaml` entry present and show the overridden match carrying the reviewer and date.
  - _Requirements: 3.4_
- [x] 6. Run matching against a mock innovation batch end-to-end, then review candidate matches by hand (swap in P3's real batch when available)
  - [x] 6.1 Add a clearly-labeled mock `innovation.json` stand-in
    - Create a small mock innovation graph file using fictional names and `example.org`/`example.com`/`example.edu` URLs, labeled as mock (e.g. under `data/mock/` or an equivalently non-real location), containing a couple of person records: one engineered to ORCID-merge with a curated person, and one that should not match.
    - The mock must never be written into or mixed with real module outputs under `data/modules/`.
    - _Test:_ assert the mock file is schema-valid and that its records never appear in a real module output.
    - _Requirements: 3_
  - [x] 6.2 Run matching across research + mock innovation and review candidates by hand
    - Run the full matching step over both `research.json` and the mock `innovation.json`. Confirm the planted merge resolves to `merged`/`high` and the planted non-match does not merge. Then review every `candidate` match by hand, recording decisions in `reviews.yaml`.
    - When P3's real `data/modules/innovation.json` arrives, drop it in place of the mock and re-run — no code change required.
    - _Test:_ assert the planted merge and non-merge resolve correctly, and that the mock is never mixed into real output.
    - _Demo:_ run the full matching step over both sources and show the resulting matches, proving the pipeline is ready to swap in P3's real `innovation.json` with no code change.
    - _Requirements: 3, 6.2_
- [x] 7. Implement and run the merge step (see shared-data-contract task 6)
  - _Requirements: 5, 6.1_
- [x] 8. Write tests: ORCID merge, name-only candidate, rejection on ORCID conflict, low-confidence matches never merged
  - _Requirements: 3, 6_
- [x] 9. Source photos for curated people
  - For each person in `data/curation/people.yaml`, check Wikidata P18 / Wikimedia Commons for an openly licensed photo and record its license and attribution.
  - Otherwise leave the photo out (optionally note who to ask for a user-submitted or permissioned photo). Never scrape.
  - _Test:_ lint check in `tests/identity/test_curation_lint.py` that any `photo` block has all required fields and an allowed `source`.
  - _Requirements: 7_
