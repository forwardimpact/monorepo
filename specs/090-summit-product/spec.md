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
their discipline, level, and track via libskill (`deriveSkillMatrix`,
`deriveJob`). Summit aggregates those matrices into a team-level view and makes
capability visible. Not to rank individuals, but to answer structural questions
about the team as a system. Note that libskill currently provides only
individual-level derivation — Summit must implement team-level aggregation on
top of these primitives.

When a team has five backend engineers and zero incident response experience,
the question isn't "why don't these engineers know incident response?" The
question is "have we staffed this team to succeed?" The skill definitions
describe what good looks like. Summit shows whether the team has it.

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
      job: { discipline: software_engineering, level: J080, track: platform }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J100 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software_engineering, level: J080, track: platform }
    - name: Dan
      email: dan@example.com
      job: { discipline: software_engineering, level: J060 }
    - name: Eve
      email: eve@example.com
      job: { discipline: software_engineering, level: J120, track: platform }

  payments:
    - name: Frank
      email: frank@example.com
      job: { discipline: software_engineering, level: J080 }
    - name: Grace
      email: grace@example.com
      job: { discipline: software_engineering, level: J100 }
    - name: Heidi
      email: heidi@example.com
      job: { discipline: software_engineering, level: J060 }

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
      job: { discipline: software_engineering, level: J100, track: platform }
      allocation: 1.0
```

Level IDs are framework-defined. The starter data defines `J040` (Level I) and
`J060` (Level II). The examples above assume a richer installation with
additional levels (`J080` Level III, `J100` Level IV, `J120` Level V) to
illustrate multi-level team composition. Installations define their own level
ladder in `levels.yaml`.

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
    task_completion           ████████░░  depth: 3 engineers at working+
    planning                  ██████░░░░  depth: 2 engineers at working+

  Capability: Reliability
    incident_response         ░░░░░░░░░░  gap — no engineers at working+
```

The starter data defines two capabilities (delivery with skills
`task_completion` and `planning`; reliability with skill `incident_response`)
and one discipline (`software_engineering` with core skill `task_completion`,
supporting skill `planning`, broad skill `incident_response`). The examples
throughout this spec assume an installation with a richer skill framework to
illustrate Summit's full analytical power. A minimal starter installation still
benefits from coverage and risk analysis — the value scales with framework
richness.

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

  Capability: Delivery
    task_completion           ██████████  effective depth: 2.6 at working+
    planning                  ████████░░  effective depth: 2.0 at working+

  Capability: Reliability
    incident_response         ██░░░░░░░░  effective depth: 0.4 at working+
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
    task_completion           derived: 3  evidenced: 3  ✓ practiced
    planning                  derived: 2  evidenced: 0  ✗ not practiced

  Capability: Reliability
    incident_response         derived: 0  evidenced: 0  — gap (both)
```

Summit reads evidence aggregates from Map's activity layer (via `getEvidence`
and `getPracticePatterns` from `@forwardimpact/map/activity/queries/evidence`,
which Map publishes from `products/map/src/activity/queries/evidence.js`) and
computes `evidenced_depth`: the count of engineers with at least one matched
evidence row for that skill at working level or above within a lookback window
(default: 12 months). This requires Guide to be writing evidence rows — without
evidence data, `--evidenced` shows all-zero evidenced depths.

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
same capability, creating both redundancy and growth bottlenecks. Three Level
III engineers all strong in delivery but nobody growing toward reliability
suggests a structural imbalance.

```
$ fit-summit risks platform

  Platform team — structural risks

  Single points of failure:
    planning — only Bob (Level IV) holds working level
    If Bob is unavailable, this capability drops significantly.

  Critical gaps:
    incident_response — no engineer at working level
    The platform track lists incident_response as a broad skill.
    Consider: hiring, cross-training, or borrowing from another team.

  Concentration risks:
    delivery skills — 3 of 5 engineers at Level III working level
    Limited growth headroom in this area. Consider diversifying
    development focus toward reliability skills.
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
    incident_response — only Grace (Level IV, 40% allocated)
    Effective availability: 0.4 FTE. High risk at partial allocation.
