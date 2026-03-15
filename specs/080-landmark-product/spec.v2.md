# Landmark v2

Thin analysis of engineering-system signals from Map — with individual growth
tracking, promotion readiness, initiative integration, and evidence coverage.

```
@forwardimpact/landmark    CLI: fit-landmark
```

## Changes from v1

| Change                         | Source                                                       | Gaps Closed                                   |
| ------------------------------ | ------------------------------------------------------------ | --------------------------------------------- |
| Add `readiness` command        | Gap 2 (promotion readiness)                                  | Engineers see marker checklist for next level |
| Add `timeline` command         | Gap 1 (individual growth trajectory)                         | Skill profile evolution over quarters         |
| Add `initiative` command group | Gap 3 (initiative tracking), Blind spot 4 (no feedback loop) | GetDX Initiatives surface in Landmark         |
| Add evidence coverage metrics  | Blind spot 3 (evidence completeness unmeasured)              | Artifacts-without-evidence ratio visible      |
| Add `practiced` command        | Blind spot 1 (invisible present tense)                       | Evidenced vs derived capability view          |

## Why

Landmark answers one question: **what do the signals say about how engineering
is functioning?**

It does this by querying Map, where operational and framework data are already
stored.

Key simplification:

- We continue using **GetDX** as the survey platform.
- Map ingests GetDX snapshot aggregates.
- Map also stores GitHub activity and marker definitions in capability YAML.
- **Guide** (the LLM agent) interprets artifacts against markers and writes
  evidence to Map.
- Landmark reads and presents; it does not collect surveys or call LLMs.

Landmark consumes Map's **activity layer** (`activity/queries/`) for all
operational data. It also imports from Map's **pure layer** (`src/`) for
framework schema and marker definitions. See the Map spec for the full layering
description.

v2 extends Landmark with individual-level views (readiness, timeline),
initiative tracking via GetDX, and evidence quality metrics — all read-only, all
consuming existing data.

## Scope

### In scope

- Read the unified person model (`organization_people`) from Map.
- Derive team membership from manager email hierarchy.
- Derive each person's expected skill profile from their job fields.
- Read GetDX snapshot aggregates from Map.
- Read Guide-generated evidence from Map for marker analysis.
- Read marker definitions from Map capability YAML files.
- Provide trend, comparison, and team-slice analytics.
- **v2:** Read GetDX initiative data from Map for progress tracking.
- **v2:** Aggregate evidence into individual growth timelines.
- **v2:** Cross-reference evidence against next-level markers for readiness.
- **v2:** Surface evidence coverage ratios (interpreted vs total artifacts).
- **v2:** Present evidenced capability alongside derived capability.

### Out of scope

