# Landmark v3

Thin analysis of engineering-system signals from Map — now a decision engine,
not just a dashboard. Surfaces recommendations, engineer voice, initiative
impact, and cross-product insights.

```
@forwardimpact/landmark    CLI: fit-landmark
```

## Changes from v2

| Change                                               | Source                                           | Gaps Closed                                              |
| ---------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Surface Summit growth recommendations in health view | Gap analysis v2 Gap 1 (too passive)              | Landmark becomes a decision engine, not just a dashboard |
| Add engineer voice via GetDX Snapshot comments       | Gap analysis v2 Gap 3 (no engineer voice)        | Engineers speak through the system, not just about them  |
| Add `initiative impact` view                         | Gap analysis v2 Gap 5 (incomplete feedback loop) | Full action-to-outcome loop: initiative → score change   |
| Define explicit audience tiers per view              | Gap analysis v2 Gap 2 (privacy model)            | Right information for right audience                     |
| Add `voice` command group                            | Gap analysis v2 Gap 3                            | Snapshot comments surfaced alongside evidence and health |

## Why

Landmark answers one question: **what do the signals say about how engineering
is functioning — and what should we do about it?**

v2 made Landmark a comprehensive read-only view: evidence, readiness, timelines,
initiatives, coverage. But a dashboard that shows problems without suggesting
actions is a dashboard managers check occasionally, not a tool that changes how
they lead.

v3 makes three shifts:

1. **From presentation to recommendation.** When Landmark shows a gap with a
   poor driver score, it now says what Summit would suggest — "Dan or Carol
   could develop incident_response." The architectural purity of "Landmark only
   reads" was costing user impact. No LLM calls needed — Landmark imports
   Summit's growth logic directly.

2. **From talking about engineers to talking with them.** GetDX Snapshots
   already capture the engineer's voice — open-ended comments where developers
   describe blockers, frustrations, and context. Landmark surfaces these
   comments alongside health and evidence views. The system no longer only talks
   _about_ engineers; it amplifies what they're _saying_.

3. **From analysis-to-action to full loop.** v2 added initiative tracking. v3
   closes the second half: did completed initiatives actually move the scores
   they targeted? A join between initiative completion timestamps and snapshot
   score deltas — no LLM needed.

Key simplification remains unchanged:

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

## Audience Model

v3 defines explicit audiences per view. The privacy model matches the audience,
not a blanket aggregation rule.

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

Everything from v1 and v2, plus:

- **v3:** Import Summit's growth alignment logic to surface recommendations
  inline in health views.
- **v3:** Read GetDX Snapshot comments from Map for engineer voice views.
- **v3:** Compute initiative impact by joining initiative completion dates to
  snapshot score deltas.
- **v3:** Apply audience-appropriate privacy to all views.

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

Landmark consumes everything from v1 and v2, plus:

### v3 additions

- `activity.getdx_snapshot_comments` (new table, from GetDX
  `snapshots.comments.list` API)
  - `snapshot_id` (FK to `getdx_snapshots`)
  - `email` (respondent)
  - `text` (open-ended comment)
  - `timestamp`
  - `team_id` (FK to `getdx_teams`, derived from respondent's team membership)
- Summit's growth alignment logic (imported as a library dependency, not a
  service call — Summit's team gap analysis and growth candidate matching run
  locally)
- Driver-to-snapshot-score delta computation (join `getdx_initiatives`
  completion dates against `getdx_snapshot_team_scores` across snapshots)

### Existing contracts (v1 + v2, unchanged)

- `activity.organization_people` (unified person model)
- `activity.getdx_teams`, `activity.getdx_snapshots`,
  `activity.getdx_snapshot_team_scores`
- `activity.github_events`, `activity.github_artifacts`
- `activity.evidence` (written by Guide)
- `activity.getdx_initiatives` (v2)
- Marker definitions from Map capability YAML
- Driver definitions from Map (`drivers.yaml`)
- libskill derivation logic (v2)

Team semantics unchanged: a team is defined by a manager email.

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

### Markers

Unchanged from v1. Markers are concrete, observable indicators of a skill at a
proficiency level, living in Map's capability YAML files.

### Evidence Pipeline

Unchanged from v1.