```

### What-If Scenarios

The most powerful view. Summit simulates roster changes and shows their impact
on team capability before anyone makes a decision.

**Adding a person:**

```
$ fit-summit what-if platform --add "{ discipline: software_engineering, level: J080 }"

  Adding a Level III Software Engineer to Platform team:

  Capability changes:
    + task_completion           depth: 3 → 4 engineers at working+
    + planning                  depth: 2 → 3 engineers at working+
    = incident_response         still a gap (Level III SE: awareness broad skill)

  Risk changes:
    = incident_response         still a critical gap

  This hire strengthens existing delivery coverage but doesn't address
  the team's structural gaps. Consider a different profile.
```

**Adding a targeted hire:**

```
$ fit-summit what-if platform --add "{ discipline: software_engineering, level: J080, track: platform }" --focus reliability

  Adding a Level III Platform Software Engineer (reliability focus) to Platform team:

  Capability changes:
    + incident_response         gap closed — 1 engineer at working
      (platform track modifies incident_response proficiency upward)

  Risk changes:
    - incident_response         no longer a critical gap

  This hire addresses the team's primary structural gap.
```

**Removing a person:**

```
$ fit-summit what-if platform --remove Eve

  Removing Eve (Level V Platform SE) from Platform team:

  Capability changes:
    - task_completion           depth: 3 → 2 engineers at working+
    - planning                  depth: 2 → 1 engineer at working+

  Risk changes:
    + planning                  becomes single point of failure
    + Eve was the highest-level engineer — expert-level coverage lost

  Eve's departure reduces capability depth across all skills.
  The team loses its most senior contributor.
```

**Comparing team compositions:**

```
$ fit-summit what-if platform --move Alice --to payments

  Moving Alice (Level III Platform SE) from Platform to Payments:

  Platform impact:
    - task_completion           depth: 3 → 2
    - planning                  depth: 2 → 1 — becomes single point of failure

  Payments impact:
    + task_completion           depth: 1 → 2
    + incident_response         platform track brings reliability skills

  Net: Payments gains more than Platform loses. Alice's platform track
  skills strengthen Payments where they were redundant in Platform.
```

What-if works with project teams and respects allocation:

```
$ fit-summit what-if --project migration-q2 --add "{ discipline: software_engineering, level: J080, track: platform }" --allocation 0.5

  Adding a Level III Platform SE (50% allocated) to Migration Q2:

  Capability changes:
    + incident_response         effective depth: 0.4 → 0.9
    + task_completion           effective depth: 2.0 → 2.5

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
    incident_response — Dan (Level II) or Carol (Level III) could develop
    this skill. Growing from awareness to working would close the team's
    critical gap. (incident_response is a broad skill for software_engineering;
    platform track modifiers may accelerate it.)

  Medium impact (reduces single points of failure):
    planning — Alice or Carol could develop this to reduce bus factor.
    Currently only Bob holds working level.

  Low impact (strengthens existing coverage):
    task_completion — already well-covered. Individual growth still valuable
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
    planning — derived: 2, evidenced: 0
      GetDX quality driver: 42nd percentile (vs_org: -10)
      Planning is a contributing skill for the quality driver,
      and the GetDX data confirms the pain.
      Dan (Level II) or Carol (Level III) could develop this skill.

  High impact (addresses critical gaps):
    incident_response — critical gap
      No linked driver — outcome weighting not available.
      Dan (Level II) or Carol (Level III) could develop this skill.
