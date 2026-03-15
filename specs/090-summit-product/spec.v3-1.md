# Summit

Help teams see their collective capability. Help leaders build teams that can
deliver. Team capability planning with practiced capability, outcome-weighted
growth, allocation-aware project teams, trajectory tracking, and exportable
growth logic.

```
@forwardimpact/summit    CLI: fit-summit
```

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

Today, a director staffing a new platform migration mentally inventories who
knows what, guesses at gaps, and hopes for the best. A tech lead wonders whether
losing one person would leave the team unable to ship. An IC planning their
growth doesn't know which skills their team actually needs them to develop.

The data is already there — Pathway derives every engineer's skill matrix from
their discipline, level, and track. Summit aggregates those matrices into a
team-level view and makes capability visible. Not to rank individuals, but to
answer structural questions about the team as a system.

When a team has five backend engineers and zero observability experience, the
question isn't "why don't these engineers know observability?" The question is
"have we staffed this team to succeed?" The skill definitions describe what good
looks like. Summit shows whether the team has it.

## Design Principles

**Teams are systems, not collections.** A team's capability is not the sum of
individual skills. It depends on coverage, depth distribution, redundancy, and
complementarity. Summit models the team as a system with properties that emerge
from composition — not a leaderboard of individual scores.

**Plan forward, don't measure backward.** Summit emphasizes prospective
planning. The `trajectory` command adds a retrospective dimension — "where has
this team been?" informs "where is it going?" — but past trajectory is a
planning input, not a performance metric. Landmark looks at past evidence.
Summit looks ahead.

**No required external dependencies.** Core Summit runs locally with Map data
and a roster. No GitHub App, no webhooks, no Supabase, no LLM calls. It runs
locally, instantly, deterministically. The same inputs always produce the same
output. Evidence and GetDX data are optional enhancements via `--evidenced` and
`--outcomes` flags — Summit remains fully functional without them.

**Capability, not performance.** Summit describes what a team _can_ do based on
its skill profile — not how well it's doing it. It's a planning tool, not a
monitoring tool. It informs staffing decisions, hiring profiles, and growth
investment — not performance reviews.

**Privacy through aggregation — with audience awareness.** The team view shows
collective coverage, not individual shortcomings. When Summit identifies a gap,
it's a team gap — a structural fact about composition, not a judgment about any
person. Individual skill matrices are already visible through Pathway. Summit
never creates a new way to inspect individuals.

Summit defines explicit audiences per view:

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
Organizations define teams — who's on them, what their Pathway job profiles are
— and Summit derives structural properties of that team's collective skill
coverage.

### Team Roster

Summit reads team composition from one of three sources:

1. **Map's unified person model** — `organization_people` table, which carries
   email, name, job profile (`discipline`, `level`, `track`), and
   `manager_email`. Teams are derived from the manager hierarchy. This is the
   primary source for organizations that maintain their people in Map.

2. **Local YAML file** — for offline planning, hypothetical scenarios, or
   organizations not yet using Map's person model.

3. **Project-based YAML** — extends the local YAML format with project teams
   that reference people from the org model by email, with optional allocation
   percentages for split-time engineers.

```yaml
# summit.yaml (local planning file)
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job: { discipline: se, level: L3, track: platform }
    - name: Bob
      email: bob@example.com
      job: { discipline: se, level: L4 }
    - name: Carol
      email: carol@example.com
      job: { discipline: se, level: L3, track: platform }
    - name: Dan
      email: dan@example.com
      job: { discipline: se, level: L2 }
    - name: Eve
      email: eve@example.com
      job: { discipline: se, level: L5, track: platform }

  payments:
    - name: Frank
      email: frank@example.com
      job: { discipline: se, level: L3 }
    - name: Grace
      email: grace@example.com
      job: { discipline: se, level: L4 }
    - name: Heidi
      email: heidi@example.com
      job: { discipline: se, level: L2 }

# Project teams with allocation percentages
projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6                  # 60% on this project
    - email: frank@example.com
      allocation: 1.0                  # full-time
    - email: grace@example.com
      allocation: 0.4                  # 40% on this project
    - name: Ivan                       # external/hypothetical member
      job: { discipline: se, level: L4, track: platform }
      allocation: 1.0
```

