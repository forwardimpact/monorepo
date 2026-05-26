# Spec 0800 — Landmark Evidence Pipeline

## Problem

Landmark's evidence-based and manager-scoped views (`readiness`, `evidence`,
`health --manager`, `voice --manager`, `snapshot trend --manager`) either return
empty states or produce unscoped results against every known dataset — synthetic
and real alike. There are two independent root causes:

**1. Synthetic data gaps and a broken manager-scoping chain make Landmark
untestable and its manager-scoped features non-functional.**
A Landmark deep-test against BioNova synthetic data (211 engineers, 7 GetDX
snapshots, 12 820 GitHub events, 312 evidence records) revealed two gaps where
generated data and existing query logic do not match what Landmark needs. Web API
research against the real GetDX API confirmed that one of the gaps is not a
data-generation problem but a broken data chain: the manager-scoping logic
depends on `getdx_teams.manager_email`, which the GetDX `teams.list` API never
populates, leaving the column always null.

**2. The Guide evaluation pipeline described in
[spec 0080](../080-landmark-product/spec.md) was never built.**
Spec 0080 specified that Guide interprets GitHub artifacts against skill markers
and writes rows to `activity.evidence`. That pipeline does not exist. Guide is
conversational-only; `activity.evidence` is populated exclusively by the terrain
seed with `rationale: "synthetic"` as a placeholder. Every installation —
including production — has zero real evidence, and Landmark's core value
proposition (growth visible in work, not only in role) cannot be delivered.

Both root causes must be resolved together because the synthetic data fixes are
the test harness for the Guide pipeline: until synthetic data correctly exercises
all Landmark commands, there is no reliable way to verify that Guide-written
evidence produces correct output in those commands.

This spec also removes the initiative and scorecard feature from Landmark. Web
API research shows that GetDX initiatives reference software catalog scorecards
(SQL-checked quality levels for catalog entities — Bronze/Silver/Gold), not
snapshot factors. The `initiative impact` view assumes `scorecard_id` can be
joined to snapshot factor scores; this join has no basis in the GetDX data model
and always produces null deltas. The feature requires a new design before it can
be useful; that belongs in a separate spec.

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Empowered Engineers | Find Growth Areas — check whether recent work shows visible progress toward the next level ([JTBD.md](../../JTBD.md)) | `readiness` and `evidence` return empty states; engineers cannot see whether their artifacts demonstrate marker progress |
| Engineering Leaders | Measure Engineering Outcomes — demonstrate engineering progress without making individuals feel surveilled ([JTBD.md](../../JTBD.md)) | `health --manager` returns all-org data; `voice --manager` returns nothing; leaders cannot scope analysis to their teams |

---

## Part 1 — Data and Design Gaps

### Gap 1 — Manager-scoped views depend on a data chain that is never populated

`voice --manager`, `health --manager`, and `snapshot trend --manager` all scope
their results through a chain: commenter email → `organization_people.manager_email`
→ `getdx_teams.manager_email` → `getdx_team_id`. The DB columns exist and the
logic is correct, but the chain breaks at `getdx_teams.manager_email`. The
transform that populates `getdx_teams` resolves `manager_email` via a
`team.manager_name` field from the GetDX `teams.list` response — but that field
does not exist in the API. The API returns `manager_id` (an opaque user
identifier); `manager_name` is absent. Because `team.manager_name` is always
undefined, `manager_email` is always null, which cascades to `team_id` on
comments being null, and all manager-filtered queries returning empty or unscoped
results.

Separately, the real `snapshots.driverComments.list` endpoint returns a
`driver_name` field per comment that the current DB schema and transform
pipeline do not capture. This means driver-level filtering and display of comment
context are unavailable. Capturing `driver_name` is in scope.

The fix has two parts:

- **Manager-scoping:** Manager-filtered views must derive their scope from
  `organization_people`, which carries accurate `manager_email` from the roster
  and is not subject to the GetDX API gap. Each manager-filtered view must return
  results limited to the manager's direct reports as recorded in the roster. The
  specific query strategy is a design decision.

- **Synthetic data:** The terrain generates `organization_people` rows; these
  must carry accurate `manager_email` values so the corrected query logic
  produces scoped results during testing.

### Gap 2 — No `markers:` blocks in generated pathway capability YAML

`readiness`, `evidence`, and `fit-landmark marker <skill>` require `markers`
arrays under each skill proficiency in the capability YAML. The synthetic data
pipeline generates `proficiencyDescriptions`, `readChecklist`, and
`confirmChecklist` but no `markers` blocks. All three commands return empty
states regardless of evidence volume.

The generated capability entities must include representative `markers` arrays so
that Landmark's evidence-based commands have criteria to evaluate against.

