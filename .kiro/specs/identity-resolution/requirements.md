# Requirements: Alumni Discovery and Identity Resolution

**Owner:** P2 · **Outputs:** `data/modules/people.json`, `data/modules/identity_matches.json`, and `data/graph.json` (via the merge step) · **Status:** Draft

## Introduction

This module establishes who each person is and how their BU connection is supported. It builds the curated person directory, resolves duplicate records across modules, and assigns BU affiliation statuses. It owns identity resolution across the whole system.

## Requirements

### Requirement 1: Curated person directory

**User story:** As a student, I want to know whether someone is actually a BU alumnus, so that I can trust the network I'm exploring.

1. THE module SHALL build person records from BU repository records, institutional biographies, and public professional pages.
2. THE module SHALL accept manually curated entries and user-submitted profile URLs from a curation file (`data/curation/people.yaml`). Each entry SHALL include a public evidence URL and a value of `source: manual_curation` or `user_submitted`.
3. THE module SHALL include a BU degree, department, graduation year, or current organization ONLY WHEN a referenced source states it.
4. THE module SHALL emit canonical person nodes (`person:canonical:*`) in `people.json`.

### Requirement 2: Professional profiles (LinkedIn)

1. THE module SHALL store LinkedIn or other professional profile URLs only when they are obtained through permitted means: manual discovery of public URLs, user submission, or official APIs.
2. THE module SHALL NOT scrape private data, bypass authentication, or evade rate limits.
3. WHEN no profile data is available, THE graph SHALL still be complete and usable.

### Requirement 3: Duplicate detection

1. THE module SHALL compare source-level persons from `research.json` and `innovation.json` with the canonical directory, using these signals: ORCID, exact name, name variants, shared affiliation, shared coauthors, shared topics, and institutional bio links.
2. WHEN the match rules in `design.md` are satisfied, THE module SHALL record a `merged` match. Otherwise, it SHALL record a `candidate` match or no match.
3. THE module SHALL NOT merge records at `low` confidence.
4. WHEN a manual review decision exists, THE decision SHALL override the automated result, and THE match SHALL record the reviewer and date.

### Requirement 4: Affiliation status

1. THE module SHALL label each canonical person as `verified_alumnus`, `bu_affiliated_researcher`, `unverified`, or `ambiguous`, following `.kiro/steering/data-integrity.md`.
2. IF the evidence for a person conflicts, THEN THE status SHALL be `ambiguous`.

### Requirement 5: Merge ownership

1. THE module owner SHALL implement and run the merge step defined in `.kiro/specs/shared-data-contract/` (Requirement 8).

### Requirement 6: Definition of done

1. WHEN a person has multiple source records, THE merged graph SHALL contain exactly one node for that person.
2. WHEN a match is uncertain, THE graph SHALL show it as a `SAME_AS_CANDIDATE` edge that the UI flags visibly, not as a silent merge.
3. Both output files SHALL pass validation.