When using Map's person model, teams are derived automatically from the manager
hierarchy — no local file needed. When using a local file, email is included so
entries can be cross-referenced with Map data if needed. Project teams in the
`projects` section reference existing team members by email and resolve their
job profiles from the org model or local team definitions.

The local file is a planning document. The unified person model is the source of
truth. Allocation defaults to 1.0 when omitted — existing summit.yaml files work
unchanged. Allocation applies only to project teams — reporting teams always
represent full membership.

### Capability Coverage

For each skill in the framework, Summit computes the team's collective
proficiency by aggregating individual skill matrices derived through Pathway.

```
$ fit-summit coverage platform

  Platform team — 5 engineers

  Capability: Delivery
    task_decomposition        ████████░░  depth: 3 engineers at working+
    incremental_delivery      ████████░░  depth: 3 engineers at working+
    technical_debt_management ██████░░░░  depth: 2 engineers at working+
    estimation                ████░░░░░░  depth: 1 engineer at working+

  Capability: Reliability
    observability             ██░░░░░░░░  depth: 1 engineer at foundational
    incident_response         ░░░░░░░░░░  gap — no engineers at working+
    capacity_planning         ████░░░░░░  depth: 1 engineer at practitioner

  Capability: Scale
    system_design             ██████████  depth: 4 engineers at working+
    api_design                ████████░░  depth: 3 engineers at working+
    performance_engineering   ██░░░░░░░░  depth: 1 engineer at foundational
```

The coverage view answers: "Where are we strong? Where are we thin? Where do we
have nothing at all?"

Depth is not a score — it's a count. "3 engineers at working+" means three
people whose derived skill proficiency is working level or above. This is a
structural fact about team composition.

For project teams with allocation, coverage shows effective depth — the sum of
allocations for engineers at working level or above:

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

When Grace is 40% allocated and holds working-level incident_response, the
project gets 0.4 effective depth — meaning it can't rely on her full-time for
that capability.

### Practiced Capability

When `--evidenced` is passed, coverage displays `evidenced_depth` alongside
`derived_depth` for each skill. Divergence reveals skills that exist on paper
but aren't practiced, or skills practiced beyond what the job profile predicts.

```
$ fit-summit coverage platform --evidenced

  Platform team — 5 engineers (evidence from last 12 months)

  Capability: Delivery
    task_decomposition        derived: 3  evidenced: 3  ✓ practiced
    incremental_delivery      derived: 3  evidenced: 2  ~ 1 without recent evidence
    technical_debt_management derived: 2  evidenced: 0  ✗ not practiced
    estimation                derived: 1  evidenced: 1  ✓ practiced

  Capability: Reliability
    observability             derived: 1  evidenced: 0  ✗ not practiced
    incident_response         derived: 0  evidenced: 0  — gap (both)
    capacity_planning         derived: 1  evidenced: 1  ✓ practiced
```

Summit reads evidence aggregates from Map's activity layer and computes
`evidenced_depth`: the count of engineers with at least one matched evidence row
for that skill at working level or above within a lookback window (default: 12
months).

Divergence between derived and evidenced depth is the key signal:

- `derived > evidenced` — capability exists on paper but isn't practiced.
- `derived == evidenced` — capability is both expected and demonstrated.
- `derived < evidenced` — people practice beyond their profile (growth signal).

### Structural Risks

Summit identifies three categories of structural risk:

**Single points of failure** — skills where exactly one person holds working
level or above. If that person is unavailable, the team loses the capability
entirely.

**Critical gaps** — skills that the team's work likely requires (inferred from
discipline and track) where nobody holds working proficiency. These aren't
obscure skills that don't apply — they're capabilities the team's composition
suggests it needs.

**Concentration risks** — multiple engineers clustered at the same level in the
same capability, creating both redundancy and growth bottlenecks. Three L3s all
strong in delivery but nobody growing toward scale suggests a structural
imbalance.

