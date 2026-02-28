# Plan: Summit Team Capability Tool

Implement Summit as a local CLI tool that aggregates individual skill matrices
from libpathway into team-level capability analysis with coverage, risk
detection, what-if simulation, and growth alignment.

## Architecture

```
summit.yaml (roster)
  │
  ▼
Roster Loader ──→ validate names, job profiles, team membership
  │
  ▼
libpathway ──→ deriveJob() for each person → skill matrices
  │
  ▼
Aggregation Engine ──→ merge individual matrices into team coverage
  │
  ├──→ Coverage Analyzer     (skill depth per team)
  ├──→ Risk Detector         (single points, gaps, concentration)
  ├──→ Scenario Simulator    (what-if roster mutations)
  └──→ Growth Planner        (align gaps to individual growth paths)
  │
  ▼
Formatters ──→ text, json, markdown output
```

The entire pipeline is synchronous, deterministic, and local. No network calls,
no LLM, no database. Input is YAML files; output is formatted text or JSON.

## Package Structure

```
products/summit/
  bin/
    fit-summit.js              CLI entry point
  src/
    roster.js                  Roster loading and validation
    aggregation.js             Team skill matrix aggregation
    coverage.js                Coverage analysis
    risks.js                   Structural risk detection
    scenarios.js               What-if simulation engine
    growth.js                  Growth alignment analysis
    compare.js                 Team comparison
    index.js                   Public API exports
  src/formatters/
    coverage/
      shared.js                Coverage formatting logic
      text.js                  Terminal output
      markdown.js              Markdown output
    risks/
      shared.js
      text.js
      markdown.js
    scenarios/
      shared.js
      text.js
      markdown.js
    growth/
      shared.js
      text.js
      markdown.js
  test/
    roster.test.js
    aggregation.test.js
    coverage.test.js
    risks.test.js
    scenarios.test.js
    growth.test.js
  package.json
```

## Dependency Chain

```
map → libpathway → summit
```

Summit consumes the same derivation engine as Pathway. It calls
`deriveJob(discipline, level, track, data)` for each roster entry and works
with the resulting skill matrices. No new derivation logic is needed in
libpathway.

Summit does **not** depend on Pathway. They are siblings, not parent-child:

```
map → libpathway → pathway
              ↓
           summit
```

## Data Model

### Roster Schema

```yaml
# summit.yaml
teams:
  <team_id>:
    - name: <string>           # display name (required)
      job:                     # Pathway job profile (required)
        discipline: <id>       # from Map disciplines
        level: <id>            # from Map levels
        track: <id>            # from Map tracks (optional)
```

Validation rules:
- All `discipline`, `level`, and `track` values must exist in Map data
- Team names must be unique within the file
- Person names must be unique within a team
- Each team must have at least 1 member

### Internal Structures

**TeamProfile** — the aggregated result for one team:

```js
/**
 * @typedef {Object} TeamProfile
 * @property {string} teamId
 * @property {MemberProfile[]} members
 * @property {SkillCoverage[]} coverage
 * @property {StructuralRisk[]} risks
 */
```

**MemberProfile** — one person's derived skill matrix:

```js
/**
 * @typedef {Object} MemberProfile
 * @property {string} name
 * @property {Object} job - { discipline, level, track }
 * @property {Object} derivedJob - full job from deriveJob()
 * @property {Map<string, string>} skillMatrix - skill_id → proficiency level
 */
```

**SkillCoverage** — one skill's team-level depth:

```js
/**
 * @typedef {Object} SkillCoverage
 * @property {string} skillId
 * @property {string} skillName
 * @property {string} capabilityId
 * @property {number} depth - engineers at working level or above
 * @property {number} maxProficiency - highest proficiency on team (as index)
 * @property {Object} distribution - { awareness: N, foundational: N, working: N, ... }
 */
```

**StructuralRisk** — one identified risk:

```js
/**
 * @typedef {Object} StructuralRisk
 * @property {'single_point' | 'critical_gap' | 'concentration'} type
 * @property {string} skillId
 * @property {string} description
 * @property {string[]} affectedMembers - names (for single_point)
 * @property {string} suggestion
 */
```

## Implementation Phases

