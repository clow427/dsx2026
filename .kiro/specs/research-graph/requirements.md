# Requirements: Research Graph (OpenAlex + Semantic Scholar)

**Owner:** P1 · **Output:** `data/modules/research.json` · **Status:** Draft

## Introduction

This module builds the academic research network: BU-related publications, their authors, institutions, topics, and documented coauthor relationships. Every record must come from OpenAlex, optionally enriched by Semantic Scholar, and keep its real source URL.

## Requirements

### Requirement 1: Scoped fetch from OpenAlex

**User story:** As a student exploring AI in healthcare, I want relevant BU-linked papers, so that the graph shows real research I can follow.

1. THE pipeline SHALL fetch works where at least one authorship institution is Boston University, filtered by the configured demo topic or topics and date range.
2. THE pipeline SHALL cap the dataset at a configurable size (proposed: 100 to 200 works). Reliability takes priority over volume.
3. THE pipeline SHALL cache raw responses under `data/raw/research/` and reuse them on reruns.
4. THE pipeline SHALL respect OpenAlex usage guidelines, including a contact email, polite rate limiting, and cursor-based paging.

### Requirement 2: Normalization to the contract

1. THE pipeline SHALL emit `publication`, `person` (source-level, `person:openalex:*`), `organization`, and `topic` nodes, with `AUTHORED`, `AFFILIATED_WITH`, and `HAS_TOPIC` edges.
2. Every node and edge SHALL carry its OpenAlex `record_id` and URL as a source or as evidence.
3. WHEN an authorship lists BU as an institution, THE author's `bu_affiliation.status` SHALL be `bu_affiliated_researcher`, with that work as evidence. THE pipeline SHALL NOT set `verified_alumnus`.
4. WHEN an author has no BU authorship in the dataset, THE status SHALL be `unverified`.

### Requirement 3: Coauthor edges

1. WHEN two persons both have an `AUTHORED` edge to the same publication, THE pipeline SHALL emit one `COAUTHORED_WITH` edge between them, with derivation `derived` and every shared publication as evidence.
2. THE pipeline SHALL limit coauthor edges for works with very many authors (proposed: skip works with more than 25 authors) to avoid hairball graphs.

### Requirement 4: Semantic Scholar enrichment (optional)

1. WHERE Semantic Scholar is accessible, THE pipeline SHALL add abstracts, citation counts, or author details to existing nodes, matching on DOI.
2. THE enrichment SHALL add a `semantic_scholar` source reference, and SHALL NOT create new people or edges without a DOI match.

### Requirement 5: Definition of done

1. WHEN a user clicks a paper in the app, THE data SHALL be sufficient to show its authors, its source link, and its connections to other records.
2. THE file `data/modules/research.json` SHALL pass the validator.