```
$ fit-summit risks platform

  Platform team — structural risks

  Single points of failure:
    capacity_planning — only Eve (L5) holds practitioner level
    estimation — only Bob (L4) holds working level
    If Eve or Bob are unavailable, these capabilities drop significantly.

  Critical gaps:
    incident_response — no engineer at working level
    The platform track typically requires incident response capability.
    Consider: hiring, cross-training, or borrowing from another team.

  Concentration risks:
    delivery skills — 3 of 5 engineers at L3 working level
    Limited growth headroom in this area. Consider diversifying
    development focus toward reliability or scale skills.
```

When `--evidenced` is passed, risks are assessed against practiced capability. A
skill may not be a single point of failure by derivation (two people hold it)
but becomes one by evidence (only one person actually practices it).

For project teams, risks incorporate allocation. A skill held by one person at
0.4 allocation is a higher risk than one held by a person at 1.0:

```
$ fit-summit risks --project migration-q2

  Migration Q2 — structural risks

  Single points of failure:
    incident_response — only Grace (L3, 40% allocated)
    Effective availability: 0.4 FTE. High risk at partial allocation.
```

### What-If Scenarios

The most powerful view. Summit simulates roster changes and shows their impact
on team capability before anyone makes a decision.

**Adding a person:**

```
$ fit-summit what-if platform --add "{ discipline: se, level: L3 }"

  Adding an L3 Software Engineer to Platform team:

  Capability changes:
    + task_decomposition        depth: 3 → 4 engineers at working+
    + incremental_delivery      depth: 3 → 4 engineers at working+
    = incident_response         still a gap (L3 SE: foundational)

  Risk changes:
    = capacity_planning         still single point of failure
    = incident_response         still a critical gap

  This hire strengthens existing delivery coverage but doesn't address
  the team's structural gaps. Consider a different profile.
```

**Adding a targeted hire:**

```
$ fit-summit what-if platform --add "{ discipline: se, level: L3, track: platform }" --focus reliability

  Adding an L3 Platform Software Engineer (reliability focus) to Platform team:

  Capability changes:
    + observability             depth: 1 → 2 engineers at working+
    + incident_response         gap closed — 1 engineer at working
    + capacity_planning         depth unchanged but redundancy improves

  Risk changes:
    - incident_response         no longer a critical gap
    - capacity_planning         no longer single point of failure (with growth)

  This hire addresses the team's primary structural gap.
```

**Removing a person:**

```
$ fit-summit what-if platform --remove Eve

  Removing Eve (L5 Platform SE) from Platform team:

  Capability changes:
    - system_design             depth: 4 → 3 engineers at working+
    - capacity_planning         depth: 1 → 0 — becomes critical gap
    - api_design                depth: 3 → 2 engineers at working+

  Risk changes:
    + capacity_planning         new critical gap
    + 3 skills become single points of failure

  Eve's departure creates significant capability loss in scale skills.
  The team loses its only practitioner-level capacity planning capability.
```

**Comparing team compositions:**

```
$ fit-summit what-if platform --move Alice --to payments

  Moving Alice (L3 Platform SE) from Platform to Payments:

  Platform impact:
    - system_design             depth: 4 → 3
    - observability             depth: 1 → 0 — becomes gap

  Payments impact:
    + system_design             depth: 1 → 2
    + observability             gap closed — 1 engineer at working

  Net: Payments gains more than Platform loses. Alice's platform track
  skills fill critical gaps in Payments where they were redundant in Platform.
```

What-if works with project teams and respects allocation:

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

Summit connects team needs to individual growth opportunities. When a team has a
gap, that gap is a growth opportunity for someone on the team. When someone
wants to grow in a direction, Summit shows whether the team needs that growth.

```
$ fit-summit growth platform

  Growth opportunities aligned with team needs:

  High impact (addresses critical gaps):
    incident_response — Dan (L2) or Carol (L3) could develop this skill.
    Growing from foundational to working would close the team's critical gap.

  Medium impact (reduces single points of failure):
    capacity_planning — Bob (L4) is closest to developing this skill.
    Growing from working to practitioner would create redundancy for Eve.
    estimation — Alice or Carol could develop this to reduce bus factor.

  Low impact (strengthens existing coverage):
    system_design — already well-covered. Individual growth still valuable
    but team coverage is not a constraint.
```