```
GitHub Events → Map (storage) → extraction → github_artifacts
                                                │
                                         Guide (interprets)
                                                │
                                         activity.evidence
                                                │
                                         Landmark (presents + recommends)
```

## Product Behavior

### Organization views

Unchanged from v1.

### Snapshot views

Unchanged from v1.

### Marker evidence views

Unchanged from v1.

### Trend views

Unchanged from v1.

### v2: Promotion readiness view

Unchanged from v2.

### v2: Individual growth timeline

Unchanged from v2.

### v2: Initiative tracking

Unchanged from v2.

### v2: Evidence coverage metrics

Unchanged from v2.

### v2: Practiced capability view

Unchanged from v2.

### v3: Growth recommendations in health view

The health view joins objective marker evidence with GetDX snapshot outcomes. v3
extends it with actionable recommendations imported from Summit's growth
alignment logic.

When health shows a gap aligned with a poorly-scoring GetDX driver, Landmark now
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

This crosses the v1/v2 architectural boundary where "Landmark only presents."
The boundary was costing user impact. Recommendations are deterministic (no
LLM), computed from the same data Landmark already reads, and rendered in
context where the manager needs them. The alternative — telling the manager to
switch to Summit — loses context and breaks flow.

### v3: Engineer voice

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
it now includes representative comments from the team's snapshot responses (as
shown in the health example above). Comments are matched to drivers via the
snapshot structure — each comment is associated with the driver/factor context
in which it was submitted.

**"What is blocking you?"** GetDX Snapshots ask developers to rank which items
they'd most like to see improved. Combined with open-ended comments, this
provides a structured answer to "what is blocking you?" that Landmark can
present alongside structural capability data. The snapshot's perceptual measures
capture how developers _feel_ about their environment; the comments capture
_why_.

### v3: Initiative impact

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
Analysis. v2 closed the first half (analysis → action via initiative tracking).
v3 closes the second half (action → outcome via score delta).

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

v2 commands:
  fit-landmark readiness --email <email> [--target <level>]
  fit-landmark timeline --email <email> [--skill <skill_id>]
  fit-landmark initiative list [--manager <email>]
  fit-landmark initiative show --id <id>
  fit-landmark coverage --email <email>
  fit-landmark practiced --manager <email>

v3 commands:
  fit-landmark voice --manager <email>
  fit-landmark voice --email <email>
  fit-landmark initiative impact [--manager <email>]
```

v3 changes to existing commands:

- `health` now includes inline growth recommendations from Summit's logic and
  representative GetDX Snapshot comments per driver.

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

Landmark is no longer purely a presentation layer. v3 imports Summit's growth
alignment computation to surface recommendations inline. This is a deliberate
architectural choice: the user impact of contextual recommendations outweighs
the elegance of strict separation.

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

| Attribute     | Value                                         |
| ------------- | --------------------------------------------- |
| Package       | `@forwardimpact/landmark`                     |
| CLI           | `fit-landmark`                                |
| Role          | Analysis and recommendation layer on Map      |
| Survey source | GetDX (external platform)                     |
| Data store    | Map (single source of truth)                  |
| Org model     | Unified person model (email PK, job profiles) |
| Team model    | Derived from manager email subtree            |

### v2 additions (unchanged)

| Attribute         | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| Readiness view    | Marker checklist against next-level requirements          |
| Timeline view     | Quarterly evidence aggregation per skill per person       |
| Initiative views  | GetDX Initiatives via Map, linked to health view          |
| Coverage metrics  | Interpreted/total artifact ratio per person               |
| Practiced view    | Evidenced depth alongside derived depth per team skill    |
| New dependency    | libskill derivation (for readiness marker resolution)     |
| New data contract | `activity.getdx_initiatives` (from GetDX Initiatives API) |

### v3 additions

| Attribute              | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Growth recommendations | Summit growth logic imported, surfaced inline in health      |
| Engineer voice         | GetDX Snapshot comments surfaced via `voice` command group   |
| Initiative impact      | Score delta before/after initiative completion               |
| Audience model         | Explicit per-view privacy: engineer, manager, director       |
| New dependency         | Summit growth alignment logic (library import)               |
| New data contract      | `activity.getdx_snapshot_comments` (from GetDX comments API) |
