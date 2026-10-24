# How we used Kiro

This is the write-up for the Hackachusetts submission. Everything Kiro reads lives in [`.kiro/`](../.kiro/) at the repo root, and the team's own power lives in [`powers/`](../powers/). Each claim below names the file, test, or command that backs it.

**Summary.** Kiro worked from a contract-first plan: five specs and eight steering files guided the agent, five hooks automated checks, and one custom power packaged our conventions. Property-based tests derived from the spec found a real ID-validation bug that 81 example tests had missed. The fix landed before any other module depended on the broken behavior.

## 1. Which Kiro tools we used

| Surface | How |
|---|---|
| **Kiro CLI** (`kiro-cli` 2.34.0) | Our main tool. Interactive chat for the research pipeline, validator, tests, and these docs. **Headless** (`kiro-cli chat --no-interactive --trust-workspace`) to test our hooks and power from a clean session (section 3). Also `kiro-cli powers install` |
| CLI subagents | `context-gatherer` to explore the codebase. `introspect` to read kiro.dev docs, which is how we learned how spec PBT generation and file-save hooks differ between the IDE and the CLI |

**How the surfaces differed for us.** The CLI and the IDE read the same `.kiro/` folder, but two features differ:

- **Spec correctness properties / PBT generation** is an IDE feature. In the CLI we wrote the "Correctness properties" tables in each `design.md` ourselves, plus the PBT tasks in `tasks.md`, and then had Kiro implement them with Hypothesis. That is the same workflow the IDE automates.
- **File triggers** (`PostFileSave`, `PostFileCreate`) are documented for the IDE and CLI V3. We put the same data check into a `Stop` hook, which runs in our CLI build (section 3). The save hook is also in the repo for IDE users.

## 2. Spec-driven development

**Structure.** Each of the five specs has `requirements.md` (EARS: "WHEN … THE pipeline SHALL …"), then `design.md`, then `tasks.md`. There is one spec per owner, plus a shared contract that the other four depend on:

```
shared-data-contract   P2 leads, all sign off   schema, IDs, validator, merge      ← everything depends on this
research-graph         P1                        OpenAlex + Semantic Scholar        ✔ 10/10 tasks
identity-resolution    P2                        curation, matching, merge
innovation-funding     P3                        PatentsView, NIH/NSF
frontend-explorer      P4                        search, graph, evidence panels
```

Decisions that kept Kiro on track:

- **The machine-readable contract is inlined into the specs.** `#[[file:schema/graph.schema.json]]` appears in the contract and research designs and in the `data-contract` steering file, so Kiro always sees the exact JSON Schema. It can't drift into its own graph format.
- **Every task cites requirement numbers** (`_Requirements: 2.3, 2.4_`), and so do the commits: `fix(research): skip works with no identified authors (Req 5.1)` and `feat(research): keep every matching work by default (Req 1.2 updated)`. Reviewers can trace a diff to the sentence that justifies it.
- **Requirement changes travel with the code.** When the 100–200 work cap turned out to be unnecessary (578 matching works compress to under 1 MB), Req 1.2 was rewritten with a dated note in the same commit as the code and tests (`2dff8cd`), so the spec never lagged the implementation. See [`research-graph/requirements.md`](../.kiro/specs/research-graph/requirements.md).
- **Design records the risks and fallbacks.** Examples: S2 throttling, so each batch is cached separately, and a hairball graph, so there is an author cap. Kiro implemented each one when it reached the task, without being reminded.

**What the spec-driven research pipeline produced:**

| | Research pipeline (Kiro, spec-driven) |
|---|---|
| Data | 5,989 nodes and 31,525 edges from OpenAlex and S2, in `data/modules/research.json` |
| Provenance | Every node and edge has a source URL and record ID, and the validator enforces it |
| BU status | `bu_affiliated_researcher` only with authorship evidence. Never `verified_alumnus` (property R3) |
| Contract | Passes `validate_graph.py` with 0 errors and 0 warnings |

The spec produced data a judge can click through to a real source.

## 3. Agent hooks

All hooks use the v1 JSON format in [`.kiro/hooks/`](../.kiro/hooks/). Command hooks call small Python scripts in [`scripts/hooks/`](../scripts/hooks/), which have their own tests in `tests/hooks/` (22 tests). The hook logic is reviewed and tested like any other code.

