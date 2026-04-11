# Landmark

Analysis and recommendation engine for engineering-system signals from Map.
Surfaces evidence, health, readiness, growth trajectories, initiative impact,
and engineer voice — all read-only, all deterministic.

```
@forwardimpact/landmark    CLI: fit-landmark
```

## Why

Landmark answers one question: **what do the signals say about how engineering
is functioning — and what should we do about it?**

It does this by querying Map, where operational and framework data are already
stored, and by importing Summit's growth logic to surface actionable
recommendations in context.

Key simplification:

- We continue using **GetDX** as the survey and developer experience platform.
- Map ingests GetDX snapshot aggregates. Comment and initiative ingestion
  require new extract/transform endpoints (not yet implemented — see
  [Implementation Prerequisites](#implementation-prerequisites)).
- Map also stores GitHub activity. Marker definitions belong in capability YAML
  (schema-supported via `capability.schema.json`, but no markers are defined in
  the starter data yet — installations must author their own).
- **Guide** (the LLM agent) interprets artifacts against markers and writes
  evidence to Map.
- Landmark reads, recommends, and presents; it does not collect surveys or call
  LLMs.

Landmark consumes Map's **activity layer** (`src/activity/queries/`) for all
operational data. The activity layer currently exports four query modules,
published as subpath exports of `@forwardimpact/map`:

- `@forwardimpact/map/activity/queries/org` (`getOrganization`, `getTeam`,
  `getPerson`)
- `@forwardimpact/map/activity/queries/evidence` (`getEvidence`,
  `getPracticePatterns`)
- `@forwardimpact/map/activity/queries/snapshots` (`listSnapshots`,
  `getSnapshotScores`, `getItemTrend`, `getSnapshotComparison`)
- `@forwardimpact/map/activity/queries/artifacts` (`getArtifacts`,
  `getUnscoredArtifacts`)

Landmark also imports from Map's **pure layer** (`@forwardimpact/map`) for
framework schema — specifically the data loader (`createDataLoader`) and level
constants from `src/levels.js`. Map's package layout follows spec 390: all
source lives under `src/`, with the public API surfaced via the `exports` map in
`products/map/package.json`.

Landmark is not purely a presentation layer. It imports Summit's growth
alignment computation to surface recommendations inline. This is a deliberate
architectural choice: the user impact of contextual recommendations outweighs
the elegance of strict separation. Recommendations are deterministic (no LLM),
computed from the same data Landmark already reads, and rendered in context
where the manager needs them.

## Audience Model

Landmark defines explicit audiences per view. The privacy model matches the
audience, not a blanket aggregation rule.

| Audience                     | Views                                                                             | Privacy model                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Engineer** (own data)      | `evidence`, `readiness`, `timeline`, `coverage`, `voice --email` (own)            | Full individual detail — it's your data                                           |
| **Manager** (1:1 tool)       | `health`, `growth-recs`, `readiness`, `timeline`, `practiced`, `voice --manager`  | Individual specificity for direct reports — managers already see Pathway profiles |
| **Director** (planning tool) | `snapshot`, `coverage`, `practiced`, `initiative`, `voice --manager` (aggregated) | Aggregated team views — named growth recommendations removed at this scope        |

The manager already knows who their direct reports are. Aggregation at the
manager level doesn't protect privacy — it obscures actionability. For directors
viewing multiple teams, aggregation provides meaningful anonymity.

## Scope

### In scope

- Read the unified person model (`organization_people`) from Map.
- Derive team membership from manager email hierarchy.
- Derive each person's expected skill profile from their job fields.
- Read GetDX snapshot aggregates from Map.
- Read Guide-generated evidence from Map for marker analysis.
- Read marker definitions from Map capability YAML files.
- Provide trend, comparison, and team-slice analytics.
- Read GetDX initiative data from Map for progress tracking.
- Aggregate evidence into individual growth timelines.
- Cross-reference evidence against next-level markers for readiness.
- Surface evidence coverage ratios (interpreted vs total artifacts).
- Present evidenced capability alongside derived capability.
- Import Summit's growth alignment logic to surface recommendations inline in
  health views.
- Read GetDX Snapshot comments from Map for engineer voice views.
- Compute initiative impact by joining initiative completion dates to snapshot
  score deltas.
- Apply audience-appropriate privacy to all views.

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
- Abstracting away the GetDX dependency (may be addressed in a future version).

## Data Contracts

Landmark consumes data from Map's activity schema
(`supabase/migrations/20250101000000_activity_schema.sql`). Tables marked
**exists** are defined in the current migration. Tables marked **requires new
migration** must be added before Landmark can use them.

**Existing tables:**

- `activity.organization_people` — unified person model (exists)
  - `email` (PK)
  - `name`
  - `github_username`
  - `discipline`, `level`, `track` (job profile)
  - `manager_email`
- `activity.getdx_teams` — includes `manager_email` join (exists)
- `activity.getdx_snapshots` (exists)
- `activity.getdx_snapshot_team_scores` (exists)
- `activity.github_events` (exists)
- `activity.github_artifacts` — includes `email` join to person (exists)
- `activity.evidence` — written by Guide, read by Landmark (exists)
  - `evidence_id` (PK, UUID, auto-generated)
  - `artifact_id` (FK to `github_artifacts`)
  - `skill_id`, `level_id`
  - `marker_text`, `matched`, `rationale`
  - `created_at` (used for timeline aggregation)

**Tables requiring new migration + extract/transform pipeline:**

- `activity.getdx_initiatives` — from GetDX Initiatives API (does not exist yet)
  - `id` (PK)
  - `name`
  - `description`
  - `scorecard_id`
  - `owner_email`
  - `due_date`
  - `priority`
  - `passed_checks`, `total_checks`, `completion_pct`
  - `tags`
  - Requires: new GetDX extract endpoint for Initiatives API, new transform
    step, new migration to create the table.
- `activity.getdx_snapshot_comments` — from GetDX `snapshots.comments.list` API
  (does not exist yet)
  - `snapshot_id` (FK to `getdx_snapshots`)
  - `email` (respondent)
  - `text` (open-ended comment)
  - `timestamp`
  - `team_id` (FK to `getdx_teams`, derived from respondent's team membership)
  - Requires: extending the GetDX extract
    (`products/map/supabase/functions/_shared/activity/extract/getdx.js`) to
    call `snapshots.comments.list`, a matching transform step in
    `supabase/functions/_shared/activity/transform/getdx.js`, and a new
    migration to create the table.

**Framework data contracts:**

- Marker definitions from Map capability YAML files. The `markers` field is
  supported by the JSON schema
  (`products/map/schema/json/capability.schema.json`) and validated by
  `validateSkillMarkers` in `products/map/src/validation/skill.js`, but no
  starter capabilities currently define markers. Each installation must author
  its own marker definitions for evidence-based views to function. Without
  markers, the `readiness`, `health`, and `evidence` commands have no criteria
  to evaluate against.
- Driver definitions from Map (`drivers.yaml`) — the driver `id` is the join key
  to `getdx_snapshot_team_scores.item_id`, and `contributingSkills` links
  drivers to evidence. The starter data currently defines only one driver
  (`quality`, contributing skills: `task_completion`, `planning`). Health views
  and outcome-weighted recommendations require additional driver definitions to
  be useful (e.g., `reliability`, `cognitive_load`). Installations using GetDX
  should define drivers that match their GetDX scorecard items.
- libskill derivation logic — to determine which skills apply at a target level
  for a given discipline/track (used by `readiness` command). Current libskill
  exports from `libraries/libskill/src/index.js`: `deriveSkillMatrix`,
  `deriveJob`, `deriveBehaviourProfile`, `getNextLevel`,
  `analyzeLevelProgression`, `calculateJobMatch`, plus the rest of the
  derivation/matching/progression/agent surface. All individual-level — no team
  aggregation. Version 4.1.7.
- Summit's growth alignment logic (imported as a library dependency, not a
  service call — Summit's team gap analysis and growth candidate matching run
  locally). Summit (spec 090) is currently in draft status and not yet
  implemented. This creates a dependency ordering: Summit must export
  `computeGrowthAlignment` before Landmark's `health` command can include inline
  growth recommendations.
- Driver-to-snapshot-score delta computation (join `getdx_initiatives`
  completion dates against `getdx_snapshot_team_scores` across snapshots) —
  blocked on `getdx_initiatives` table creation.

Team semantics:

- A team is defined by a manager email.
- Team members are everyone in that manager's reporting hierarchy.

### Markers

Markers are concrete, observable indicators of a skill at a proficiency level.
They live in Map's capability YAML files alongside skill definitions:

```yaml
skills:
  - id: task_completion
    markers:
      working:
        human:
          - Delivered a feature end-to-end with no revision to the initial design
          - Independently resolved a production issue within SLA
        agent:
          - Completed a multi-file change that passes CI without human rework
```

The `markers` field is validated by Map's JSON schema
(`products/map/schema/json/capability.schema.json`) and skill validation
(`products/map/src/validation/skill.js`). Each level key must be a valid
proficiency (`awareness`, `foundational`, `working`, `practitioner`, `expert`),
and each entry is an object with `human` and/or `agent` string arrays. The data
loader (`products/map/src/loader.js`) carries markers through to the loaded
skill objects.

**Current state:** No capabilities in the starter data define markers yet. The
starter capabilities (`delivery`, `reliability`) define
`proficiencyDescriptions` but not `markers`. Markers are installation-specific —
each organization authors markers that reflect their context. Landmark's
evidence-based views (readiness, health, evidence) require markers to be
populated.

Landmark reads markers to label and group evidence. Guide reads them to
interpret artifacts. Map validates them.

### Evidence Pipeline

```
GitHub Events → Map (storage) → extraction → github_artifacts
                                                │
                                         Guide (interprets)
                                                │
                                         activity.evidence
                                                │
                                         Landmark (presents + recommends)
```

Guide writes evidence rows with `artifact_id`, `skill_id`, `level_id`,
`marker_text`, `matched`, and `rationale`. The `artifact_id` links back to the
source artifact in `github_artifacts`, and person filtering follows the join
chain: evidence → artifact → person (via `email` on `github_artifacts`).
Landmark reads them and provides the engineer with Guide's reasoning alongside
each artifact.

### GetDX Snapshot Comments as Engineer Voice

GetDX Snapshots collect two categories of engineer input that serve as the
engineer's voice:

1. **Perceptual measures** — how engineers feel about tools, workflows, and
   processes. These capture pain, friction, and toil.
2. **Open-ended comments** — free-text responses where engineers describe
   blockers, context, and frustrations in their own words.

The `snapshots.comments.list` API returns comments with email, text, and
timestamp. Map will ingest these into `activity.getdx_snapshot_comments` once
the extract/transform pipeline is extended (currently Map's GetDX extract calls
only `teams.list`, `snapshots.list`, and `snapshots.info`). Landmark surfaces
them alongside health and evidence views.

This is the "voice of the engineers" without building a custom write path. GetDX
already asks engineers what's blocking them, what they'd most like improved, and
how they experience their engineering environment. Landmark's job is to connect
those voices to the capability and evidence data that explains _why_ they're
saying it.

Comments are individual-level data (attributed by email). The audience model
governs visibility:

- Engineers see their own comments in context.
- Managers see comments from their direct reports.
- Directors see aggregated comment themes, not individual attribution.

## Product Behavior

### Organization views

- Show full organization directory.
- Show hierarchy under a manager.

### Snapshot views

- List available snapshots.
- Show factor/driver scores for a snapshot.
- Compare against prior snapshot and benchmarks (`vs_prev`, `vs_org`, `vs_50th`,
  `vs_75th`, `vs_90th`).

### Marker reference view

The `marker` command is a standalone reference view that displays the marker
definitions for a skill from Map's capability YAML files.

- `fit-landmark marker <skill>` — show all markers for a skill, grouped by
  proficiency level, with human and agent variants.
- `fit-landmark marker <skill> --level <level>` — show markers at a specific
  proficiency level only.

This is a discovery tool: "what does the framework say I need to demonstrate at
working level for task_completion?" It reads directly from Map's data loader and
does not require any activity data. If no markers are defined for the requested
skill, it reports that explicitly.

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

### Promotion readiness view

Show marker checklist for a target level. For each marker at the target level:
indicate whether evidence exists, cite the artifact, or mark as gap.

- Derives the target level's required markers from Map capability YAML via
  libskill derivation (discipline + track determines which skills apply; target
  level determines which markers to check). Levels are defined in `levels.yaml`
  with IDs like `J040` (Level I), `J060` (Level II), etc. — not L1/L2/L3.
- Matches markers against existing evidence rows for the person.
- Presents a checklist: `[x] marker text (artifact link)` or `[ ] marker text`.
- Summary: "8/12 markers evidenced. Missing: ..."
- Default target is current level + 1 (determined by `ordinalRank` in
  `levels.yaml`). Override with `--target`.
- **Starter limitation:** The starter data defines only 2 levels (`J040` Level
  I, `J060` Level II). An engineer at Level II has no next level to target. In
  this case, `readiness` should report "no higher level defined" rather than
  failing silently. Installations with a full level ladder (e.g., 5 levels) will
  see the intended readiness checklist behavior.

### Individual growth timeline

Aggregate evidence by quarter per skill to show how a person's evidenced skill
profile evolved over time.

- Groups evidence by `created_at` quarter, `skill_id`, and highest matched
  `level_id`.
- Presents a time-series view: per skill, the highest evidenced level per
  quarter.
- Answers: "Was this person evidencing working-level task_completion in Q1 and
  practitioner-level by Q3?"
- No self-reported data — derived entirely from Guide's evidence over time.

### Initiative tracking

Surface GetDX Initiatives alongside team health to close the analysis-to-action
feedback loop.

- List active initiatives, filtered by owner or manager scope.
- Show initiative detail: completion percentage, linked scorecard checks, due
  date, priority.
- Extend `health` view to include active initiatives and their status, so
  managers see both the problem (GetDX scores, capability gaps) and the response
  (active initiatives) in one view.

### Evidence coverage metrics

Surface the ratio of interpreted artifacts to total artifacts per person and
skill.

- `evidence` command output includes: "Evidence covers X/Y artifacts."
- Uses Map's existing `getUnscoredArtifacts` query to identify gaps.
- `coverage` command provides a dedicated view: which artifact types have been
  interpreted for a person, which haven't, and overall coverage percentage.
- Qualifies evidence-based views: if coverage is low, the evidence base is thin
  and conclusions should be weighted accordingly.

### Practiced capability view

Show evidenced capability alongside derived capability for a team.

- For each skill, display `derived_depth` (from job profiles via libskill) and
  `evidenced_depth` (from evidence aggregates in Map).
- Divergence between derived and evidenced highlights skills that exist on paper
  but aren't practiced (or vice versa).
- Uses Map's activity layer evidence queries — no new data source required.

### Health view

The health view joins objective marker evidence with GetDX snapshot outcomes. It
is valuable in two phases:

**Phase 1 (without Summit):** Health shows driver scores, contributing skill
evidence, and engineer voice comments. This is a complete, actionable view — a
manager sees where outcomes are poor and what the evidence says, without needing
growth recommendations.

```
$ fit-landmark health --manager alice@example.com

  Platform team — health view

  Driver: quality (42nd percentile, vs_org: -10)
    Contributing skills: task_completion, planning
    Evidence: 3 artifacts for task_completion, 0 for planning
    GetDX comments: "Estimates are always off, we overcommit every sprint"
                    "Hard to plan when requirements change mid-cycle"
```

**Phase 2 (with Summit):** When Summit is available, health extends with inline
growth recommendations imported from Summit's `computeGrowthAlignment` function.
The recommendation line is additive — it does not change the existing output.

```
$ fit-landmark health --manager alice@example.com

  Platform team — health view

  Driver: quality (42nd percentile, vs_org: -10)
    Contributing skills: task_completion, planning
    Evidence: 3 artifacts for task_completion, 0 for planning
    GetDX comments: "Estimates are always off, we overcommit every sprint"
                    "Hard to plan when requirements change mid-cycle"

    ⮕ Recommendation: Dan (Level I) or Carol (Level II) could develop planning.
      Growing from awareness to foundational closes the team's evidence gap.
      (Summit growth alignment: high impact)
```

The examples above use the starter data's single driver (`quality`) and its
contributing skills (`task_completion`, `planning`). In a real installation with
richer driver definitions (e.g., `reliability` contributing
`incident_response`), the health view would show multiple driver sections. The
starter data's single driver is intentionally minimal — installations define
drivers that match their GetDX scorecard items.

Implementation: When Summit is installed, Landmark imports its growth
computation as a library function. Given a team roster and Map data, it returns
growth recommendations ranked by impact. Landmark calls this function and
renders recommendations inline. When Summit is not available, Landmark omits the
recommendation lines — the health view degrades gracefully. No service call, no
network — same process, same data.

### Engineer voice

Surface GetDX Snapshot comments alongside evidence and health views to give
engineers a voice in the system.

**Voice command group:**

```
$ fit-landmark voice --manager alice@example.com

  Platform team — engineer voice (Snapshot 2025-Q1)

  Most discussed themes:
    Estimation accuracy    4 comments   "always overcommit", "scope creep"
    Incident response      3 comments   "no runbooks", "on-call is painful"
    Task handoffs          2 comments   "context lost between sprints"

  Aligned with health signals:
    quality driver (42nd pctl) ← estimation comments confirm planning gap
```

```
$ fit-landmark voice --email dan@example.com

  Dan's snapshot comments (last 4 snapshots):

  2025-Q1: "Sprint planning is a guessing game — no historical data to base estimates on"
  2024-Q4: "Would love a better way to track what I've actually delivered"
  2024-Q3: "Incident last week was rough — no runbook for the payment service"
  2024-Q2: (no comment)

  Context from evidence:
    Dan has 2 evidence rows for task_completion (foundational), 0 for planning.
    His comments align with the team's quality driver gap.
```

The voice view connects what engineers _say_ (GetDX comments) with what the
system _observes_ (evidence, driver scores). This makes the system
bidirectional: it doesn't just analyze engineers — it amplifies their
perspective.

**Integration with health view:** When `health` shows a poorly-scoring driver,
it includes representative comments from the team's snapshot responses (as shown
in the health example above). Comments are matched to drivers via the snapshot
structure — each comment is associated with the driver/factor context in which
it was submitted.

**"What is blocking you?"** GetDX Snapshots ask engineers to rank which items
they'd most like to see improved. Combined with open-ended comments, this
provides a structured answer to "what is blocking you?" that Landmark can
present alongside structural capability data. The snapshot's perceptual measures
capture how engineers _feel_ about their environment; the comments capture
_why_.

### Initiative impact

Close the full feedback loop: did completed initiatives actually move the scores
they targeted?

```
$ fit-landmark initiative impact --manager alice@example.com

  Completed initiatives — outcome correlation

  "Introduce sprint estimation framework" (completed 2025-Q1)
    Target driver: quality
    Score before: 42nd percentile (2024-Q4 snapshot)
    Score after:  58th percentile (2025-Q2 snapshot)
    Change: +16 percentile points
    Engineer voice: "Estimates are more realistic now" (Q2 comment)

  "Create incident response runbooks" (completed 2025-Q2)
    Target driver: (no driver linked — requires a reliability driver definition)
    Score before: n/a
    Score after:  n/a
    Change: n/a — initiative not linked to a defined driver

  "Improve planning visibility" (in progress, 60% complete)
    Target driver: quality
    Score trend: 42nd → 50th → 55th (improving during initiative)
```

The second example illustrates a limitation: initiatives targeting capabilities
without corresponding driver definitions cannot show score correlation. This
reinforces that installations should define drivers that cover their key
improvement areas.

Implementation: join `getdx_initiatives` (with completion dates and linked
scorecard/driver) against `getdx_snapshot_team_scores` across the snapshot
before and after completion. The delta is a simple percentile difference. No
causal claim — just correlation. "The initiative completed and the score moved"
is informative without being misleading.

This closes the full Deming cycle: Analysis → Decision → Action → Outcome →
Analysis.

## Empty States and Error Behavior

Landmark must handle missing or sparse data gracefully. Each view should
communicate what is absent and why, rather than showing empty tables or failing
silently.

| Condition                          | Behavior                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No evidence rows exist             | `evidence`, `readiness`, `timeline`, `coverage`, `practiced` show "No evidence data available. Guide has not yet interpreted artifacts for this scope."                  |
| No markers defined for a skill     | `marker` shows "No markers defined for {skill}. Add markers to the capability YAML." `readiness` shows "No markers defined at target level — cannot generate checklist." |
| No GetDX snapshots ingested        | `snapshot`, `health` show "No GetDX snapshot data available. Run `fit-map getdx sync` (or `fit-map activity seed` for synthetic data) to ingest."                        |
| No GetDX comments table            | `voice` shows "Snapshot comments not available. The getdx_snapshot_comments table has not been created."                                                                 |
| No GetDX initiatives table         | `initiative` shows "Initiative data not available. The getdx_initiatives table has not been created."                                                                    |
| Summit not installed               | `health` omits the recommendation lines — shows driver scores, evidence, and comments without growth suggestions. No error.                                              |
| `--email` matches no person        | "No person found with email {email} in organization_people."                                                                                                             |
| `--manager` matches no team        | "No team found for manager {email}."                                                                                                                                     |
| Readiness target level not defined | "No higher level defined in levels.yaml. Current level ({id}) is the highest."                                                                                           |
| `--evidenced` with no evidence     | Views show evidenced depth as 0 for all skills, with a note: "No evidence data found. Evidenced depth reflects Guide-interpreted artifacts only."                        |

The principle: always explain the empty state in terms the user can act on —
name the missing data source and how to populate it.

## CLI

```
Landmark — analysis and recommendations on top of Map data.

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
  fit-landmark readiness --email <email> [--target <level>]
  fit-landmark timeline --email <email> [--skill <skill_id>]
  fit-landmark initiative list [--manager <email>]
  fit-landmark initiative show --id <id>
  fit-landmark initiative impact [--manager <email>]
  fit-landmark coverage --email <email>
  fit-landmark practiced --manager <email>
  fit-landmark voice --manager <email>
  fit-landmark voice --email <email>

Options:
  --format <type>         Output format: text, json, markdown (default: text)
```

All views support `--format json` for programmatic consumption. This enables
integration with dashboards, planning tools, or custom reporting without
Landmark needing to know about them.

The `health` command shows driver scores, contributing skill evidence, and
representative GetDX Snapshot comments per driver. When Summit is available,
health also includes inline growth recommendations.

Removed from Landmark:

- `survey create|distribute|close`
- `roster sync`
- ingestion/replay commands
- any LLM/Guide invocation (interpretation is Guide's job, not Landmark's)

## Starter Data Philosophy

The monorepo's starter data (`products/map/starter/`) is a scaffold — it
demonstrates the schema and validates the pipeline, but it is not a demo of
Landmark's analytical power. The starter defines 2 levels, 3 skills across 2
capabilities, 1 driver, 1 behaviour, and 0 markers.

Landmark's value scales with framework richness. An installation with 5 levels,
20 skills, 8 drivers, and authored markers will see multi-driver health views,
meaningful readiness checklists, and rich evidence timelines. The minimal
starter is intentional: it forces installations to own their framework
definitions rather than cargo-culting examples. Landmark works correctly with
the starter — it just shows less.

Getting-started documentation for external users should set this expectation
clearly: install Landmark, then author your framework data. The
[Authoring Frameworks guide](website/docs/guides/authoring-frameworks/index.md)
covers vocabulary standards. A future "Landmark quickstart" guide should walk
through adding drivers and markers so that `health`, `readiness`, and `evidence`
views produce meaningful output.

## Implementation Prerequisites

Landmark depends on several pieces of infrastructure that do not yet exist. This
section tracks what must be built before each Landmark capability can function.

**Map activity layer — existing infrastructure (ready to consume):**

Specs 350 (end-to-end activity layer) and 380 (activity seed) brought the
activity layer to a working state. The CLI is the single entry point for every
activity workflow; edge functions and the CLI share a single set of
extract/transform helpers.

- `organization_people` table + `getOrganization`/`getTeam`/`getPerson` queries
  (`@forwardimpact/map/activity/queries/org`)
- `getdx_snapshots`, `getdx_teams`, `getdx_snapshot_team_scores` tables +
  snapshot queries (`@forwardimpact/map/activity/queries/snapshots`)
- `github_events` + `github_artifacts` tables + artifact queries
  (`@forwardimpact/map/activity/queries/artifacts`)
- `evidence` table + `getEvidence`/`getPracticePatterns` queries
  (`@forwardimpact/map/activity/queries/evidence`)
- Schema migration:
  `products/map/supabase/migrations/20250101000000_activity_schema.sql` (the
  earlier draft under `activity/migrations/` was removed by spec 350; this is
  now the single authoritative DDL).
- GetDX extract pipeline at
  `products/map/supabase/functions/_shared/activity/extract/getdx.js` —
  currently calls `teams.list`, `snapshots.list`, `snapshots.info`. Imported by
  both the `getdx-sync` Supabase edge function and the `fit-map getdx sync` CLI
  command.
- GitHub extract + transform at
  `products/map/supabase/functions/_shared/activity/extract/github.js` and
  `.../transform/github.js`. Single source of truth shared by the
  `github-webhook` edge function and the CLI's reprocess path. The duplicated
  Deno/Node implementations called out by spec 350 have been consolidated.
- People extract/transform at
  `supabase/functions/_shared/activity/extract/people.js` and
  `.../transform/people.js`, plus a Deno-compatible parser at
  `products/map/src/activity/parse-people.js` shared with the CLI validator
  (`src/activity/validate/people.js`).
- All four Supabase edge functions (`github-webhook`, `getdx-sync`,
  `people-upload`, `transform`) complete their job after a single invocation and
  report counts/errors as JSON.
- `fit-map` CLI commands for the full activity workflow:
  `fit-map activity start|stop|status|migrate|transform|verify|seed`,
  `fit-map people validate|push`, and `fit-map getdx sync`. Internal
  contributors can go from `just synthetic` to a populated database with
  `fit-map activity seed`.
- Activity-layer test coverage at `products/map/test/activity/` (storage,
  transform-getdx, transform-github, transform-people, validate-people,
  integration, seed).

**Map activity layer — requires new work:**

| Prerequisite                                    | Blocks Landmark commands      | Work required                                                                                                                |
| ----------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `getdx_snapshot_comments` table                 | `voice`                       | New migration, new extract endpoint (`snapshots.comments.list`), new transform step                                          |
| `getdx_initiatives` table                       | `initiative list/show/impact` | New migration, new extract endpoint (Initiatives API), new transform step                                                    |
| Additional driver definitions in `drivers.yaml` | `health` (multi-driver views) | Starter data authoring — installations can define their own, but the starter should demonstrate the pattern with 2-3 drivers |

**Framework data — requires authoring:**

| Prerequisite                          | Blocks Landmark commands                                | Work required                                                                       |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Marker definitions in capability YAML | `readiness`, `evidence` (marker-linked views), `health` | Add `markers` to at least `delivery` and `reliability` capabilities in starter data |

**Cross-product dependencies:**

| Prerequisite                                        | Blocks Landmark commands                                                                                                          | Work required                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Summit's `computeGrowthAlignment` export (spec 090) | `health` growth recommendations (health itself works without Summit — degrades gracefully to driver scores + evidence + comments) | Implement Summit product, export growth function       |
| Guide evidence generation                           | All evidence-based views                                                                                                          | Guide must interpret artifacts and write evidence rows |

**Landmark can ship incrementally.** The `org`, `snapshot`, and `practice`
commands depend only on existing infrastructure. Evidence-based commands
(`evidence`, `readiness`, `timeline`, `coverage`, `practiced`) require Guide to
be writing evidence rows. The `health` command works without Summit — it shows
driver scores, evidence, and comments. Growth recommendations appear when Summit
is installed. The `voice` and `initiative` commands require new Map tables.

## Positioning

```
                       Pure layer                 Activity layer
                  +----------------------+--------------------------------+
GetDX + GitHub -->| Map (src/loader.js,  | Map (src/activity/queries/*,   |
                  | src/validation/*,    | supabase/migrations,           |
                  | src/levels.js)       | supabase/functions/_shared/    |
                  | schema, markers      | activity/{extract,transform})  |
                  +-----------+----------+--------------+-----------------+
                              |                         |
                           Guide                Landmark ← Summit (growth logic)
                       (interprets)         (presents + recommends)
```

Both layers ship from the same `@forwardimpact/map` package. Source files follow
spec 390's `src/`-rooted layout; consumers import via subpath aliases
(`@forwardimpact/map`, `@forwardimpact/map/activity/queries/org`, …). The ingest
pipeline that writes the activity layer is driven by Map's CLI and edge
functions (specs 350 + 380); Landmark only ever reads.

Map owns data. Guide owns interpretation. Landmark owns presentation and
contextual recommendation. Summit owns team-level planning and what-if
scenarios.

The boundary between Landmark and Summit remains clear:

- **Landmark** answers "what do the signals say and what could you do about it?"
- **Summit** answers "what can this team do and how should we change it?"

Landmark borrows Summit's growth logic to avoid forcing the manager to context-
switch between tools. Summit retains its full planning surface (what-if,
compare, trajectory).

## Summary

| Attribute              | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Package                | `@forwardimpact/landmark`                                  |
| CLI                    | `fit-landmark`                                             |
| Role                   | Analysis and recommendation layer on Map                   |
| Survey source          | GetDX (external platform)                                  |
| Data store             | Map (single source of truth)                               |
| Org model              | Unified person model (email PK, job profiles)              |
| Team model             | Derived from manager email subtree                         |
| Readiness view         | Marker checklist against next-level requirements           |
| Timeline view          | Quarterly evidence aggregation per skill per person        |
| Initiative views       | GetDX Initiatives via Map, linked to health view           |
| Initiative impact      | Score delta before/after initiative completion             |
| Coverage metrics       | Interpreted/total artifact ratio per person                |
| Practiced view         | Evidenced depth alongside derived depth per team skill     |
| Growth recommendations | Summit growth logic imported, surfaced inline in health    |
| Engineer voice         | GetDX Snapshot comments surfaced via `voice` command group |
| Audience model         | Explicit per-view privacy: engineer, manager, director     |
| Dependencies           | Map (activity + pure layers), libskill, Summit (growth)    |
| Data contracts         | `organization_people`, `evidence`, `getdx_*`, `github_*`   |
| Starter data gaps      | No markers defined; only 1 driver (`quality`)              |
| Blocked features       | `voice` (comments table), `initiative` (initiatives table) |
| Cross-product blocker  | Summit `computeGrowthAlignment` (spec 090, draft)          |
| Runtime cost           | Zero — local computation, fully deterministic              |
