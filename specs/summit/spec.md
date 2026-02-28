# Summit

Help teams see their collective capability. Help leaders build teams that can
deliver.

```
@forwardimpact/summit    CLI: fit-summit
```

## Why

| Product     | Question it answers                |
| ----------- | ---------------------------------- |
| **Map**     | What does the terrain look like?   |
| **Pathway** | Where am I going?                  |
| **Basecamp** | What do I need day-to-day?        |
| **Summit**  | _Can this team reach the peak?_    |

Map defines skills. Pathway charts individual routes. Basecamp handles daily
ops. But none of them answer the question engineering leaders ask most often:
"Does this team have the capability to deliver what we need?"

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

**Plan forward, don't measure backward.** Landmark looks at past evidence.
Summit looks ahead: what can this team do today, what could it do with different
composition, and what growth would have the most impact? The value is in
decisions not yet made.

**No external dependencies.** Summit uses only Map data and a team roster. No
GitHub App, no webhooks, no Supabase, no LLM calls. It runs locally, instantly,
deterministically. The same inputs always produce the same output.

**Capability, not performance.** Summit describes what a team _can_ do based on
its skill profile — not how well it's doing it. It's a planning tool, not a
monitoring tool. It informs staffing decisions, hiring profiles, and growth
investment — not performance reviews.

**Privacy through aggregation.** The team view shows collective coverage, not
individual shortcomings. When Summit identifies a gap, it's a team gap — a
structural fact about composition, not a judgment about any person. Individual
skill matrices are already visible through Pathway. Summit never creates a new
way to inspect individuals.

## What

Summit is a CLI tool that reads a team roster and produces capability analysis.
Organizations define teams — who's on them, what their Pathway job profiles
are — and Summit derives structural properties of that team's collective skill
coverage.

### Three Views

1. **Capability coverage** — across all skills in the framework, where does
   this team have depth and where does it have gaps? A heatmap of collective
   proficiency.

2. **Structural risks** — single points of failure (skills held by only one
   person at working level or above), critical gaps (skills required at
   practitioner level that nobody holds), and concentration risks (too many
   people at the same level in the same area, creating promotion bottlenecks).

3. **What-if scenarios** — simulate roster changes before making them. "What
   happens if we hire an L4 with platform track?" "What if Alice moves to the
   payments team?" "What if we need to take on a reliability-heavy project?"

### Team Roster

Teams are defined in a YAML file that maps people to their Pathway job profiles
and team membership.

```yaml
# summit.yaml
teams:
  platform:
    - name: Alice
      job: { discipline: se, level: L3, track: platform }
    - name: Bob
      job: { discipline: se, level: L4 }
    - name: Carol
      job: { discipline: se, level: L3, track: platform }
    - name: Dan
      job: { discipline: se, level: L2 }
    - name: Eve
      job: { discipline: se, level: L5, track: platform }

  payments:
    - name: Frank
      job: { discipline: se, level: L3 }
    - name: Grace
      job: { discipline: se, level: L4 }
    - name: Heidi
      job: { discipline: se, level: L2 }
```

No GitHub usernames. No external identifiers. Just names (or pseudonyms) and
job profiles. The roster is a planning document, not an integration point.

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

### Growth Alignment

Summit connects team needs to individual growth opportunities. When a team has
a gap, that gap is a growth opportunity for someone on the team. When someone
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

## Positioning

```
map → libpathway → pathway
              ↓
           summit
```

- **Map** defines skills, levels, behaviours — the data model
- **libpathway** derives individual job profiles and skill matrices
- **Summit** aggregates individual matrices into team-level analysis
- **Pathway** presents individual career progression
- **Summit** presents collective capability and planning scenarios

Summit sits beside Pathway, not above it. Pathway is for the engineer looking
at their own career. Summit is for the leader looking at the team's capability.
Both consume the same derivation engine. Neither depends on the other.

### Comparison with Landmark

| Dimension        | Landmark                       | Summit                          |
| ---------------- | ------------------------------ | ------------------------------- |
| **Orientation**  | Retrospective — past work      | Prospective — future capability |
| **Input**        | GitHub webhook events          | Team roster YAML file           |
| **Dependencies** | GitHub App, Supabase, LLM      | Map + libpathway only           |
| **Runs where**   | Cloud (Edge Functions, pg)     | Local CLI, instant              |
| **Focus**        | Individual evidence            | Team composition                |
| **Output**       | Artifacts with interpretation  | Coverage, risks, scenarios      |
| **Determinism**  | LLM interpretation varies      | Fully deterministic             |
| **Cost**         | Supabase + LLM API costs       | Zero runtime cost               |
| **Privacy**      | Requires GitHub activity access | Names + job profiles only       |
| **Question**     | "What does my work show?"      | "Can this team deliver?"        |

Summit and Landmark are complementary but independent. An organization could use
both, either, or neither. They address fundamentally different concerns:
Landmark is about the trail already walked, Summit is about the peak ahead.

## Design

### Name

**Summit** — the peak a team is trying to reach together. Not individual
achievement — collective capability that enables delivery.

| Product   | Metaphor                 | Provides               |
| --------- | ------------------------ | ---------------------- |
| Map       | The surveyed territory   | Data model             |
| Pathway   | The mountain trail       | Career progression     |
| Basecamp  | The shelter and supplies | Daily operations       |
| Summit    | The mountain peak        | Team capability target |

### Icon: The Peak

Two overlapping mountain peaks, the taller one in front. Clean triangular
shapes with a flag at the top of the tallest peak.

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

| Attribute   | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Metaphor    | Mountain peaks, team ascent, route planning, base camps     |
| Tone        | "See your team's capability. Plan the ascent."              |
| Terrain     | High alpine — above treeline, clear visibility, open views  |
| Empty state | Clouds obscuring the peak — capability not yet assessed     |

### Taglines

- Primary: **"See your team's capability. Plan the ascent."**
- Secondary: "Team capability planning from skill data."
- CTA: "Map your team."

## CLI

All analysis is local and instant. No network calls, no API keys, no cloud
infrastructure. The CLI reads a roster file and Map data, runs derivation
through libpathway, and computes team-level properties.

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
  --roster <path>         Path to summit.yaml (default: ./summit.yaml)
  --data <path>           Path to Map data (default: from @forwardimpact/map)
  --format <type>         Output format: text, json, markdown (default: text)
```

### What-If Options

```
  fit-summit what-if <team> --add "<job>"        Add a hypothetical person
  fit-summit what-if <team> --remove <name>      Remove someone
  fit-summit what-if <team> --move <name> --to <team>   Move between teams
  fit-summit what-if <team> --promote <name>     Simulate level promotion
  fit-summit what-if <team> --focus <capability> Filter analysis to capability
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
| Depends on    | `@forwardimpact/map`, `@forwardimpact/libpathway`        |
| Input         | Team roster YAML file + Map data                         |
| For leaders   | Capability coverage, structural risks, staffing planning |
| For teams     | Growth alignment, what-if scenarios                      |
| For engineers | Understanding which growth directions help the team      |
| Runtime cost  | Zero — local computation, fully deterministic            |