| Hook | Trigger | What it automates | Verified |
|---|---|---|---|
| `spec-status-on-start` | `SessionStart` | Puts the branch and every spec's open tasks into context, so a new session starts knowing the plan | ✔ Headless session quoted "Spec status (branch: docs/kiro-usage)…" |
| `guard-shell` | `PreToolUse` (`shell`) | **Blocks** (exit 2) automated LinkedIn fetches and `git add .env*`. **Asks** before `push --force` and `commit --no-verify`. This turns the data-integrity rules into enforcement | ✔ Headless agent ran `git add .env`; the hook blocked it, and the agent reported the reason and didn't retry |
| `quality-gate-on-stop` | `Stop` | Validates changed `data/**/*.json`, and runs the fast test suite with the Hypothesis `hook` profile if Python changed. On failure it returns `{"decision":"block"}`, so the agent keeps working. Each distinct failure blocks only once, so it can't loop | ✔ A headless agent wrote a broken graph; the gate reported 3 validator errors and forced another turn |
| `spec-task-follow-through` | `PostTaskExec` (agent prompt) | After a spec task: check it off, validate outputs, confirm its correctness property has a passing test, cite requirements in the commit, and log it here | Configured in `.kiro/hooks/` |
| `validate-graph-data` | `PostFileSave` (`data/**/*.json`) | Runs the validator on every graph file (about 4 s for 20 MB) | ✔ Command verified. The Stop gate runs the same check in the CLI |

**Effect on our process.** The validator and tests run without anyone remembering to run them, and the two rules that could embarrass us in a demo (scraping LinkedIn, leaking API keys) are enforced, not just written down. During the Stop-gate test, the gate told the agent to fix the broken file. It declined to invent nodes or evidence records, and cited the data-integrity steering. The hook and the steering reinforced each other.

## 4. Steering docs

Eight files in [`.kiro/steering/`](../.kiro/steering/), using all three inclusion modes:

| File | Inclusion | Purpose |
|---|---|---|
| `product.md` | always | Demo journey, definition of done, out-of-scope list (no scraping, no LLM-made edges) |
| `data-integrity.md` | always | **"When a rule conflicts with a feature request, the rule wins. Flag the conflict."** Also the BU status table and confidence rubric |
| `data-contract.md` | always | `#[[file:schema/graph.schema.json]]` plus the ID and edge-type cheat sheet |
| `architecture.md` | always | Module ownership, file outputs, integration rules |
| `python-pipelines.md` | fileMatch `pipelines/**` | Fetch → cache → normalize → emit, polite APIs, pinned deps, no fabricated fields |
| `frontend.md` | fileMatch `frontend/**` | Load data from one source, show uncertainty, never hardcode records |
| `testing.md` | fileMatch `tests/**`, `pipelines/**`, `scripts/**` | When to write a property instead of an example, oracle style, boundary-character generators, Hypothesis profiles |
| `kiro-usage-log.md` | auto (`name`, `description`) | Loads only when we're finishing a task or preparing a PR, and asks for a row in the log below |

**The strategy that made the biggest difference** was writing steering as *rules that win, with a required escalation*, rather than as style advice. Telling Kiro to "flag the conflict instead of working around it", combined with "missing data is allowed; inventing data is not", changed its behavior in ways we could check:

- The research pipeline leaves out unknown attributes instead of guessing them (`test_missing_values_are_omitted_not_guessed`).
- It never emits `verified_alumnus` from a BU publishing address. Property R3 checks this on 100 generated inputs per run (1,000 with the `ci` profile).
- When asked to make an invalid file pass, it declined to fabricate evidence (section 3).

The second most useful technique was inlining the schema with `#[[file:…]]`. Every emitted file passes the schema's `additionalProperties: false` checks. Scoping the language-specific rules with `fileMatch` kept the always-on context small.

## 5. Web lookups and reproducibility

Our core requirement is that every fact is reproducible from cached raw API responses (`data/raw/`), and that a rerun is byte-identical (`test_research_output.py`).

What we used:

- **Built-in web search and fetch** to look up BU's OpenAlex institution ID, its ROR ID, and the demo topic IDs against the live APIs. The lookup URLs are recorded in [`pipelines/research/config.py`](../pipelines/research/config.py), so the IDs aren't guessed. We also used them to read kiro.dev docs.
- **A power** (section 7) that packages workflow knowledge rather than tools.

## 6. Property-based testing

The spec designs list correctness properties with IDs, and Hypothesis tests implement them. Each test docstring cites its property and requirement:

- [`tests/contract/test_contract_properties.py`](../tests/contract/test_contract_properties.py): **C1–C12** for ID builders, provenance merging, `GraphBuilder`, and validator teeth.
- [`tests/research/test_normalize_properties.py`](../tests/research/test_normalize_properties.py): **R1–R6** for normalization and S2 enrichment, each checked against an oracle computed straight from the generated input.
- `tests/hooks/test_hook_scripts.py`: **H1**. Any `.env` file among `git add` paths is blocked.