This view is for 1:1 conversations. An engineer and their manager can look at
what the team needs and align personal growth in a direction that serves both
the individual's career and the team's capability. Nobody is told what to grow
into — the information supports a conversation.

### Outcome-Weighted Growth

When `--outcomes` is passed, growth recommendations incorporate GetDX driver
scores. A gap that also shows a poorly-scoring GetDX driver gets boosted
priority. Managers see both the structural gap and the team's sentiment about
it.

```
$ fit-summit growth platform --outcomes

  Growth opportunities aligned with team needs and outcomes:

  High impact (addresses critical gaps + poor outcomes):
    incident_response — critical gap
      GetDX reliability driver: 35th percentile (vs_org: -12)
      Team feels it: "reliability" is the lowest-scoring driver.
      Dan (L2) or Carol (L3) could develop this skill.

  High impact (strong outcome signal):
    technical_debt_management — derived: 2, evidenced: 0
      GetDX cognitive load driver: 28th percentile (vs_org: -8)
      The team has the skill on paper but doesn't practice it,
      and the GetDX data confirms the pain.

  Medium impact (reduces single points of failure):
    capacity_planning — Bob (L4) is closest to developing this skill.
      GetDX infrastructure driver: 65th percentile — not urgent by outcomes.
```

When `--outcomes` is passed, Summit reads GetDX snapshot scores from Map (via
the activity layer) and driver definitions (which map drivers to contributing
skills via `contributingSkills`). Growth recommendations are weighted by outcome
severity: a gap aligned with a poorly-scoring GetDX driver gets boosted.

### Team Trajectory

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

This answers "is this team getting stronger or weaker?" — the question that
turns Summit from a planning tool into a planning + tracking tool.

### Growth Logic Export

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

Summit sits beside Pathway, not above it. Pathway is for the engineer looking at
their own career. Summit is for the leader looking at the team's capability.
Both consume the same derivation engine. Neither depends on the other.

Summit creates a deliberate dependency from Landmark to Summit's growth logic.
This is a one-way export: Summit provides a pure function, Landmark calls it.
Summit does not depend on Landmark.

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

Summit and Landmark are complementary but independent. An organization could use
both, either, or neither. They address fundamentally different concerns:
Landmark is about the trail already walked, Summit is about the peak ahead.

The same evidence data answers different questions in each product. Landmark
asks "what evidence exists?" Summit asks "does evidence confirm our capability
model?" Summit's `trajectory` shows team evolution over time while Landmark's
`timeline` shows individual evidence evolution.

## Design

### Name

**Summit** — the peak a team is trying to reach together. Not individual
achievement — collective capability that enables delivery.

| Product  | Metaphor                 | Provides               |
| -------- | ------------------------ | ---------------------- |
| Map      | The surveyed territory   | Data model             |
| Pathway  | The mountain trail       | Career progression     |
| Basecamp | The shelter and supplies | Daily operations       |
| Summit   | The mountain peak        | Team capability target |

### Icon: The Peak

Two overlapping mountain peaks, the taller one in front. Clean triangular shapes
with a flag at the top of the tallest peak.

- 24 x 24px grid, 2px padding
- 2px stroke, round caps and joins
- No fill (consistent with Map, Pathway, Basecamp)
- The flag is a small pennant, not a rectangle

**Flat variant:** Single peak with flag. Simplified for favicons and tab bars.

### Emoji

⛰️

### Hero Scene: "Planning the Ascent"

The trio (Engineer, AI Agent, Business Stakeholder) gathered around a map spread
on a rock, looking up at a mountain peak. The Engineer traces a route. The AI
Agent holds a compass. The Stakeholder points at the summit.

Foreground: the planning group, left of center. Background: mountain peak,
right, with multiple possible routes visible as faint trails.

### Visual Language

