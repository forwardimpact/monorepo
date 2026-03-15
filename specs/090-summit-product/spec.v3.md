# Summit v3

Help teams see their collective capability. Help leaders build teams that can
deliver. Now with team trajectory, allocation-aware project teams, and explicit
audience model.

```
@forwardimpact/summit    CLI: fit-summit
```

## Changes from v2

| Change                                                 | Source                                                      | Gaps Closed                                            |
| ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| Add `trajectory` command for team capability over time | Gap analysis v2 Gap 6 (no team health trajectory)           | Team capability evolution visible quarter over quarter |
| Add allocation percentages to project teams            | Gap analysis v2 Gap 7 (cross-functional teams undertreated) | Split-time engineers modeled accurately across teams   |
| Define explicit audience tiers per view                | Gap analysis v2 Gap 2 (privacy model)                       | Right information for right audience                   |
| Export growth logic as importable library function     | Gap analysis v2 Gap 1 (Landmark too passive)                | Landmark can surface growth recommendations inline     |

## Why

| Product      | Question it answers                                      |
| ------------ | -------------------------------------------------------- |
| **Map**      | What does the terrain look like?                         |
| **Pathway**  | Where am I going?                                        |
| **Basecamp** | What do I need day-to-day?                               |
| **Landmark** | What do the signals say — and what should I do about it? |
| **Summit**   | _Can this team reach the peak?_                          |

Map defines skills. Pathway charts individual routes. Basecamp handles daily
ops. Landmark presents signals and recommends actions. But none of them answer
the question engineering leaders ask most often: "Does this team have the
capability to deliver what we need — and is it getting stronger or weaker?"

v2 added practiced capability (derived vs evidenced), outcome-weighted growth,
and project-based teams. These strengthened Summit's point-in-time analysis. But
leaders also need trajectory — is this team improving quarter over quarter, or
slowly eroding?

v3 makes two shifts:

1. **From snapshot to trajectory.** Summit can now show how team coverage
   changed over time as people joined, left, grew, or were promoted. This turns
   Summit from a planning tool into a planning + tracking tool, which is where
   real stickiness lives.

2. **From binary team membership to allocation-aware.** Real engineers split
   time across teams. "Alice is 60% Platform, 40% Migration" changes the
   capability calculus. v3 models allocation percentages so coverage analysis
   reflects how engineers actually work.

## Design Principles

**Teams are systems, not collections.** Unchanged. Summit models the team as a
system with emergent properties from composition.

**Plan forward, don't measure backward.** Extended. Summit still emphasizes
prospective planning, but `trajectory` adds a retrospective dimension: "where
has this team been?" informs "where is it going?" Past trajectory is a planning
input, not a performance metric.

**No required external dependencies.** Unchanged. Core Summit runs locally with
Map data and a roster. Evidence, GetDX data, and trajectory are optional
enhancements.

**Capability, not performance.** Unchanged. Summit describes what a team _can_
do, not how well it's doing it.

**Privacy through aggregation — with audience awareness.** Refined. v3 defines
explicit audiences:

| Audience                     | Views                                                   | Privacy model                                                                     |
| ---------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Engineer**                 | `growth` (own team)                                     | Sees team gaps and which growth directions help — no peer names at other levels   |
| **Manager** (1:1 tool)       | `coverage`, `risks`, `growth`, `trajectory`, `what-if`  | Individual specificity for direct reports — managers already see Pathway profiles |
| **Director** (planning tool) | `coverage`, `risks`, `compare`, `trajectory`, `what-if` | Aggregated team views — named growth recommendations removed at this scope        |