**Requirements we used PBT for:** anything phrased "every", "never", "iff", or "exactly":

- Every edge endpoint exists, and IDs fully match the pattern.
- Evidence is *exactly* the supporting records.
- `bu_affiliated_researcher` **iff** there is BU authorship evidence, and never `verified_alumnus` from a publication.
- Coauthor edges **iff** a shared work is under the author cap.
- Enrichment never adds nodes or edges.
- Output is deterministic and independent of insertion order.

**What PBT caught that unit tests missed.** On the first run, C2 and C12 failed with the falsifying inputs `local_id='0\n'` and `suffix='\n'`:

- `make_node_id`, `parse_node_id`, and the validator all accepted IDs ending in a newline, because Python's `$` matches before a trailing `\n`, and `re.match` and jsonschema's `pattern` both rely on it.
- The frontend's JavaScript regex would *reject* those IDs, so a node could pass validation and then fail to render or link.
- The 81 example tests never tried a trailing newline.
- The fix: use `fullmatch` in [`pipelines/common/ids.py`](../pipelines/common/ids.py), add an explicit full-match check in the validator, keep the shrunk input as `@example("0\n")`, and add plain regression tests. The changelog entry is in the [contract design](../.kiro/specs/shared-data-contract/design.md).

PBT also exposed a crash in the test tooling: Hypothesis 6.170.9's `unique_by=lambda k: f(*k)` crashes while regex-parsing the lambda's source. The workaround is recorded in `testing.md` steering.

**Do the properties have teeth?** We ran four hand-made mutants of `normalize.py`: an off-by-one author cap, `verified_alumnus` instead of `bu_affiliated_researcher`, duplicate authorships counted twice, and blank titles kept. The properties caught **all four**. The suite passes with the `ci` profile (1,000 examples per property).

## 7. Kiro powers

**Our own power: [`powers/alumni-graph-contract/`](../powers/alumni-graph-contract/)** (Agent Plugins format: `plugin.json` plus `skills/`). It bundles the team's hard-won practice so that P2 and P3 start where P1 finished:

- `new-pipeline-module`: the fetch → cache → normalize → emit layout, which shared helpers to use, and the BU-status rules.
- `graph-property-tests`: turn a spec's properties into Hypothesis tests, including oracles, boundary characters, mutation checks, and recording falsifying examples.
- `audit-graph-evidence`: validate, summarize, spot-check about 10 records against their source URLs, and log the result.

Installed with `kiro-cli powers install ./powers/alumni-graph-contract`. A fresh headless session confirmed that the power and its three skills were available. Its keywords ("pipeline module", "provenance", "property-based test", …) load it only when relevant, which keeps unrelated sessions lean.

**Third-party tool Kiro helped us adopt:** **Hypothesis**. The spec-to-property workflow (section 6) is how it entered the project.

## Reproduce

```bash
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r pipelines/requirements.txt
.venv/bin/python -m pytest                                   # 125 tests, including 20 properties
HYPOTHESIS_PROFILE=ci .venv/bin/python -m pytest              # 1,000 examples per property
kiro-cli powers install ./powers/alumni-graph-contract
kiro-cli chat --no-interactive --trust-workspace --trust-tools=execute_bash "Run: git add .env"   # guard-shell blocks it
```

## Kiro usage log

One row per meaningful use. The `kiro-usage-log` steering file and the `spec-task-follow-through` hook prompt for new rows.

| Who | Task | Kiro feature | Outcome |
|---|---|---|---|
| Team | Project scaffolding | Specs, steering, hook | The brainstorm became five specs, the JSON Schema contract, mock data, steering, and a validation hook |
| P1 | research-graph 1–9, shared-data-contract 3–5 | Spec tasks, steering, web lookups | Looked up BU OpenAlex/ROR and topic IDs live. Built fetch → normalize → S2 → validate. `research.json` (573 works, 4,147 people at the time) and 81 tests; spot-checked 10 works against OpenAlex |
| P1 | research-graph Req 1.2 change | Spec kept in sync | Dropped the work cap in requirements.md (dated note) in the same commit as the code; `2dff8cd` |
| P1 | shared-data-contract 5.5, research-graph 8.5 | PBT from spec properties | 20 Hypothesis properties. **Found the trailing-newline ID bug** (`'0\n'`), fixed in ids.py and the validator. 4/4 mutants caught |
| P1 | Hook automation | Hooks (PreToolUse, Stop, SessionStart, PostTaskExec) | Guard, quality gate, and spec-status hooks plus 22 tests. Verified in headless sessions |
| P1 | Team power | Powers | `alumni-graph-contract` power with three skills, installed and confirmed loading |
