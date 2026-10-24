# Requirements: Innovation and Funding (PatentsView + NIH / NSF)

**Owner:** P3 · **Output:** `data/modules/innovation.json` · **Status:** Draft

## Introduction

This module builds the invention and research-funding network: patents, inventors, assignee organizations, and (as a stretch goal) NIH RePORTER or NSF awards. It must clearly distinguish documented relationships from speculative ones.

## Requirements

### Requirement 1: Patents and inventors

**User story:** As a student, I want to see what BU-linked researchers have invented and which organizations hold those patents, so that I can find industry connections.

1. THE pipeline SHALL fetch patent and inventor records from USPTO PatentsView, scoped to the demo topic. Scoping uses CPC codes or keywords, and BU-related inventors or assignees.
2. THE pipeline SHALL emit `patent` nodes, source-level `person` nodes (`person:patentsview:*`), and `organization` nodes, with `INVENTED` and `ASSIGNED_TO` edges.
3. THE pipeline SHALL keep the patent number, the PatentsView record IDs, and the source URLs on every node and edge.
4. THE pipeline SHALL cache raw responses under `data/raw/innovation/` and read API keys from environment variables only.

### Requirement 2: Awards (stretch goal)

1. WHERE NIH RePORTER or NSF award data is accessible within the build window, THE pipeline SHALL emit `award` nodes and the `RECEIVED_AWARD` (PI → award) and `FUNDED_BY` (publication → award, award → funder organization) edges.
2. THE award nodes SHALL keep the award number, agency, fiscal year, and source URL.

### Requirement 3: Documented vs. speculative links

1. THE pipeline SHALL connect an inventor or PI to a person from another module ONLY through the identity module's matches. The pipeline itself SHALL NOT emit cross-module person links.
2. THE pipeline SHALL set `bu_affiliation.status` to `bu_affiliated_researcher` only when the patent or award record lists a BU affiliation. Otherwise the status SHALL be `unverified`.
3. Every edge SHALL carry `confidence` and `derivation`, so the UI can distinguish documented edges from inferred ones.

### Requirement 4: Definition of done

1. WHEN a user clicks an inventor or a patent, THE data SHALL be sufficient to show the real record and a link to it.
2. The file `data/modules/innovation.json` SHALL pass the validator.
