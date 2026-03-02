# Landmark

Help engineers see their own growth. Help organizations improve the systems that
support it.

```
@forwardimpact/landmark    CLI: fit-landmark
```

## Why

| Product      | Question it answers                |
| ------------ | ---------------------------------- |
| **Map**      | What does the terrain look like?   |
| **Pathway**  | Where am I going?                  |
| **Guide**    | How do I get there?                |
| **Basecamp** | What do I need day-to-day?         |
| **Landmark** | _What does my work actually show?_ |

Map defines skills. Pathway charts the route through them. Guide coaches.
Basecamp handles daily ops. But none of them connect the work engineers already
do back to the framework that describes what good looks like.

The evidence is already there — in pull requests, code reviews, design
documents, architecture decisions. Landmark makes it visible. Not to judge
individuals, but to help engineers reflect on their own growth and to help
organizations see whether their engineering systems create the conditions for
that growth to happen.

When nobody on a team produces design trade-off documentation, the question
isn't "why aren't these engineers doing this?" The question is "does our process
give engineers the time, the templates, the examples, and the review culture to
do this well?" The skill definition describes what good looks like. The landmark
is the evidence on the ground that tells you whether the system supports it.

## Design Principles

These aren't guardrails bolted onto an inspection tool. They are the
architecture.

**Engineers own their evidence.** Landmark's primary user is the engineer. They
see their own work reflected against the framework. They decide what to share,
when, and with whom. Self-reflection is the default mode — everything else
requires the engineer's participation.

**Improve the system, not the individual.** When a skill shows weak evidence
across a team, the cause is almost always in the process — not enough time for
design work, no examples to follow, no review culture that values it. Landmark
surfaces patterns that point to system improvements. Individual evidence exists
to support the engineer's own growth, not to produce scorecards for management.

**GitHub is one window, not the whole picture.** A great deal of engineering
skill is invisible on GitHub: the hallway conversation that prevented a bad
design, the quiet mentoring that doesn't happen in PR comments, the decision not
to build something. Landmark sees artifacts. It does not see the full practice.
The framework captures both — Landmark captures what it can, and makes no claim
about the rest.

**Show the work, not a score.** Evidence is presented as artifacts with context
— "here is a PR where you documented trade-offs" — not as a filled progress bar.
Numbers invite gaming. Narratives invite reflection.

## What

Landmark is a GitHub App. Organizations install it on their GitHub Organization,
and it collects engineering activity — pull requests, reviews, commits,
discussions. Guide then reads that activity against skill markers from the
framework, producing two views:

1. **Personal evidence** — an engineer's own work, reflected against the markers
   for their role. Self-directed. The engineer explores their own artifacts and
   sees which practices show up in their work.

2. **Practice patterns** — team-level and organization-level views of which
   engineering practices show strong evidence and which don't. This is where
   process improvement starts. Nobody is named — the patterns describe the
   system, not the people in it.

### Organization

To connect GitHub activity to the framework, Landmark reads an **organization**
— a flat list of people that maps GitHub usernames to Pathway job definitions
and line managers. Organizations export this from their HR system or maintain it
by hand.

```yaml
# organization.yaml
- github: alice
  name: Alice Smith
  job: { discipline: se, level: L3, track: platform }
  manager: carol
- github: bob
  name: Bob Jones
  job: { discipline: se, level: L4 }
  manager: carol
- github: carol
  name: Carol Davis
  job: { discipline: em, level: L4 }
  manager: dave
- github: dave
  name: Dave Wilson
  job: { discipline: em, level: L5 }
```