### Phase 1: Core Engine

Build the aggregation engine and coverage analysis. This is the foundation
everything else depends on.

#### 1.1 Package Setup

- Create `products/summit/package.json`
- Add to root workspace
- Set up bin entry for `fit-summit`
- Dependencies: `@forwardimpact/map`, `@forwardimpact/libpathway`, `yaml`

#### 1.2 Roster Loader (`roster.js`)

```js
/**
 * Load and validate a Summit roster file.
 * @param {string} filePath - path to summit.yaml
 * @param {Object} data - loaded Map data
 * @returns {{ teams: Map<string, RosterEntry[]> }}
 */
export function loadRoster(filePath, data) { ... }
```

- Parse YAML
- Validate all discipline/level/track references against Map data
- Return structured roster with teams as a Map

#### 1.3 Aggregation Engine (`aggregation.js`)

```js
/**
 * Derive skill matrices for all team members and aggregate into team profile.
 * @param {RosterEntry[]} members - team roster entries
 * @param {Object} data - loaded Map data
 * @returns {TeamProfile}
 */
export function aggregateTeam(members, data) { ... }
```

- Call `deriveJob()` for each member
- Extract skill matrices from derived jobs
- Compute per-skill depth (count of engineers at working+)
- Compute proficiency distribution per skill

#### 1.4 Coverage Analysis (`coverage.js`)

```js
/**
 * Analyze capability coverage for a team.
 * @param {TeamProfile} team
 * @returns {CoverageReport}
 */
export function analyzeCoverage(team) { ... }
```

- Group skills by capability
- Classify each skill: strong (depth >= 3), adequate (2), thin (1), gap (0)
- Return structured report

#### 1.5 Tests

- `roster.test.js` — valid/invalid roster files, reference validation
- `aggregation.test.js` — matrix merging, depth computation
- `coverage.test.js` — classification thresholds, grouping

### Phase 2: Risk Detection

#### 2.1 Risk Detector (`risks.js`)

```js
/**
 * Detect structural risks in team composition.
 * @param {TeamProfile} team
 * @param {Object} data - loaded Map data
 * @returns {RiskReport}
 */
export function detectRisks(team, data) { ... }
```

**Single points of failure:**
- Skills where exactly 1 person holds working level or above
- Severity increases with how critical the skill is to the team's track

**Critical gaps:**
- Skills expected for the team's dominant discipline+track where nobody holds
  working proficiency
- Uses discipline/track skill tiers from Map to determine "expected" skills

**Concentration risks:**
- Three or more people at the same level in the same capability
- Indicates redundancy and potential growth bottleneck

#### 2.2 Tests

- `risks.test.js` — each risk type detected correctly, edge cases (team of 1,
  all same level, all different skills)

### Phase 3: What-If Scenarios

#### 3.1 Scenario Simulator (`scenarios.js`)

```js
/**
 * Simulate a roster change and return before/after comparison.
 * @param {TeamProfile} currentTeam
 * @param {ScenarioAction} action - add, remove, move, promote
 * @param {Object} data - loaded Map data
 * @returns {ScenarioResult}
 */
export function simulateScenario(currentTeam, action, data) { ... }
```

Supported actions:

| Action    | Input                              | Behavior                                   |
| --------- | ---------------------------------- | ------------------------------------------ |
| `add`     | Job profile (discipline/level/track) | Add hypothetical person to team            |
| `remove`  | Person name                        | Remove from team, show impact              |
| `move`    | Person name + target team          | Remove from source, add to target          |
| `promote` | Person name                        | Advance to next level, re-derive           |

For each action:
1. Clone the current team profile
2. Apply the mutation
3. Re-run aggregation and risk detection
4. Diff the before and after states
5. Return changes in coverage, new/resolved risks

#### 3.2 Tests

- `scenarios.test.js` — each action type, no-op scenarios, compound effects

### Phase 4: Growth Alignment

#### 4.1 Growth Planner (`growth.js`)

```js
/**
 * Identify growth opportunities aligned with team needs.
 * @param {TeamProfile} team
 * @param {Object} data - loaded Map data
 * @returns {GrowthReport}
 */
export function planGrowth(team, data) { ... }
```

