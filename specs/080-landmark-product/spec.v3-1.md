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
- Map ingests GetDX snapshot aggregates, comments, and initiative data.
- Map also stores GitHub activity and marker definitions in capability YAML.
- **Guide** (the LLM agent) interprets artifacts against markers and writes
  evidence to Map.
- Landmark reads, recommends, and presents; it does not collect surveys or call
  LLMs.

Landmark consumes Map's **activity layer** (`activity/queries/`) for all
operational data. It also imports from Map's **pure layer** (`src/`) for
framework schema and marker definitions.

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

The manager already knows who their three L3s are. Aggregation at the manager
level doesn't protect privacy — it obscures actionability. For directors viewing
multiple teams, aggregation provides meaningful anonymity.

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
- `activity.getdx_initiatives` (from GetDX Initiatives API)
  - `id` (PK)
  - `name`
  - `description`
  - `scorecard_id`
  - `owner_email`
  - `due_date`
  - `priority`
  - `passed_checks`, `total_checks`, `completion_pct`
  - `tags`
- `activity.getdx_snapshot_comments` (from GetDX `snapshots.comments.list` API)
  - `snapshot_id` (FK to `getdx_snapshots`)
  - `email` (respondent)
  - `text` (open-ended comment)
  - `timestamp`
  - `team_id` (FK to `getdx_teams`, derived from respondent's team membership)
- Marker definitions from Map capability YAML files
- Driver definitions from Map (`drivers.yaml`) — the driver `id` is the join key
  to `getdx_snapshot_team_scores.item_id`, and `contributingSkills` links
  drivers to marker evidence
- libskill derivation logic — to determine which markers apply at a target level
  for a given discipline/track (used by `readiness` command)
- Summit's growth alignment logic (imported as a library dependency, not a
  service call — Summit's team gap analysis and growth candidate matching run
  locally)
- Driver-to-snapshot-score delta computation (join `getdx_initiatives`
  completion dates against `getdx_snapshot_team_scores` across snapshots)

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
                                         Landmark (presents + recommends)
```

Guide writes evidence rows with `artifact_id`, `skill_id`, `level_id`,
`marker_text`, `matched`, and `rationale`. The `artifact_id` links back to the
source artifact in `github_artifacts`, and person filtering follows the join
chain: evidence → artifact → person (via `email` on `github_artifacts`).
Landmark reads them and provides the engineer with Guide's reasoning alongside
each artifact.

### GetDX Snapshot Comments as Engineer Voice

GetDX Snapshots collect two categories of developer input that serve as the
engineer's voice:

1. **Perceptual measures** — how developers feel about tools, workflows, and
   processes. These capture pain, friction, and toil.
2. **Open-ended comments** — free-text responses where developers describe
   blockers, context, and frustrations in their own words.

The `snapshots.comments.list` API returns comments with email, text, and
timestamp. Map ingests these into `activity.getdx_snapshot_comments`. Landmark
surfaces them alongside health and evidence views.

This is the "voice of the engineers" without building a custom write path. GetDX
already asks developers what's blocking them, what they'd most like improved,
and how they experience their engineering environment. Landmark's job is to
connect those voices to the capability and evidence data that explains _why_
they're saying it.

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
  level determines which markers to check).
- Matches markers against existing evidence rows for the person.
- Presents a checklist: `[x] marker text (artifact link)` or `[ ] marker text`.
- Summary: "8/12 markers evidenced. Missing: ..."
- Default target is current level + 1. Override with `--target`.

### Individual growth timeline

Aggregate evidence by quarter per skill to show how a person's evidenced skill
profile evolved over time.

- Groups evidence by `created_at` quarter, `skill_id`, and highest matched
  `level_id`.
- Presents a time-series view: per skill, the highest evidenced level per
  quarter.
- Answers: "Was this person evidencing working-level observability in Q1 and
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

### Growth recommendations in health view

The health view joins objective marker evidence with GetDX snapshot outcomes. It
extends this with actionable recommendations imported from Summit's growth
alignment logic.

When health shows a gap aligned with a poorly-scoring GetDX driver, Landmark
surfaces who could develop that skill and what the team impact would be.

```
$ fit-landmark health --manager alice@example.com

  Platform team — health view

  Driver: reliability (35th percentile, vs_org: -12)
    Contributing skills: incident_response, observability
    Evidence: 0 artifacts for incident_response, 2 for observability
    GetDX comments: "We had two incidents last month with no runbook"
                    "On-call is painful — nobody knows the alerting setup"

    ⮕ Recommendation: Dan (L2) or Carol (L3) could develop incident_response.
      Growing from foundational to working closes the team's critical gap.
      (Summit growth alignment: high impact)

  Driver: cognitive_load (28th percentile, vs_org: -8)
    Contributing skills: technical_debt_management
    Evidence: derived depth 2, evidenced depth 0 — skill exists on paper,
             not practiced
    GetDX comments: "Deploy pipeline takes 45 minutes, nobody wants to touch it"

    ⮕ Recommendation: technical_debt_management is derived but not practiced.
      Bob (L4) holds working level — could mentor Alice or Carol.
      (Summit growth alignment: high impact, outcome-weighted)