Each person links to their line manager by GitHub username. This single link
builds the full organizational hierarchy — Carol manages Alice and Bob, Dave
manages Carol. A team is not a separate entity. A team is a manager and their
direct reports. Carol's team is Alice and Bob. Dave's team is Carol (and
transitively, Carol's reports).

The organization tells Landmark what skill profile to reflect against. Alice is
an L3 Software Engineer on the platform track — Pathway derives her skill
expectations, and Landmark shows her the evidence in her own GitHub activity
that relates to those expectations.

Agents appear in the organization the same way. A bot account maps to an agent
profile, and the same markers apply to its PRs.

Map defines the schema for organization data. Landmark owns the data itself —
the actual people, their jobs, and their reporting lines are
installation-specific and live in Landmark's database, synced from the YAML
file.

### Repositories

Landmark tracks which GitHub repositories the organization works in.
Repositories can optionally be tagged with the capability areas they exercise.
This lets Guide reason about what kind of work happens where without needing
markers on every PR.

```yaml
# repositories.yaml
- id: org/platform-core
  capabilities: [scale, reliability]
- id: org/checkout-service
  capabilities: [delivery]
- id: org/design-system
```

The `capabilities` mapping is optional — not all repos need to be tagged.
Untagged repos still produce artifacts and evidence; they just lack the
capability signal that helps Guide connect repository activity to specific
skill areas.

When capability tags are present, Guide can infer context: "Alice works mostly
in platform-core, which exercises scale and reliability capabilities." This
complements the explicit marker-based interpretation with structural context
about where work happens.

Map defines the schema for repository data. Like organization data, the actual
repository list is installation-specific and lives in Landmark.

### Surveys

Landmark accepts developer experience survey results as structured data input.
Surveys measure how engineers perceive the productivity drivers already defined
in Map — the same drivers that link to contributing skills and behaviours.

A survey defines the instrument:

```yaml
# surveys/2026-q1.yaml
id: 2026_q1
name: Q1 2026 Developer Experience Survey
period:
  start: 2026-01-01
  end: 2026-03-31
scale:
  min: 1
  max: 5
  labels:
    1: Strongly Disagree
    2: Disagree
    3: Neutral
    4: Agree
    5: Strongly Agree
```

Survey results are aggregate Likert scores per team per driver. Individual
responses stay anonymous — Landmark only sees team-level aggregation. The team
key points to a manager in the organization, whose direct reports form the
team:

```yaml
# survey-results/2026-q1.yaml
survey: 2026_q1
results:
  - manager: carol
    respondents: 8
    ratings:
      clear_direction:      { mean: 4.1, distribution: [0, 1, 1, 3, 3] }
      say_on_priorities:    { mean: 3.2, distribution: [1, 2, 2, 2, 1] }
      requirements_quality: { mean: 2.4, distribution: [2, 3, 2, 1, 0] }
      ease_of_release:      { mean: 4.3, distribution: [0, 0, 1, 3, 4] }
  - manager: dave
    respondents: 14
    ratings:
      clear_direction:      { mean: 3.8, distribution: [0, 2, 4, 5, 3] }
      requirements_quality: { mean: 3.1, distribution: [1, 3, 4, 4, 2] }
```

The `distribution` array gives the count of responses at each scale point
(1 through 5), preserving the shape of opinion without individual attribution.

This is where surveys and Landmark evidence meet. Guide can traverse from a
weak survey score on `requirements_quality` to the contributing skills
(`stakeholder_management`, `technical_writing`, `architecture_design`), to the
markers for those skills, to the evidence (or lack of evidence) in the team's
GitHub activity. The survey gives perception. Landmark gives observable
evidence. The drivers link them through contributing skills.

```
Survey: Carol's team rated requirements_quality at 2.4/5
  → Driver: requirements_quality
    → Contributing skills: stakeholder_management, technical_writing
      → Markers for those skills at the team's expected levels
        → Landmark evidence: few PRs show design docs in Carol's team's repos

Diagnosis: The team perceives requirements quality as poor.
The evidence corroborates — design documentation is sparse.
The contributing skills point to where investment would help.
```

Map defines the schema for surveys and survey results. The data itself lives in
Landmark, loaded from YAML files or an HR integration.

### The GitHub App

The app receives GitHub webhook events as they happen — no polling, no batch
jobs. When a PR is opened, reviewed, merged, or commented on, Landmark receives
the event and stores the relevant facts.

The app collects. It does not act on repositories — no comments, no status
checks, no annotations on PRs. It does not surface results inside GitHub. All
output is through the CLI, where the engineer controls what they see.

### Collector and Interpreter

Landmark has two parts.

The **collector** is the GitHub App. It receives events, extracts structured
facts, and stores them. This is deterministic — anyone can see exactly what was
collected and when.

The **interpreter** is Guide. Landmark passes collected artifacts to Guide along
with the relevant skill markers, and Guide reads the artifacts in context: does
this PR description show trade-off analysis? Do these review comments explain
reasoning, not just point out problems?

```
GitHub Events → Collector (deterministic) → Guide (interpretation) → Evidence
```

The collector is cheap, repeatable, and auditable. The interpretation is an LLM
judgement — making that explicit means the reasoning is visible and reviewable.
The engineer sees not just "this artifact relates to this marker" but Guide's
rationale for why.

### Markers

A marker is a concrete, observable indicator of a skill at a proficiency level.
Not a description of the skill — a description of what you can **see** when
someone has it.

| Skill description (Map)            | Marker (Landmark)                                                    |
| ---------------------------------- | -------------------------------------------------------------------- |
| "You design systems independently" | "Authored a design doc accepted without requiring senior rewrite"    |
| "You write well-tested code"       | "PRs include tests that cover the changed behaviour, not just lines" |
| "You mentor others through review" | "Review comments explain the _why_, not just the _what_"             |

Markers live in the same YAML capability files as skills, following the
co-located file principle:

```yaml
skills:
  - id: system_design
    name: System Design
    human:
      description: ...
      levelDescriptions:
        working: You design systems independently
    agent:
      name: system-design
      description: ...
    markers:
      working:
        human:
          - Authored a design doc accepted without requiring senior rewrite
          - Led a technical discussion that resolved a design disagreement
          - Identified trade-offs for at least two viable approaches
        agent:
          - Produced a design doc that passes review without structural rework
          - Decomposed a feature into components with clear interface boundaries
          - Selected appropriate patterns with documented trade-off rationale
```

Markers are **installation-specific**. The same skill at the same level may have
different markers in different organizations, because observable evidence
depends on context. The skill definition is universal. The marker is local.

### Evidence

Evidence is a GitHub artifact that Guide has read against a marker. It is
linked, not copied — Landmark points to the PR, the review comment, the commit.
The artifact stays where it was produced, always current and verifiable.

### How Engineers Use Landmark

The primary flow is self-directed. An engineer asks to see their own evidence
for a skill. Landmark shows them the artifacts from their recent work that
relate to the markers for that skill, with Guide's interpretation of each.

The engineer reads the evidence and reflects: "yes, I do this consistently" or
"I haven't done much of this lately — why not?" That second question is where
the value is. Maybe the answer is personal — they haven't had the right
opportunities. Maybe it's systemic — the team doesn't create space for it.
Either way, the engineer owns the insight.

An engineer can choose to bring their evidence into a career conversation with
their manager. This is opt-in. The evidence is preparation for a conversation,
not a replacement for one. A good engineering manager doesn't need a dashboard
to know their team — they have conversations. Landmark gives both parties a
shared, concrete starting point.

### How Organizations Use Landmark

The second view is aggregate. Across a team, a capability area, or the whole
organization: which engineering practices show strong evidence and which don't?

This is where process improvement starts. If trade-off documentation is absent
across an entire team, the system isn't supporting the practice. Maybe design
time isn't allocated. Maybe there are no examples to follow. Maybe the review
culture doesn't ask for it. The aggregate view points to where the process needs
attention — without naming individuals, without producing league tables, without
creating fear.

## Positioning

```
map → libpathway → pathway
  ↘               ↗
   guide → landmark
  ↗
map
```

- **Map** defines skills, levels, behaviours — the data model
- **libpathway** derives jobs and agent profiles from Map data
- **Guide** is the AI agent that traverses Map and Pathway data — the
  interpretation layer
- **Landmark** collects GitHub activity and uses Guide to read it against
  markers. It depends on Guide for all interpretation.
- **Pathway** presents career progression, now with reflective evidence from
  Landmark
- **Basecamp** generates supplementary evidence (meeting notes, email decisions)
  that Landmark can reference alongside GitHub activity

## Design

### Name

**Landmark** — a recognizable, fixed reference point used to confirm position.
No metaphor to decode.

| Product  | Metaphor                 | Provides               |
| -------- | ------------------------ | ---------------------- |
| Map      | The surveyed territory   | Data model             |
| Pathway  | The mountain trail       | Career progression     |
| Guide    | The compass bearing      | Coaching and direction |
| Basecamp | The shelter and supplies | Daily operations       |
| Landmark | The cairn on the trail   | Evidence markers       |

### Icon: The Cairn

Three stacked stones, viewed from the side. Organic shapes, not geometric
circles. Top stone smallest, bottom largest.

- 24 x 24px grid, 2px padding
- 2px stroke, round caps and joins
- No fill (consistent with Map, Pathway, Basecamp)
- Hand-drawn feel with micro-variations in stone outlines

**Flat variant:** Three overlapping rounded shapes stacked vertically,
center-aligned. Simplified for favicons and tab bars.

### Emoji

🪨

### Hero Scene: "Checking the Cairn"

The trio (Engineer, AI Agent, Business Stakeholder) paused on a trail at a
cairn. The Engineer compares a notebook against the cairn. The AI Agent points
at it. The Stakeholder looks at the notebook, nodding.

Trail runs left to right. Cairn slightly right of center. Trio left of center,
oriented toward it. Distant mountain peaks in background with trail continuing
beyond.

### Visual Language

| Attribute   | Value                                                     |
| ----------- | --------------------------------------------------------- |
| Metaphor    | Cairns, stacked stones, trail markers, triangulation      |
| Tone        | "See the work. Improve the system."                       |
| Terrain     | Rocky trail sections with deliberate marker placements    |
| Empty state | Single stone on the ground, unstacked — awaiting evidence |

### Taglines

- Primary: **"See your own growth. Improve the system."**
- Secondary: "Observable markers for engineering practice."
- CTA: "Reflect on your work."

## CLI

The GitHub App collects activity continuously. The CLI queries what's been
collected. Two views: personal evidence and practice patterns.

```
Landmark — Observable markers for engineering practice.

Usage:
  fit-landmark evidence [--skill]             Show your own evidence
  fit-landmark practice <skill> [--manager]   Show practice patterns across a team
  fit-landmark marker <skill> [--level]       Show markers for a skill
  fit-landmark org                            Show the organization
  fit-landmark org sync <file>                Sync organization from YAML
  fit-landmark survey <id>                    Show survey results
  fit-landmark survey load <file>             Load survey results from YAML
  fit-landmark validate                       Validate markers and data
```

### Personal Evidence

The default command shows the engineer their own work. No arguments needed — it
uses their GitHub username and organization entry.

```
$ fit-landmark evidence --skill system_design

  Your evidence: System Design (working level)

  PR #342 "Redesign authentication flow"
    Design doc with component diagram in PR description. Approved by two
    reviewers without structural rework.
    → relates to: design doc accepted without senior rewrite

  PR #342 review thread
    Resolved caching vs. session debate. Posted trade-off comparison and
    the team converged on session approach.
    → relates to: led a technical discussion that resolved a design disagreement

  No recent artifacts relate to:
    → identified trade-offs for at least two viable approaches
```

The output shows artifacts and context — what happened, in the engineer's own
work. No scores, no counts, no progress bars. The engineer reads it and draws
their own conclusions.

### Practice Patterns

The aggregate view shows how a practice appears across a team. No individuals
named.

```
$ fit-landmark practice system_design --manager carol

  System Design practice — Carol's team (last quarter)

  Strong evidence:
    Design documents in PRs — most feature PRs include architecture sections
    Review quality — review threads regularly discuss design rationale

  Weak evidence:
    Trade-off analysis — few PRs document multiple approaches considered
    Consider: do engineers have time for design exploration before
    implementation begins?

  Based on 47 feature PRs and 156 reviews from 8 engineers.
```

The `--manager` flag identifies a team by its manager — Carol's team is her
direct reports. This is the only way to scope practice patterns. There is no
separate team entity.

This view is for engineering leadership. It points to where the system supports
good practice and where it doesn't. It asks questions about the process, not
about the people.

When survey data is available for the same manager and period, the practice
view includes it:

```
$ fit-landmark practice system_design --manager carol

  System Design practice — Carol's team (last quarter)

  Survey context (Q1 2026):
    requirements_quality: 2.4/5 — team perceives requirements quality as poor
    → contributing skills: stakeholder_management, technical_writing,
      architecture_design

  Strong evidence:
    Design documents in PRs — most feature PRs include architecture sections
    Review quality — review threads regularly discuss design rationale

  Weak evidence:
    Trade-off analysis — few PRs document multiple approaches considered
    Consider: do engineers have time for design exploration before
    implementation begins?

  The survey and evidence align: the team perceives requirements quality as
  poor, and design documentation in PRs is sparse. The contributing skills
  point to where investment would help.
```

## Summary

| Attribute     | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Package       | `@forwardimpact/landmark`                                                |
| CLI           | `fit-landmark`                                                           |
| Delivery      | GitHub App installed on GitHub Organizations                             |
| Icon          | Cairn (three stacked stones)                                             |
| Emoji         | 🪨                                                                       |
| Hero scene    | "Checking the Cairn"                                                     |
| Tagline       | "See your own growth. Improve the system."                               |
| Depends on    | `@forwardimpact/guide` (interpretation), `@forwardimpact/map` (schemas)  |
| Input         | GitHub events + organization (people → jobs → managers) + survey results |
| Schema (Map)  | Organization, repositories, surveys, survey results, markers             |
| Data          | Installation-specific, owned by Landmark                                 |
| For engineers | Self-directed evidence, preparation for career conversations             |
| For teams     | Practice patterns + survey context, process improvement signals          |
| For agents    | Same markers, same evidence, same interpretation                         |
