---
inclusion: always
---

# Data Integrity Rules

These rules apply to every module, script, and UI component. When a rule conflicts with a feature request, the rule wins. Flag the conflict instead of working around it.

## Core rules

1. Every node has a stable, unique ID (see `data-contract.md`).
2. Every edge references node IDs that exist.
3. Every node has at least one source record, and every edge has at least one evidence record. Each source or evidence record has a URL.
4. Identity confidence and relationship evidence are separate concepts:
   - `evidence` answers "which record says this relationship exists?"
   - `confidence` answers "how sure are we that this relationship holds?" For `SAME_AS_CANDIDATE` edges, it answers "how sure are we that these two records are the same person?"
5. Source records keep their original IDs and URLs.
6. **Missing data is allowed. Inventing data is not.** Leave a field out rather than guess it. This applies to degrees, graduation years, employers, and similar facts.
7. No module creates its own graph format. Emit the shared format directly, or write an adapter that converts to it.

## BU affiliation status

| Status | Meaning | Required evidence |
|---|---|---|
| `verified_alumnus` | A source explicitly states a BU degree | At least one source stating the degree (BU repository, institutional bio, commencement record, or a user-submitted profile backed by a public URL) |
| `bu_affiliated_researcher` | Worked or published at BU; alumni status not confirmed | At least one source showing the BU affiliation (for example, an OpenAlex authorship institution) |
| `unverified` | Linked to BU-related work, but no affiliation evidence yet | None |
| `ambiguous` | Conflicting or insufficient evidence; possible identity confusion | Signals recorded in `identity_matches.json` |

Never promote a person to `verified_alumnus` because they published from a BU address.

## Confidence rubric

- `high`: stated directly by a source record (for example, an author listed on a paper), or an identity match on a unique identifier such as ORCID.
- `medium`: derived from documented records with at least two independent corroborating signals.
- `low`: plausible but weakly supported. Show it in the UI as flagged. Never merge identities at `low`.

## Professional profiles and personal data

- Store only public, professional information. Do not store personal email addresses, phone numbers, home addresses, or photos.
- LinkedIn is a discovery and attribution source only. Store profile URLs that were obtained through permitted means: manually found public URLs, user-submitted URLs, or official APIs. Never automate access that bypasses login, rate limits, or anti-bot protections.
- User-submitted and manually curated facts must record who supplied them (`source: user_submitted` or `manual_curation`) and include a public URL as evidence.

## Example data

Mock or sample data must use fictional names and `example.org`, `example.com`, or `example.edu` URLs, and must be labeled as mock. Never mix fictional records into real module outputs.