Marker definitions are installation-specific by design (spec 0080,
§Starter Data Philosophy). The synthetic data must include at least
representative markers for the skills it generates evidence for — sufficient to
exercise the Landmark commands, not exhaustive.

### Initiative and scorecard feature removal

The `initiative list`, `initiative show`, and `initiative impact` commands must
be removed from Landmark. GetDX initiatives reference software catalog
scorecards — a distinct GetDX product area where SQL checks evaluate whether
catalog entities (services, repositories) meet quality levels (Bronze/Silver/Gold).
This is unrelated to snapshot factor scores. The `initiative impact` view joins
`initiative.scorecard_id` against snapshot score `item_id`s; these are different
ID spaces that will never match, so the computed delta is always null.

The correct model for initiative impact — if the feature is to be built — is a
new design decision. It is excluded from this spec.

---

## Part 2 — Guide Activity Marker Evaluation Pipeline

### What to build

A batch evaluation capability that allows Guide to interpret activity artifacts
against skill markers from the engineering standard, writing structured evidence
rows to `activity.evidence` that Landmark can present.

This is the pipeline spec 0080 described but did not implement:

```
Activity artifacts → Map (activity tables)
                            │
                     Guide evaluates
                     (grounded in engineering standard)
                            │
                     activity.evidence
                            │
                     Landmark presents
```

### Activity source abstraction

Activity data in Map is not homogeneous. Today it includes GitHub artifacts (pull
requests, code reviews, pushes). Anticipated future sources include GitHub
Copilot activity and Claude Code activity. Each source type has different
structure, different signal density, and different relevance to skill markers —
for example, a pull request carries a title, description, diff context, and
review thread, while a Copilot activity record carries completion-level telemetry.
An evaluation function written for one source type cannot be applied to another
without either producing incorrect matches or requiring the function to know about
every source type that will ever exist.

The evaluation pipeline must support multiple activity source types. Adding a new
source type must not require modifying the evaluation logic or the evidence write
path. This spec ships evaluation for GitHub artifacts only. Future source types
(Copilot, Claude Code) must be addable without changes to evaluation or output.

### Engineering standard grounding

Guide must never free-associate markers. Every evidence row it writes must cite a
`skill_id` and `marker_text` that exist verbatim in the organization's
engineering standard. The authoritative source for that standard is the pathway
data (capability YAML files), which defines skills, proficiency levels, and the
`markers` array under each proficiency.

Before evaluating any artifact, Guide must load the markers defined for the
relevant engineer's discipline, level, and track from the standard. Only markers
retrieved from that load may appear in evidence rows.

The current engineering standard access layer does not expose a method that
returns markers for a given engineer profile. Adding that capability is in scope
for this spec. The capability must accept a `(discipline, level, track)` profile
and return the markers the engineer is expected to demonstrate. Which layer
exposes this, what the interface looks like, and how it is implemented are design
decisions.

### Batch scope

Evaluation must be triggerable over a defined scope:

| Scope | Description |
|---|---|
| Person | All unscored artifacts for one engineer |
| Team | All unscored artifacts for a manager's direct reports |
| Organisation | All unscored artifacts across the whole roster |

The query that identifies unscored artifacts (artifacts with no corresponding
evidence rows) already exists in Map's activity query layer. It currently
supports person-scoped retrieval only. Team-scoped and org-scoped retrieval are
not supported and must be added as part of this spec.

Evaluation must also be schedulable for continuous delivery — runnable on a
recurring cadence without manual invocation — so that new artifacts are evaluated
as they arrive without operator intervention. The mechanism for scheduling is a
design decision.

Evaluation is idempotent: an artifact that already has evidence rows is not
re-evaluated, so running evaluation twice over the same scope produces no
duplicate rows.

### Evidence output contract

Each evaluated artifact produces one or more evidence rows. Guide must honour the
`activity.evidence` schema:

| Column | Requirement | Meaning |
|---|---|---|
| `artifact_id` | FK to `github_artifacts`, required | The artifact that was evaluated |
| `skill_id` | From engineering standard, required | Skill the marker belongs to |
| `level_id` | From engineering standard, required | Proficiency level the marker targets |
| `marker_text` | Verbatim from engineering standard, required | Marker text exactly as defined |
| `matched` | Boolean, required | Whether the artifact demonstrates the marker |
| `rationale` | Non-null, required | Guide's reasoning (one to three sentences) |

Guide must always provide `rationale` and `level_id`; rows written without them
are invalid. Whether enforcing this requires schema changes is a design decision.

`matched: false` rows are valid and must be written. They document what was
checked and not found. Landmark uses `matched: false` rows in two ways: in
coverage calculations (any evidence row, regardless of match, counts the artifact
as interpreted) and in `evidence` command output (displayed as unmatched items
alongside matched ones). They do not contribute positively to `readiness`
checklists, which only count `matched: true` rows against marker criteria.