```

When `--outcomes` is passed, Summit reads GetDX snapshot scores from Map (via
the activity layer's `getSnapshotScores` query) and driver definitions from
`drivers.yaml` (which map drivers to contributing skills via
`contributingSkills`). Growth recommendations are weighted by outcome severity:
a gap aligned with a poorly-scoring GetDX driver gets boosted.

The starter data defines only one driver (`quality`, contributing skills:
`task_completion`, `planning`). Skills not linked to any driver (like
`incident_response`) still appear in growth recommendations but cannot be
outcome-weighted. Installations should define drivers that cover their key
improvement areas for this feature to reach full value.

### Team Trajectory

Show how team capability coverage evolved over time as the roster changed.

```
$ fit-summit trajectory platform

  Platform team — capability trajectory

  Roster changes:
    2025-Q1: 4 engineers (Dan joined)
    2025-Q2: 5 engineers (Eve joined)
    2025-Q3: 5 engineers (Carol promoted Level III → Level IV)
    2025-Q4: 4 engineers (Bob departed)

  Coverage evolution:
                          Q1    Q2    Q3    Q4    Trend
    task_completion        2     3     3     2     ↓ declining (departure)
    planning               1     2     2     1     ↓ declining (departure)
    incident_response      0     0     0     0     ⚠ persistent gap

  Summary:
    Coverage improved Q1→Q2 (Eve's hire added depth across all skills).
    Carol's promotion strengthened delivery but didn't address reliability.
    Bob's departure in Q4 reduced planning to single point of failure.

    Persistent gap: incident_response has been uncovered for 4 quarters.
    Consider prioritizing this in hiring or growth planning.
```

**Data source:** Trajectory requires historical roster snapshots. Summit
computes trajectory from one of two sources:

1. **Map's activity layer** — if Map stores historical `organization_people`
   snapshots (roster at each quarter boundary), Summit reads them directly.
   Map's `src/activity/queries/snapshots.js` module exists and exports
   `listSnapshots`, `getSnapshotScores`, `getItemTrend`, and
   `getSnapshotComparison`, but those functions cover GetDX snapshot scores, not
   roster history. Historical roster snapshots would require either a new table
   (e.g. `activity.organization_people_history`) and a matching query module, or
   a temporal extension to `organization_people` itself.
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
    task_completion        2/1       3/2       3/3       2/2    ↑ evidence catching up
    planning               1/0       2/0       2/1       1/1    ~ slowly improving
    incident_response      0/0       0/0       0/0       0/0    ⚠ persistent gap
```

This answers "is this team getting stronger or weaker?" — the question that
turns Summit from a planning tool into a planning + tracking tool.

### Roster Management

Two housekeeping commands support roster workflows:

**`roster`** — Show the current roster as Summit sees it. When using Map's
person model, displays the team hierarchy derived from `manager_email`. When
using a local YAML file, displays the parsed teams and project teams with member
counts, level distribution, and track coverage.

```
$ fit-summit roster

  Source: summit.yaml

  Teams:
    platform     5 members  (1× Level V, 1× Level IV, 2× Level III, 1× Level II)
    payments     3 members  (1× Level IV, 1× Level III, 1× Level II)

  Projects:
    migration-q2  4 members  (3.0 effective FTE)
```

**`validate`** — Validate the roster file against the framework data. Checks
that discipline, level, and track values reference defined entities in Map data.
Reports mismatches (e.g., a level ID that doesn't exist in `levels.yaml`) so
users catch configuration errors before running analysis.

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

- **Map** defines skills, levels, behaviours — the data model. Source under
  `products/map/src/`, with the public API published via the `exports` map in
  `products/map/package.json` (spec 390 layout).
- **libskill** derives individual job profiles and skill matrices. Current
  exports from `libraries/libskill/src/index.js`: `deriveSkillMatrix`,
  `deriveJob`, `deriveBehaviourProfile`, `getNextLevel`,
  `analyzeLevelProgression`, `calculateJobMatch`, plus the rest of the
  derivation/matching/progression/agent surface — all individual-level. No team
  aggregation exists in libskill.
- **Summit** aggregates individual matrices into team-level analysis. This is
  new logic that Summit must implement — it is not a wrapper around an existing
  libskill function.
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

## Empty States and Error Behavior

Summit must handle missing or sparse data gracefully. Each view should
communicate what is absent and why, rather than showing empty tables or failing
silently.

| Condition                                        | Behavior                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No roster source available                       | "No roster found. Provide --roster path or configure Map's organization_people table."                                                                       |
| Roster references unknown discipline/level/track | `validate` reports each mismatch: "{value} is not defined in {file}." Other commands warn but proceed with what they can resolve.                            |
| Team has only 1 skill in framework               | Coverage and risks work correctly but output is sparse. No error — the view reflects what the framework defines.                                             |
| `--evidenced` with no evidence data              | Evidenced depth shows 0 for all skills, with a note: "No evidence data found. Evidenced depth reflects Guide-interpreted artifacts only."                    |
| `--outcomes` with no GetDX snapshots             | "No GetDX snapshot data available. Growth recommendations shown without outcome weighting." Falls back to structural-only ranking.                           |
| `--outcomes` with no matching drivers            | Skills without a linked driver show "no driver linked — outcome weighting not available." Ranking proceeds for skills that do have drivers.                  |
| `trajectory` with no historical data             | "Historical roster data not available. Showing current-state only. Trajectory requires quarterly roster snapshots in Map or version-controlled summit.yaml." |
| `what-if --remove` references unknown name       | "No team member named {name} found in {team}."                                                                                                               |
| `what-if --add` with invalid job fields          | "Invalid job profile: {field} is not defined in Map data."                                                                                                   |
| Team has 0 members                               | "Team {name} has no members. Add members to the roster or check the manager email hierarchy."                                                                |

The principle: always explain the empty state in terms the user can act on —
name the missing data source and how to populate it.

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

**`--project` flag scope:** `--project` replaces the `<team>` argument. It is
supported on all commands that accept a team:

| Command      | `--project` support | Notes                                                                                   |
| ------------ | ------------------- | --------------------------------------------------------------------------------------- |
| `coverage`   | Yes                 | Shows effective depth (allocation-weighted) instead of headcount depth                  |
| `risks`      | Yes                 | Risk assessment incorporates allocation — partial allocation increases risk severity    |
| `what-if`    | Yes                 | `--allocation` flag available for hypothetical additions                                |
| `growth`     | Yes                 | Growth candidates drawn from project members only                                       |
| `compare`    | Yes                 | Can compare a project team against a reporting team or another project                  |
| `trajectory` | No                  | Project teams are ephemeral by nature — trajectory tracks reporting teams over quarters |
| `roster`     | Yes                 | Shows project team members with allocation percentages                                  |
| `validate`   | Yes                 | Validates that project member emails resolve to known people                            |

### What-If Options

```
  fit-summit what-if <team> --add "<job>"             Add a hypothetical person (e.g. "{ discipline: software_engineering, level: J080 }")
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
    { "skill": "planning", "holder": "Bob", "level": "working" }
  ],
  "criticalGaps": [
    { "skill": "incident_response", "requiredLevel": "working", "reason": "broad skill for software_engineering" }
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
      "quarter": "2025-Q1",
      "members": 4,
      "rosterChanges": [{ "type": "join", "name": "Dan" }],
      "coverage": {
        "task_completion": { "depth": 2 },
        "planning": { "depth": 1 },
        "incident_response": { "depth": 0 }
      }
    }
  ],
  "persistentGaps": ["incident_response"],
  "trends": {
    "planning": "declining",
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
    "task_completion": { "derivedDepth": 3, "effectiveDepth": 2.6 },
    "incident_response": { "derivedDepth": 1, "effectiveDepth": 0.4 }
  }
}
```

## Starter Data Philosophy

The monorepo's starter data (`products/map/starter/`) is a scaffold — it
demonstrates the schema and validates the pipeline, but it is not a demo of
Summit's analytical depth. The starter defines 2 levels (`J040` Level I, `J060`
Level II), 3 skills across 2 capabilities, 1 driver, and 1 discipline.

Summit's value scales with framework richness. An installation with 5 levels, 20
skills across 6 capabilities, and multiple disciplines will see detailed
coverage heatmaps, meaningful risk analysis, and rich what-if scenarios. The
minimal starter is intentional: it forces installations to own their framework
definitions rather than cargo-culting examples. Summit works correctly with the
starter — coverage and risk views are accurate, just sparse.

Getting-started documentation for external users should set this expectation
clearly: install Summit, define your roster, then author your framework data.
The
[Authoring Frameworks guide](website/docs/guides/authoring-frameworks/index.md)
covers vocabulary standards.

## Implementation Prerequisites

Summit depends on existing infrastructure and requires new work. This section
tracks what exists and what must be built.

**Existing infrastructure (ready to consume):**

- **Map data loader** (`@forwardimpact/map` `createDataLoader`, exported from
  `products/map/src/loader.js` via the package's `exports` map) — loads
  capabilities, disciplines, tracks, levels, drivers, behaviours from YAML.
  Map's package layout follows spec 390: all source lives under `src/`, and
  consumers import via subpath aliases like
  `@forwardimpact/map/activity/queries/org`.
- **libskill derivation** (`@forwardimpact/libskill`) — `deriveSkillMatrix`,
  `deriveJob`, `deriveBehaviourProfile`, `getNextLevel`,
  `analyzeLevelProgression`, `calculateJobMatch`, and additional
  individual-level functions exported from `libraries/libskill/src/index.js`.
  Version 4.1.7. All exports operate on a single person — there is no team-level
  aggregation.
- **Map activity queries** — `getOrganization`, `getTeam`, `getPerson` (for
  roster from Map), `getEvidence`, `getPracticePatterns` (for `--evidenced`),
  `getSnapshotScores`, `listSnapshots`, `getItemTrend`, `getSnapshotComparison`
  (for `--outcomes` and trend views), `getArtifacts`, `getUnscoredArtifacts`
  (for coverage). All four query modules are published as subpath exports under
  `@forwardimpact/map/activity/queries/*`.
- **Map activity ingest** — Specs 350 and 380 delivered the end-to-end ELT
  pipeline. The CLI exposes
  `fit-map activity {start,stop,status,migrate,transform,verify,seed}`,
  `fit-map people {validate,push}`, and `fit-map getdx sync`. Internal
  contributors can populate the activity database from synthetic data with
  `fit-map activity seed`. Summit consumes whatever those commands have
  populated; Summit itself does not ingest data.
- **Starter data** — `software_engineering` discipline (core: `task_completion`,
  supporting: `planning`, broad: `incident_response`), `platform` and
  `forward_deployed` tracks, 2 levels (`J040` Level I, `J060` Level II), 2
  capabilities (`delivery`, `reliability`), 1 driver (`quality`, contributing
  skills `task_completion` and `planning`), 1 behaviour (`systems_thinking`). No
  markers defined on any starter capability — see spec 080 for the marker
  prerequisite shared with Landmark.

**New work Summit must implement:**

| Component              | What it enables                   | Notes                                                                                                                                                                                                                                                |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team aggregation logic | `coverage`, `risks`, all commands | Iterate roster, call `deriveSkillMatrix` per person, aggregate into team-level coverage/depth counts. This is Summit's core contribution — libskill has no team-level functions.                                                                     |
| Risk detection         | `risks`                           | Single point of failure detection, critical gap identification, concentration risk analysis. Pure logic over aggregated data.                                                                                                                        |
| What-if simulation     | `what-if`                         | Clone roster, apply mutation (add/remove/move/promote), re-aggregate, diff.                                                                                                                                                                          |
| Growth alignment       | `growth`, export for Landmark     | Identify team gaps, rank by impact, match candidates. Export as `computeGrowthAlignment`.                                                                                                                                                            |
| Roster loader          | All commands                      | Load from Map org model (via `@forwardimpact/map/activity/queries/org`) or local YAML. The YAML format is defined in this spec but no parser exists yet, and no example file exists in the monorepo — Summit will need to ship one with the package. |
| Trajectory tracking    | `trajectory`                      | Requires either historical roster snapshots from Map (not yet supported) or git history parsing of summit.yaml.                                                                                                                                      |

**Starter data gaps (not blockers but reduce demo value):**

- Only 2 levels defined — most examples assume 5. Installations needing richer
  analysis should define additional levels in `levels.yaml`.
- Only 3 skills across 2 capabilities — coverage/risk views are sparse with
  minimal data. The starter is intentionally minimal; installations define their
  own framework.
- Only 1 driver — `--outcomes` flag has limited value without additional driver
  definitions.
- No markers defined — `--evidenced` depends on Guide writing evidence, which
  depends on markers (spec 080 prerequisite).

**Cross-product dependencies:**

| Dependency                      | Required for                       | Status                                                                                  |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| Landmark (spec 080)             | Consuming `computeGrowthAlignment` | Draft — Summit should ship first since Landmark depends on it                           |
| Guide evidence writing          | `--evidenced` flag                 | Guide can interpret artifacts independently of Summit                                   |
| Map historical roster snapshots | `trajectory` from Map source       | Not yet supported — would need a new query/table on top of the current activity schema  |
| Map activity layer ingest       | All Map-sourced commands           | Implemented (specs 350 + 380) — populated via `fit-map activity seed` or real ETL paths |

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
| New logic required      | Team aggregation, risk detection, what-if sim, growth export  |
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
| Starter data gaps       | 2 levels, 3 skills, 1 driver — minimal but functional         |
| Implementation order    | Summit before Landmark (Landmark imports growth logic)        |