The manager already knows their team. Named growth recommendations ("Dan or
Carol could develop incident_response") are appropriate for 1:1 conversations.
For directors viewing across teams, Summit omits individual names and shows only
structural gaps and coverage counts.

## What

Summit is a CLI tool that reads a team roster and produces capability analysis.
Everything from v1 and v2 is retained.

### Three Views (v1)

1. **Capability coverage** — heatmap of collective proficiency.
2. **Structural risks** — SPOFs, critical gaps, concentration risks.
3. **What-if scenarios** — simulate roster changes before making them.

### v1: Growth Alignment

Connect team needs to individual growth opportunities.

### v2 Additions

4. **Practiced capability** — `--evidenced` flag shows derived vs evidenced
   depth.
5. **Outcome-weighted growth** — `--outcomes` flag weights recommendations by
   GetDX driver scores.
6. **Project-based teams** — team definitions beyond manager hierarchy.

### v3 Additions

7. **Team trajectory** — how team capability coverage changed over time.
8. **Allocation-aware project teams** — model split-time engineers.
9. **Growth logic export** — Summit's growth computation available as an
   importable library function for Landmark.

### Team Roster

Summit reads team composition from one of three sources (unchanged from v2):

1. **Map's unified person model** — `organization_people` table.
2. **Local YAML file** — offline planning and hypothetical scenarios.
3. **Project-based YAML** — cross-functional teams referencing org model.

### v3: Allocation Percentages in Project Teams

```yaml
# summit.yaml — v3 project teams with allocation
projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6                  # 60% on this project
    - email: frank@example.com
      allocation: 1.0                  # full-time
    - email: grace@example.com
      allocation: 0.4                  # 40% on this project
    - name: Ivan
      job: { discipline: se, level: L4, track: platform }
      allocation: 1.0                  # hypothetical full-time member
```

When `allocation` is present, Summit weights that person's contribution to
coverage accordingly. An engineer at 40% allocation contributes less effective
depth than one at 100%. The coverage view reflects this:

```
$ fit-summit coverage --project migration-q2

  Migration Q2 — 4 members (3.0 FTE)

  Capability: Scale
    system_design             ██████████  effective depth: 2.6 at working+
    api_design                ████████░░  effective depth: 2.0 at working+

  Capability: Reliability
    incident_response         ██░░░░░░░░  effective depth: 0.4 at working+
    observability             ████░░░░░░  effective depth: 1.0 at working+
```

Effective depth is the sum of allocations for engineers at working level or
above. When Grace is 40% allocated and holds working-level incident_response,
the project gets 0.4 effective depth — meaning it can't rely on her full-time
for that capability.

**Allocation defaults to 1.0** when omitted. Existing summit.yaml files work
unchanged. Allocation applies only to project teams — reporting teams always
represent full membership.

**Risks with allocation:** Single point of failure analysis considers
allocation. A skill held by one person at 0.4 allocation is a higher risk than
one held by a person at 1.0. The risk view surfaces this:

```
$ fit-summit risks --project migration-q2

  Migration Q2 — structural risks

  Single points of failure:
    incident_response — only Grace (L3, 40% allocated)
    Effective availability: 0.4 FTE. High risk at partial allocation.
```

### Capability Coverage

Unchanged from v1/v2 for reporting teams. For project teams with allocation,
coverage shows effective depth as described above.

### v2: Practiced Capability

Unchanged from v2.

### Structural Risks

Unchanged from v1/v2 for reporting teams. For project teams, risks incorporate
allocation as described above.

### What-If Scenarios

Unchanged from v1. What-if works with project teams and respects allocation:

```
$ fit-summit what-if --project migration-q2 --add "{ discipline: se, level: L3, track: platform }" --allocation 0.5

  Adding an L3 Platform SE (50% allocated) to Migration Q2:

  Capability changes:
    + incident_response         effective depth: 0.4 → 0.9
    + observability             effective depth: 1.0 → 1.5

  Risk changes:
    - incident_response         no longer single point of failure (with redundancy)
```

### Growth Alignment

Unchanged from v1.

### v2: Outcome-Weighted Growth

Unchanged from v2.

### v3: Team Trajectory

Show how team capability coverage evolved over time as the roster changed.

```
$ fit-summit trajectory platform

  Platform team — capability trajectory

  Roster changes:
    2024-Q1: 4 engineers (Dan joined)
    2024-Q2: 5 engineers (Eve joined)
    2024-Q3: 5 engineers (Carol promoted L3 → L4)
    2024-Q4: 4 engineers (Bob departed)

  Coverage evolution:
                          Q1    Q2    Q3    Q4    Trend
    task_decomposition     2     3     3     3     ─
    incident_response      0     0     0     0     ⚠ persistent gap
    system_design          2     4     4     3     ↓ declining (departure)
    capacity_planning      0     1     1     0     ↓ lost (departure)
    observability          1     1     1     1     ─

  Summary:
    Coverage improved Q1→Q2 (Eve's hire filled scale skills).
    Carol's promotion strengthened delivery but didn't address reliability.
    Bob's departure in Q4 created new critical gaps in capacity_planning
    and reduced system_design redundancy.

    Persistent gap: incident_response has been uncovered for 4 quarters.
    Consider prioritizing this in hiring or growth planning.
```

**Data source:** Trajectory requires historical roster snapshots. Summit
computes trajectory from one of two sources:

1. **Map's activity layer** — if Map stores historical `organization_people`
   snapshots (roster at each quarter boundary), Summit reads them directly.
2. **Git history of summit.yaml** — if using a local roster file tracked in
   version control, Summit can read prior versions to reconstruct roster
   changes.

When neither historical source is available, Summit shows current-state only
with a note: "Historical roster data not available. Trajectory requires
quarterly roster snapshots in Map or version-controlled summit.yaml."

**Trajectory with evidence:**

```
$ fit-summit trajectory platform --evidenced

  Coverage evolution (derived / evidenced):
                          Q1        Q2        Q3        Q4
    task_decomposition     2/1       3/2       3/3       3/3    ↑ evidence catching up
    incident_response      0/0       0/0       0/0       0/0    ⚠ persistent gap
    system_design          2/2       4/3       4/4       3/3    ─ practiced
    technical_debt_mgmt    2/0       2/0       2/1       2/1    ~ slowly improving
```

This answers "is this team getting stronger or weaker?" — the question the gap
analysis identified as unanswerable in v2.

### v3: Growth Logic Export

Summit's growth alignment computation is available as an importable library
function for use by Landmark (and potentially other consumers).

```js
// Summit exports this function from its public API
import { computeGrowthAlignment } from '@forwardimpact/summit'

const recommendations = computeGrowthAlignment({
  team,           // array of { email, job }
  mapData,        // Map data (skills, capabilities)
  evidence,       // optional: evidence aggregates
  driverScores,   // optional: GetDX driver scores
})
// Returns: [{ skill, impact, candidates: [{ name, currentLevel, targetLevel }], driverContext? }]
```

This function encapsulates Summit's growth logic: identify team gaps, rank by
impact (critical gap > SPOF reduction > coverage strengthening), match
candidates based on proximity to the target level, and optionally weight by
driver scores.

Landmark imports this function and renders its output inline in the health view.
No service boundary crossed — same process, same data.

## Positioning

```
map → libskill → pathway
              ↓
           summit ──→ (growth logic) ──→ landmark
```

- **Map** defines skills, levels, behaviours — the data model
- **libskill** derives individual job profiles and skill matrices
- **Summit** aggregates individual matrices into team-level analysis
- **Summit → Landmark** exports growth logic for contextual recommendations
- **Pathway** presents individual career progression
- **Summit** presents collective capability, planning, and trajectory

v3 creates a deliberate dependency from Landmark to Summit's growth logic. This
is a one-way export: Summit provides a pure function, Landmark calls it. Summit
does not depend on Landmark.

### Comparison with Landmark

| Dimension        | Landmark                               | Summit                                     |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| **Orientation**  | Retrospective + recommendation         | Prospective + trajectory                   |
| **Input**        | Map activity layer                     | Map unified person model or YAML           |
| **Dependencies** | Map (activity + pure), Summit (growth) | Map + libskill (+ optional activity data)  |
| **Runs where**   | Local CLI                              | Local CLI, instant                         |
| **Focus**        | Individual evidence + team signals     | Team composition + planning                |
| **Output**       | Signals, recommendations, voice        | Coverage, risks, scenarios, trajectory     |
| **Determinism**  | Deterministic (reads evidence)         | Fully deterministic                        |
| **Cost**         | Zero runtime cost                      | Zero runtime cost                          |
| **Privacy**      | Audience-aware (engineer/manager/dir)  | Audience-aware (engineer/manager/dir)      |
| **Question**     | "What do signals say & what to do?"    | "Can this team deliver & is it improving?" |

v3 creates a deliberate overlap: Summit's `trajectory` shows team evolution over
time while Landmark's `timeline` shows individual evidence evolution. Both use
historical data but answer different questions — Landmark tracks what a person
demonstrated, Summit tracks what a team could do.

## Design

### Name, Icon, Emoji, Hero Scene, Visual Language, Taglines

All unchanged from v1.

## CLI

```
Summit — Team capability planning from skill data.

Usage:
  fit-summit coverage <team>                    Show capability coverage
  fit-summit risks <team>                       Show structural risks
  fit-summit what-if <team> [options]           Simulate roster changes
  fit-summit growth <team>                      Show growth alignment
  fit-summit compare <team1> <team2>            Compare two teams
  fit-summit roster                             Show current roster
  fit-summit validate                           Validate roster file

Options:
  --roster <path>         Path to summit.yaml (default: derive from Map org)
  --data <path>           Path to Map data (default: from @forwardimpact/map)
  --format <type>         Output format: text, json, markdown (default: text)

v2 options:
  --evidenced             Include practiced capability from Map evidence data
  --outcomes              Weight growth recommendations by GetDX driver scores
  --project <name>        Use a project team from summit.yaml projects section

v3 commands:
  fit-summit trajectory <team>                  Show team capability over time

v3 options:
  --allocation <pct>      Allocation percentage for --add in what-if (default: 1.0)
  --quarters <n>          Number of quarters to show in trajectory (default: 4)
```

### What-If Options

```
  fit-summit what-if <team> --add "<job>"             Add a hypothetical person
  fit-summit what-if <team> --remove <name>           Remove someone
  fit-summit what-if <team> --move <name> --to <team> Move between teams
  fit-summit what-if <team> --promote <name>          Simulate level promotion
  fit-summit what-if <team> --focus <capability>      Filter to capability

v3:
  fit-summit what-if <team> --add "<job>" --allocation <pct>   Add with allocation
```

### JSON Output

All views support `--format json`. v3 additions to JSON output:

```
$ fit-summit trajectory platform --format json
{
  "team": "platform",
  "quarters": [
    {
      "quarter": "2024-Q1",
      "members": 4,
      "rosterChanges": [{ "type": "join", "name": "Dan" }],
      "coverage": {
        "task_decomposition": { "depth": 2 },
        "incident_response": { "depth": 0 },
        "system_design": { "depth": 2 }
      }
    }
  ],
  "persistentGaps": ["incident_response"],
  "trends": {
    "system_design": "declining",
    "incident_response": "persistent_gap"
  }
}
```

```
$ fit-summit coverage --project migration-q2 --format json
{
  "team": "migration-q2",
  "type": "project",
  "members": 4,
  "effectiveFte": 3.0,
  "coverage": {
    "system_design": { "derivedDepth": 3, "effectiveDepth": 2.6 },
    "incident_response": { "derivedDepth": 1, "effectiveDepth": 0.4 }
  }
}
```

## Summary

| Attribute     | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Package       | `@forwardimpact/summit`                                  |
| CLI           | `fit-summit`                                             |
| Delivery      | Local CLI tool, npm package                              |
| Icon          | Mountain peak with flag                                  |
| Emoji         | ⛰️                                                       |
| Hero scene    | "Planning the Ascent"                                    |
| Tagline       | "See your team's capability. Plan the ascent."           |
| Depends on    | `@forwardimpact/map`, `@forwardimpact/libskill`          |
| Input         | Map unified person model or local YAML + Map data        |
| For leaders   | Capability coverage, structural risks, staffing planning |
| For teams     | Growth alignment, what-if scenarios, trajectory          |
| For engineers | Understanding which growth directions help the team      |
| Runtime cost  | Zero — local computation, fully deterministic            |

### v2 additions (unchanged)

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| Practiced capability    | `--evidenced` flag on `coverage` and `risks`              |
| Outcome-weighted growth | `--outcomes` flag on `growth`                             |
| Project teams           | `projects` section in summit.yaml, `--project` CLI flag   |
| Optional dependency     | Map activity layer (evidence, GetDX scores) — opt-in only |

### v3 additions

| Attribute              | Value                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Team trajectory        | `trajectory` command showing coverage evolution over quarters |
| Allocation-aware teams | `allocation` field in project team YAML, effective depth      |
| Growth logic export    | `computeGrowthAlignment` function exported for Landmark       |
| Audience model         | Explicit per-view privacy: engineer, manager, director        |
| Historical data        | Reads quarterly roster snapshots from Map or git history      |