### What is excluded from this spec

| Exclusion | Reason |
|---|---|
| Additional source types (Copilot, Claude Code) | Future specs; multi-source requirement defined here |
| GetDX survey evaluation | Unauditable — cannot be traced to a verifiable artifact |
| GetDX initiative and scorecard features | Requires new design; scorecard IDs and snapshot factor IDs are different namespaces |
| Changes to Landmark presentation layer | Already ships per spec 0080 |
| `activity.evidence` column additions | Schema is correct; nullability constraints are a design decision |
| Marker authoring tooling | Installations author markers manually; workflow unchanged |

---

## Success Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | `voice --manager` scoped to direct reports | `fit-landmark voice --manager athena@bionova.example` returns only comments from engineers whose `manager_email` is Athena in `organization_people` — no comments from outside that set appear |
| 2 | `health --manager` scoped to direct reports | `fit-landmark health --manager athena@bionova.example` returns driver rows for Athena's direct reports only — verify each row's team contains at least one engineer whose `manager_email` is Athena |
| 3 | `snapshot trend --manager` scoped to direct reports | `fit-landmark snapshot trend --item clear_direction --manager athena@bionova.example` returns only rows for teams that contain at least one of Athena's direct reports in the BioNova roster; no rows for other teams appear |
| 4 | `evidence` returns Guide-evaluated rows (depends on SC 7) | After SC 7 completes, `fit-landmark evidence --email actaeon@bionova.example` lists at least one artifact with non-null rationale |
| 5 | `readiness` produces checklists | `fit-landmark readiness --email actaeon@bionova.example` (J060 engineer) returns a non-empty marker checklist |
| 6 | `marker <skill>` lists markers | `fit-landmark marker data_integration` lists at least one marker |
| 7 | Initiative commands removed | `fit-landmark initiative` exits with an "unknown command" error or equivalent — the command group no longer exists |
| 8 | `driver_name` captured per comment | After `fit-map activity seed`, `getdx_snapshot_comments` rows contain non-null `driver_name` values for comments that include that field in the source data |
| 9 | Guide writes evidence with rationale | After piping an evaluation prompt for Actaeon to `fit-guide` (e.g. `echo "evaluate unscored artifacts for actaeon@bionova.example" \| fit-guide`), `activity.evidence` contains rows for Actaeon with non-null `rationale` |
| 10 | Evidence is standard-grounded | Every `skill_id` + `marker_text` pair in evidence rows written by Guide matches an entry in the engineering standard for Actaeon's profile `(software_engineering, J060, individual_contributor)` |
| 11 | Team-scoped evaluation works | After piping an evaluation prompt for Athena's team to `fit-guide` (e.g. `echo "evaluate unscored artifacts for direct reports of athena@bionova.example" \| fit-guide`), `activity.evidence` contains rows for at least one engineer whose `manager_email` is Athena in `organization_people` |
| 12 | Evaluation is idempotent | Piping the same evaluation prompt for Actaeon to `fit-guide` twice produces the same evidence row count both times |
| 13 | Evaluation can be invoked non-interactively | `fit-guide` reads its prompt from stdin, runs the evaluation skill, and exits with a status code — verifiable by running `echo "..." \| fit-guide` in a shell script |
| 14 | Multi-source evaluation is addable without logic changes | A second source type can be registered alongside GitHub without modifying the evaluation logic or evidence write path — verified by code review that the evaluation path contains no GitHub-specific branching |
| 15 | Evaluation coverage increases Landmark output (depends on SC 9) | Record `fit-landmark coverage --email actaeon@bionova.example` before running SC 9; after SC 9 completes, re-run the same command and confirm the interpreted-artifact percentage is higher |

---

## Scope

**In scope:**

| Package | What changes |
|---|---|
| `libraries/libsyntheticprose` + `libraries/libsyntheticrender` | Generated capability entities gain `markers` arrays (Gap 2) |
| `products/landmark` | `initiative` command group removed; manager-scoped views scoped to direct reports via roster |
| `products/map` | Manager-scoping queries corrected; unscored-artifact retrieval extended to team and org scope; GetDX comments pipeline extended to store `driver_name` per comment |
| `products/guide` | New evaluation skill loaded by `fit-guide` from a piped prompt; multi-source evaluation support; GitHub artifact source; engineering standard grounding |
| `services` (layer TBD in design) | Engineering standard access capability extended to return markers for a given `(discipline, level, track)` profile; currently provided by `svcpathway` / `svcmcp` but the extending layer is a design decision |
| `data/synthetic/story.dsl` | BioNova terrain updated so `organization_people` rows carry accurate `manager_email` values |

**Out of scope:** Additional source types; GetDX survey evaluation; GetDX
initiative and scorecard features; Landmark presentation layer changes;
`activity.evidence` column additions.
