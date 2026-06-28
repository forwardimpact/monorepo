---
name: fit-summit
description: >
  Make staffing decisions you can defend by modeling team capability as a
  system. Use when a post-mortem surfaces the same skill gap again, when
  evaluating whether a hire, transfer, or promotion strengthens the team,
  when detecting structural risks like single points of failure, or when
  simulating what-if scenarios, aligning growth with team gaps, comparing
  teams, and tracking capability trajectory over time.
---

# Summit

Team capability planning tool. Summit aggregates individual skill matrices into
team-level views — coverage heatmaps, structural risks, and what-if scenarios.
It treats a team as a system, not a collection of individuals: it measures what
a team _can_ do, not how well it is doing it.

## When to Use

**Understand what a team can do:**

- Viewing per-skill headcount depth — `npx fit-summit coverage <team>`
- Detecting single points of failure, critical gaps, and concentration risks —
  `npx fit-summit risks <team>`
- Overlaying evidence from Map's activity layer —
  `npx fit-summit coverage <team> --evidenced`

**Make and defend staffing decisions:**

- Evaluating whether a hire strengthens the team —
  `npx fit-summit what-if <team> --add '{ discipline: ..., level: ... }'`
- Simulating a departure or transfer —
  `npx fit-summit what-if <team> --remove 'Name'`
- Comparing capability before and after a change —
  `npx fit-summit what-if <team> --promote 'Name'`
- Evaluating project-specific coverage —
  `npx fit-summit coverage <team> --project <name>`

**Growth and trajectory:**

- Growth opportunities aligned with team gaps — `npx fit-summit growth <team>`
- Weighting recommendations by outcome scores —
  `npx fit-summit growth <team> --outcomes`
- Tracking quarterly capability evolution — `npx fit-summit trajectory <team>`

**Team comparison:**

- Diffing coverage and risks between teams —
  `npx fit-summit compare <team1> <team2>`
- Reviewing roster composition — `npx fit-summit roster`

---

## How It Works

### Coverage

For each team member, Summit derives a skill matrix from their job (discipline,
level, track) using the Map standard data. Skills at "working" proficiency or
above count toward coverage depth. The result is a per-skill headcount showing
how many people can meaningfully contribute to each skill area.

### Structural Risks

Three risk types are detected from coverage data:

1. **Single points of failure** — skills with exactly one working+ holder.
   Severity depends on allocation: part-time holders are higher risk.
2. **Critical gaps** — skills expected by the team's disciplines and tracks that
   have zero working+ holders.
3. **Concentration risks** — clusters of 3+ people at the same level,
   capability, and proficiency, indicating lack of seniority distribution.

### What-If Scenarios

Scenarios clone the roster, apply mutations (add/remove/move/promote), and diff
coverage and risks against the original. The input is never modified — all
simulation is pure.

### Growth Alignment

Growth recommendations rank team members by their potential to fill team gaps.
Each skill gap is classified by impact: `critical` > `spof-reduction` >
`coverage-strengthening`. Candidates are ranked by current proficiency (lower is
better — more room to grow) and level. When `--outcomes` is provided,
recommendations within the same impact tier are re-sorted by worst GetDX driver
score.

### Evidence Decorator

The optional `--evidenced` flag loads evidence from Map's activity schema and
overlays practiced capability onto derived coverage. This can escalate risks — a
skill with derived depth but no evidence becomes a more urgent concern.

### Trajectory

Trajectory reads the git history of the roster file, buckets commits by calendar
quarter, and computes coverage at each point. Per-skill trends are classified as
improving, declining, stable, or persistent_gap.

### Audience Model

Each view applies privacy rules based on the audience:

- **Engineer** — sees team aggregates and their own growth recommendations
- **Manager** — sees individual-level detail within their team
- **Director** — sees aggregated data with individual identity stripped

---

## CLI Reference

See [`references/cli.md`](references/cli.md) for full command listings.

---

## Roster Format

See [`references/roster.md`](references/roster.md) for YAML format and examples.

---

## Common Workflows

See [`references/workflows.md`](references/workflows.md) for worked examples.

---

## Prerequisites

- Map standard data (from `npx fit-map init`)
- A `summit.yaml` roster file (copy from the starter example)
- Git repository (required for `trajectory` command)
- Map activity layer (optional, for `--evidenced` and Map-sourced rosters)
- GetDX integration (optional, for `--outcomes`)

## Verification

```sh
npx fit-summit validate                   # Roster validates against agent-aligned engineering standard
npx fit-summit roster                     # Roster displays correctly
npx fit-summit coverage <team>            # Coverage heatmap renders
npx fit-summit risks <team>               # Risks detected as expected
```

## Documentation

- [Summit Overview](https://www.forwardimpact.team/summit/index.md) — Product
  overview, design principles, and audience model
- [Getting Started: Summit for Leaders](https://www.forwardimpact.team/docs/getting-started/leaders/summit/index.md)
  — From zero to your first team capability analysis
- [Make Staffing Decisions You Can Defend](https://www.forwardimpact.team/docs/products/team-capability/index.md)
  — Coverage heatmaps, structural risks, and what-if scenarios
- [Evaluate a Candidate Against Team Gaps](https://www.forwardimpact.team/docs/products/team-capability/evaluate-candidate/index.md)
  — Check whether a candidate fills the team's actual gap
- [Surface Capability Gaps](https://www.forwardimpact.team/docs/products/team-capability/surface-gaps/index.md)
  — Detect single points of failure and coverage blindspots