For each team gap or single point of failure:
1. Identify which team members are closest to closing the gap (highest current
   proficiency below working)
2. Rank by growth distance (how many proficiency levels to gain)
3. Cross-reference with the member's discipline to check whether the growth
   direction is natural for their role

Impact classification:
- **High** — addresses a critical gap
- **Medium** — reduces a single point of failure
- **Low** — strengthens existing coverage

#### 4.2 Tests

- `growth.test.js` — gap matching, distance calculation, impact classification

### Phase 5: Formatters and CLI

#### 5.1 Formatters

Follow the same pattern as Pathway formatters:
- `shared.js` — format-agnostic logic (sorting, grouping, labeling)
- `text.js` — ANSI terminal output with bar charts
- `markdown.js` — Markdown tables and lists

Each view (coverage, risks, scenarios, growth) gets its own formatter directory.

#### 5.2 CLI Entry Point (`bin/fit-summit.js`)

Command routing:

```js
const commands = {
  coverage: coverageCommand,
  risks: risksCommand,
  'what-if': whatIfCommand,
  growth: growthCommand,
  compare: compareCommand,
  roster: rosterCommand,
  validate: validateCommand,
};
```

Global options:
- `--roster <path>` — path to summit.yaml (default: `./summit.yaml`)
- `--data <path>` — path to Map data directory
- `--format <type>` — `text` (default), `json`, `markdown`

#### 5.3 Team Comparison (`compare.js`)

```js
/**
 * Compare capability profiles of two teams.
 * @param {TeamProfile} teamA
 * @param {TeamProfile} teamB
 * @returns {ComparisonReport}
 */
export function compareTeams(teamA, teamB) { ... }
```

Side-by-side coverage comparison highlighting complementary strengths and shared
weaknesses. Useful for identifying cross-team collaboration opportunities or
rebalancing staff between teams.

### Phase 6: Integration

#### 6.1 JSON Output

All commands support `--format json` with stable, documented output schemas.
This enables downstream tooling (dashboards, planning spreadsheets, CI checks)
without Summit needing to know about them.

#### 6.2 Pathway Integration (Optional)

Pathway's `progress` command could reference Summit team context:

```
$ fit-pathway progress se L3 --team platform

  Your career progression: L3 → L4

  Skills to develop:
    estimation            foundational → working   (team needs this — reduces bus factor)
    incident_response     awareness → working      (team gap — high impact growth)
    system_design         working → practitioner   (personal growth — team already covered)
```

This is a presentation-layer enhancement in Pathway, not a code dependency. It
reads Summit's JSON output and annotates Pathway's existing progression view.

## Implementation Order

1. Package setup — `package.json`, workspace registration, bin entry
2. Roster loader — YAML parsing, reference validation against Map data
3. Aggregation engine — individual matrix derivation, team-level merging
4. Coverage analysis — depth computation, capability grouping, classification
5. Coverage formatter — text output with bar charts
6. Risk detection — single points, critical gaps, concentration risks
7. Risk formatter — text output with suggestions
8. CLI entry point — command routing, global options, help text
9. What-if scenarios — add, remove, move, promote actions with diffing
10. Scenario formatter — before/after comparison output
11. Growth alignment — gap-to-member matching, impact classification
12. Growth formatter — opportunity listing with impact labels
13. Team comparison — side-by-side coverage diff
14. JSON and Markdown formatters for all views
15. Validate command — roster validation with clear error messages

## Version and Release

- Initial release: `0.1.0`
- Follow monorepo versioning conventions
- Tag: `summit@v0.1.0`
- Publish to npm as `@forwardimpact/summit`

## What Summit Does Not Do

- **No persistence** — Summit reads YAML, computes, outputs. No database, no
  state files, no caching. Run it again and get the same answer.
- **No LLM calls** — All analysis is deterministic derivation and arithmetic.
- **No GitHub integration** — Roster is maintained by hand or exported from HR.
- **No individual scoring** — Coverage shows team depth, not individual rankings.
- **No historical tracking** — Summit shows current state. Version the roster
  file in git to track changes over time.
- **No web UI** — CLI only for v1. JSON output enables custom UIs if needed.