- Survey distribution or response collection.
- Owning ingestion pipelines.
- Owning roster data structures (unified person model lives in Map).
- Interpreting artifacts against markers (Guide's responsibility).
- Making LLM calls of any kind.
- Access control enforcement (deferred — Map owns schema-level access policies
  in a later phase; Landmark inherits whatever Map provides).
- Self-assessment capture (requires a write path — belongs in Basecamp or
  Pathway).

## Data Contracts

Landmark consumes:

- `activity.organization_people` (unified person model)
  - `email` (PK)
  - `name`
  - `github_username`
  - `discipline`, `level`, `track` (job profile)
  - `manager_email`
- `activity.getdx_teams` (includes `manager_email` join)
- `activity.getdx_snapshots`
- `activity.getdx_snapshot_team_scores`
- `activity.github_events`
- `activity.github_artifacts` (includes `email` join to person)
- `activity.evidence` (written by Guide, read by Landmark)
  - `artifact_id` (FK to `github_artifacts`)
  - `skill_id`, `level_id`
  - `marker_text`, `matched`, `rationale`
  - `created_at` (used for timeline aggregation)
- Marker definitions from Map capability YAML files
- Driver definitions from Map (`drivers.yaml`) — the driver `id` is the join key
  to `getdx_snapshot_team_scores.item_id`, and `contributingSkills` links
  drivers to marker evidence

### v2 additions

- `activity.getdx_initiatives` (new table, extracted from GetDX Initiatives API)
  - `id` (PK)
  - `name`
  - `description`
  - `scorecard_id`
  - `owner_email`
  - `due_date`
  - `priority`
  - `passed_checks`, `total_checks`, `completion_pct`
  - `tags`
- libskill derivation logic — to determine which markers apply at a target level
  for a given discipline/track (used by `readiness` command)

Team semantics:

- A team is defined by a manager email.
- Team members are everyone in that manager's reporting hierarchy.

### Markers

Markers are concrete, observable indicators of a skill at a proficiency level.
They live in Map's capability YAML files alongside skill definitions:

```yaml
skills:
  - id: system_design
    markers:
      working:
        human:
          - Authored a design doc accepted without requiring senior rewrite
          - Led a technical discussion that resolved a design disagreement
        agent:
          - Produced a design doc that passes review without structural rework
```

Markers are installation-specific. Landmark reads them to label and group
evidence. Guide reads them to interpret artifacts. Map validates them.

### Evidence Pipeline

```
GitHub Events → Map (storage) → extraction → github_artifacts
                                                │
                                         Guide (interprets)
                                                │
                                         activity.evidence
                                                │
                                         Landmark (presents)
```

Guide writes evidence rows with `artifact_id`, `skill_id`, `level_id`,
`marker_text`, `matched`, and `rationale`. The `artifact_id` links back to the
source artifact in `github_artifacts`, and person filtering follows the join
chain: evidence → artifact → person (via `email` on `github_artifacts`).
Landmark reads them and provides the engineer with Guide's reasoning alongside
each artifact.

## Product Behavior

### Organization views

- Show full organization directory.
- Show hierarchy under a manager.

### Snapshot views

- List available snapshots.
- Show factor/driver scores for a snapshot.
- Compare against prior snapshot and benchmarks (`vs_prev`, `vs_org`, `vs_50th`,
  `vs_75th`, `vs_90th`).

### Marker evidence views

- Show marker-linked evidence by skill, with Guide's rationale.
- Personal evidence reflects against markers expected for the engineer's role
  (derived from their `discipline`, `level`, `track` in the unified person
  model).
- Show practice-pattern aggregates for manager-defined teams.
- Show joined health views where objective marker evidence is compared to GetDX
  snapshot outcomes. Framework drivers are the GetDX drivers — the driver `id`
  is the join key to snapshot scores. Each driver's `contributingSkills` link
  back to the marker evidence.

### Trend views

- Track item trend across quarterly snapshots.
- Slice trends by manager-defined team.

### v2: Promotion readiness view

Show marker checklist for a target level. For each marker at the target level:
indicate whether evidence exists, cite the artifact, or mark as gap.

- Derives the target level's required markers from Map capability YAML via
  libskill derivation (discipline + track determines which skills apply; target
  level determines which markers to check).
- Matches markers against existing evidence rows for the person.
- Presents a checklist: `[x] marker text (artifact link)` or `[ ] marker text`.
- Summary: "8/12 markers evidenced. Missing: ..."
- Default target is current level + 1. Override with `--target`.

### v2: Individual growth timeline

Aggregate evidence by quarter per skill to show how a person's evidenced skill
profile evolved over time.

- Groups evidence by `created_at` quarter, `skill_id`, and highest matched
  `level_id`.
- Presents a time-series view: per skill, the highest evidenced level per
  quarter.
- Answers: "Was this person evidencing working-level observability in Q1 and
  practitioner-level by Q3?"
- No self-reported data — derived entirely from Guide's evidence over time.

### v2: Initiative tracking

Surface GetDX Initiatives alongside team health to close the analysis-to-action
feedback loop.

- List active initiatives, filtered by owner or manager scope.
- Show initiative detail: completion percentage, linked scorecard checks, due
  date, priority.
- Extend `health` view to include active initiatives and their status, so
  managers see both the problem (GetDX scores, capability gaps) and the response
  (active initiatives) in one view.

### v2: Evidence coverage metrics

Surface the ratio of interpreted artifacts to total artifacts per person and
skill.

- `evidence` command output includes: "Evidence covers X/Y artifacts."
- Uses Map's existing `getUnscoredArtifacts` query to identify gaps.
- `coverage` command provides a dedicated view: which artifact types have been
  interpreted for a person, which haven't, and overall coverage percentage.
- Qualifies evidence-based views: if coverage is low, the evidence base is thin
  and conclusions should be weighted accordingly.

### v2: Practiced capability view

Show evidenced capability alongside derived capability for a team.

- For each skill, display `derived_depth` (from job profiles via libskill) and
  `evidenced_depth` (from evidence aggregates in Map).
- Divergence between derived and evidenced highlights skills that exist on paper
  but aren't practiced (or vice versa).
- Uses Map's activity layer evidence queries — no new data source required.

## CLI

```
Landmark — analysis on top of Map snapshot data.

Usage:
  fit-landmark org show
  fit-landmark org team --manager <email>
  fit-landmark snapshot list
  fit-landmark snapshot show --snapshot <id> [--manager <email>]
  fit-landmark snapshot trend --item <item_id> [--manager <email>]
  fit-landmark snapshot compare --snapshot <id> [--manager <email>]
  fit-landmark evidence [--skill <skill_id>] [--email <email>]
  fit-landmark practice [--skill <skill_id>] [--manager <email>]
  fit-landmark marker <skill> [--level <level>]
  fit-landmark health [--manager <email>]

v2 commands:
  fit-landmark readiness --email <email> [--target <level>]
  fit-landmark timeline --email <email> [--skill <skill_id>]
  fit-landmark initiative list [--manager <email>]
  fit-landmark initiative show --id <id>
  fit-landmark coverage --email <email>
  fit-landmark practiced --manager <email>
```

Removed from Landmark:

- `survey create|distribute|close`
- `roster sync`
- ingestion/replay commands
- any LLM/Guide invocation (interpretation is Guide's job, not Landmark's)

## Positioning

```
                    Pure layer           Activity layer
                  +------------------+-------------------------+
GetDX + GitHub --> |   Map (src/)       |   Map (activity/)          |
                  |   schema, markers  |   ingest, store, query     |
                  +---------+--------+----------+------------+
                            |                  |
                         Guide              Landmark
                      (interprets)         (presents)
```

Landmark stays intentionally small: query, aggregate, explain.

Map owns data. Guide owns interpretation. Landmark owns presentation.

v2 extends presentation to individual-level views and initiative tracking
without changing the architectural role.

## Summary

| Attribute     | Value                                         |
| ------------- | --------------------------------------------- |
| Package       | `@forwardimpact/landmark`                     |
| CLI           | `fit-landmark`                                |
| Role          | Thin analysis layer on Map                    |
| Survey source | GetDX (external platform)                     |
| Data store    | Map (single source of truth)                  |
| Org model     | Unified person model (email PK, job profiles) |
| Team model    | Derived from manager email subtree            |

### v2 additions

| Attribute         | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| Readiness view    | Marker checklist against next-level requirements          |
| Timeline view     | Quarterly evidence aggregation per skill per person       |
| Initiative views  | GetDX Initiatives via Map, linked to health view          |
| Coverage metrics  | Interpreted/total artifact ratio per person               |
| Practiced view    | Evidenced depth alongside derived depth per team skill    |
| New dependency    | libskill derivation (for readiness marker resolution)     |
| New data contract | `activity.getdx_initiatives` (from GetDX Initiatives API) |