| Attribute   | Value                                                      |
| ----------- | ---------------------------------------------------------- |
| Metaphor    | Mountain peaks, team ascent, route planning, base camps    |
| Tone        | "See your team's capability. Plan the ascent."             |
| Terrain     | High alpine — above treeline, clear visibility, open views |
| Empty state | Clouds obscuring the peak — capability not yet assessed    |

### Taglines

- Primary: **"See your team's capability. Plan the ascent."**
- Secondary: "Team capability planning from skill data."
- CTA: "Map your team."

## CLI

All analysis is local and instant. No network calls, no API keys, no cloud
infrastructure. The CLI reads team composition from Map's person model or a
local roster file, loads Map data, runs derivation through libskill, and
computes team-level properties.

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
  fit-summit trajectory <team>                  Show team capability over time

Options:
  --roster <path>         Path to summit.yaml (default: derive from Map org)
  --data <path>           Path to Map data (default: from @forwardimpact/map)
  --format <type>         Output format: text, json, markdown (default: text)
  --evidenced             Include practiced capability from Map evidence data
  --outcomes              Weight growth recommendations by GetDX driver scores
  --project <name>        Use a project team from summit.yaml projects section
  --quarters <n>          Number of quarters to show in trajectory (default: 4)
```

When `--roster` is omitted, Summit reads from Map's `organization_people` table
and derives teams from the manager email hierarchy. When `--roster` is provided,
it uses the local YAML file instead. When `--project` is provided, it uses the
named project team from the `projects` section of the roster file.

### What-If Options

```
  fit-summit what-if <team> --add "<job>"             Add a hypothetical person
  fit-summit what-if <team> --remove <name>           Remove someone
  fit-summit what-if <team> --move <name> --to <team> Move between teams
  fit-summit what-if <team> --promote <name>          Simulate level promotion
  fit-summit what-if <team> --focus <capability>      Filter to capability
  fit-summit what-if <team> --add "<job>" --allocation <pct>   Add with allocation
```

### JSON Output

All views support `--format json` for programmatic consumption. This enables
integration with dashboards, planning tools, or custom reporting without Summit
needing to know about them.

```
$ fit-summit risks platform --format json
{
  "team": "platform",
  "members": 5,
  "singlePoints": [
    { "skill": "capacity_planning", "holder": "Eve", "level": "practitioner" }
  ],
  "criticalGaps": [
    { "skill": "incident_response", "requiredLevel": "working", "reason": "platform track" }
  ],
  "concentrationRisks": [
    { "capability": "delivery", "level": "working", "count": 3 }
  ]
}
```

When `--evidenced` is used with `--format json`, output includes both
`derivedDepth` and `evidencedDepth` fields per skill.

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

| Attribute               | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Package                 | `@forwardimpact/summit`                                       |
| CLI                     | `fit-summit`                                                  |
| Delivery                | Local CLI tool, npm package                                   |
| Icon                    | Mountain peak with flag                                       |
| Emoji                   | ⛰️                                                            |
| Hero scene              | "Planning the Ascent"                                         |
| Tagline                 | "See your team's capability. Plan the ascent."                |
| Depends on              | `@forwardimpact/map`, `@forwardimpact/libskill`               |
| Input                   | Map unified person model or local YAML + Map data             |
| For leaders             | Capability coverage, structural risks, staffing planning      |
| For teams               | Growth alignment, what-if scenarios, trajectory               |
| For engineers           | Understanding which growth directions help the team           |
| Runtime cost            | Zero — local computation, fully deterministic                 |
| Practiced capability    | `--evidenced` flag on `coverage` and `risks`                  |
| Outcome-weighted growth | `--outcomes` flag on `growth`                                 |
| Project teams           | `projects` section in summit.yaml, `--project` CLI flag       |
| Allocation-aware teams  | `allocation` field in project team YAML, effective depth      |
| Team trajectory         | `trajectory` command showing coverage evolution over quarters |
| Growth logic export     | `computeGrowthAlignment` function exported for Landmark       |
| Audience model          | Explicit per-view privacy: engineer, manager, director        |
| Historical data         | Reads quarterly roster snapshots from Map or git history      |
| Optional dependency     | Map activity layer (evidence, GetDX scores) — opt-in only     |