```

Implementation: Landmark imports Summit's growth computation as a library
function. Given a team roster and Map data, it returns growth recommendations
ranked by impact. Landmark calls this function and renders recommendations
inline. No service call, no network — same process, same data.

### Engineer voice

Surface GetDX Snapshot comments alongside evidence and health views to give
engineers a voice in the system.

**Voice command group:**

```
$ fit-landmark voice --manager alice@example.com

  Platform team — engineer voice (Snapshot 2024-Q3)

  Most discussed themes:
    Deploy pipeline        4 comments   "45 min deploys", "afraid to deploy"
    On-call experience     3 comments   "no runbooks", "alerting is broken"
    Code review turnaround 2 comments   "PRs sit for days"

  Aligned with health signals:
    reliability driver (35th pctl) ← on-call comments confirm capability gap
    cognitive_load driver (28th pctl) ← deploy pipeline comments confirm friction
```

```
$ fit-landmark voice --email dan@example.com

  Dan's snapshot comments (last 4 snapshots):

  2024-Q3: "On-call last week was rough — no runbook for the payment service"
  2024-Q2: "Would love to learn more about observability tooling"
  2024-Q1: "Build times are getting worse, hard to stay in flow"
  2023-Q4: (no comment)

  Context from evidence:
    Dan has 0 evidence for incident_response, 1 for observability (foundational)
    His comments align with the team's reliability gap.
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

**"What is blocking you?"** GetDX Snapshots ask developers to rank which items
they'd most like to see improved. Combined with open-ended comments, this
provides a structured answer to "what is blocking you?" that Landmark can
present alongside structural capability data. The snapshot's perceptual measures
capture how developers _feel_ about their environment; the comments capture
_why_.

### Initiative impact

Close the full feedback loop: did completed initiatives actually move the scores
they targeted?

```
$ fit-landmark initiative impact --manager alice@example.com

  Completed initiatives — outcome correlation

  "Reduce deploy pipeline time" (completed 2024-Q2)
    Target driver: cognitive_load
    Score before: 28th percentile (2024-Q1 snapshot)
    Score after:  45th percentile (2024-Q3 snapshot)
    Change: +17 percentile points
    Engineer voice: "Deploys are much faster now" (Q3 comment)

  "Establish incident response runbooks" (completed 2024-Q3)
    Target driver: reliability
    Score before: 35th percentile (2024-Q2 snapshot)
    Score after:  (awaiting next snapshot)
    Change: pending

  "Improve code review SLAs" (in progress, 60% complete)
    Target driver: code_review
    Score trend: 52nd → 55th → 58th (improving during initiative)
```

Implementation: join `getdx_initiatives` (with completion dates and linked
scorecard/driver) against `getdx_snapshot_team_scores` across the snapshot
before and after completion. The delta is a simple percentile difference. No
causal claim — just correlation. "The initiative completed and the score moved"
is informative without being misleading.

This closes the full Deming cycle: Analysis → Decision → Action → Outcome →
Analysis.

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
```

The `health` command includes inline growth recommendations from Summit's logic
and representative GetDX Snapshot comments per driver.

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
                         Guide              Landmark ← Summit (growth logic)
                      (interprets)    (presents + recommends)
```

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
| Runtime cost           | Zero — local computation, fully deterministic              |
