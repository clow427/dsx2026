# Design: Alumni Discovery and Identity Resolution

Contracts:

#[[file:schema/graph.schema.json]]

#[[file:schema/identity_matches.schema.json]]

## Layout (planned)

```
data/curation/people.yaml       # hand-curated people and user submissions (public facts + evidence URLs)
data/curation/reviews.yaml      # manual match decisions (merge / candidate / reject), with reviewer and date
pipelines/identity/
  directory.py   # curation file + bios → canonical person nodes (people.json)
  normalize_names.py
  match.py       # blocking + signal scoring → identity_matches.json
  run.py         # python -m pipelines.identity.run
pipelines/merge/
  run.py         # python -m pipelines.merge.run → data/graph.json
tests/identity/
```

## Curation file shape (proposed)

```yaml
- slug: jane-doe-bme            # becomes person:canonical:jane-doe-bme
  name: Jane Doe
  orcid: 0000-0000-0000-0000    # optional
  bu:
    status: verified_alumnus
    degree: PhD                 # only if stated by evidence
    department: Biomedical Engineering
    graduation_year: 2012
    evidence:
      - { source: institutional_bio, url: "https://..." }
  profiles:
    - { source: professional_profile, url: "https://www.linkedin.com/in/...", note: "user-submitted" }
  submitted_by: manual_curation   # or user_submitted
```

## Matching pipeline

1. **Blocking.** Group candidate records by normalized last name plus first initial.
2. **Signals.** Score each pair on the signals listed in the schema's signal enum.
3. **Decision rules** (proposed; tune at review):

| Signals | Status | Confidence |
|---|---|---|
| ORCID equal | merged | high |
| Exact name, plus two or more of: shared affiliation, shared coauthor, bio link | merged | medium |
| Exact name, plus one corroborating signal | candidate | medium |
| Name variant only, or name only | candidate | low |
| ORCID conflict | rejected | high |

4. **Overrides.** A decision in `reviews.yaml` replaces the automated result and fills in the `reviewed` field.
5. **Output.** Write `identity_matches.json`, sorted by `canonical_id`.

Unmatched source-level persons pass through the merge unchanged and keep their source-level status.

## Privacy

Store public, professional information only. Never store contact details. When a fact's evidence URL is removed or disputed, drop the fact.
