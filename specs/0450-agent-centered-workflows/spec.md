# Spec 0450 — Agent-Centered Workflows

## Problem

The kata system dispatches work through ten narrow workflow files, each passing
a single-purpose task prompt to an agent: "Apply security updates", "Check
release readiness", "Review one documentation topic." Agents follow the named
skill and return. They never assess their domain, never weigh alternatives, and
never choose their next best action.

This contradicts the Toyota Kata model the system is named after. The
improvement kata prescribes: understand the direction, **grasp the current
condition**, **establish the next target condition**, and experiment toward it.
Today, workflows pre-decide steps 2 and 3 — the agent executes step 4 only. Some
agents (product-manager, security-engineer) already route across multiple skills
based on task prompt text, but they remain constrained to the intent the
workflow selected for them.

The cost is visible in the wiki:

- **Wasted runs.** When security-update fires and there are no Dependabot PRs,
  the run is a no-op — even if a critical audit finding from the previous
  security-audit run is sitting unaddressed. The agent cannot pivot because the
  workflow told it to do one thing.

- **Incomplete coverage.** Agent wiki summaries show large coverage gaps across
  domains (see `wiki/security-engineer.md`, `wiki/technical-writer.md`,
  `wiki/improvement-coach.md`). Coverage gaps persist — agents lack the autonomy
  to prioritize uncovered areas when their assigned task has nothing to do.

- **Stale cross-agent observations.** The technical writer reports that the
  security engineer's protobufjs observation has been sitting 12 days without
  acknowledgment. Formatting regressions persist across four consecutive weeks
  (`wiki/release-engineer.md`). When agents can only do what the workflow tells
  them, cross-agent feedback falls through the cracks.

- **Scheduling rigidity.** The release-engineer sees main CI is red during
  release-readiness but cannot cut a release until the next release-review run
  (Tue/Thu/Sat). The staff-engineer cannot plan and implement in the same run
  when the backlog is shallow. Two workflows for the same agent create
  artificial boundaries between naturally sequential actions.

Each of these is a symptom of the same root cause: **workflows decide what
agents do, instead of agents deciding for themselves.**

## Proposal

Collapse ten task-specific workflows into six agent-centered workflows — one per
agent. Each workflow wakes the agent on a schedule. The agent reads shared
memory, surveys the current state of its domain, and picks the highest-priority
action from its full skill set.

```text
Current:  Workflow("do X") → Agent → Skill X → Output
Proposed: Workflow("assess and act") → Agent → Survey → Decide → Skill → Output
```

### Workflow consolidation

Each agent's separate workflows merge into a single file. Agents that already
have one workflow keep it under a new name.

| Current workflow(s)                    | New workflow            | Agent             |
| -------------------------------------- | ----------------------- | ----------------- |
| `security-audit` + `security-update`   | `security-engineer.yml` | security-engineer |
| `doc-review` + `wiki-curate`           | `technical-writer.yml`  | technical-writer  |
| `release-readiness` + `release-review` | `release-engineer.yml`  | release-engineer  |
| `plan-specs` + `implement-plans`       | `staff-engineer.yml`    | staff-engineer    |
| `product-manager`                      | `product-manager.yml`   | product-manager   |
| `improvement-coach`                    | `improvement-coach.yml` | improvement-coach |

### Scheduling constraints

The following ordering constraints must be preserved in the new schedules.
Within each constraint, the earlier workflow must complete before the later one
fires:

1. **Security before product** — security-engineer runs before product-manager
   so that vulnerability findings are visible during triage.
2. **Product before planning** — product-manager runs before staff-engineer so
   that triaged specs are available for planning.
3. **Planning before release** — staff-engineer runs before release-engineer so
   that implementation PRs exist before readiness checks and release cuts.
4. **All producers before observer** — improvement-coach runs last so that
   traces from the current cycle are available for analysis.

Same-agent workflows no longer overlap (one workflow per agent), eliminating
that class of scheduling conflict. Off-minute staggering to avoid API load
spikes remains a design requirement.

### Agent assess phase

Each agent profile gains an **Assess** section replacing the current "Workflows"
section. This is a numbered priority framework the agent follows to decide its
next action based on observed domain state.

Example for the security-engineer:

> 1. Critical npm audit findings or CVEs? → patch immediately (check:
>    `npm audit`, GitHub security advisories)
> 2. Open Dependabot PRs awaiting triage? → triage and merge/close (check: list
>    open Dependabot PRs)
> 3. No urgent patches? → audit the least-recently-covered topic area (check:
>    coverage map in `wiki/security-engineer.md`)
> 4. Nothing actionable? → report clean state

Each agent's priority framework follows the same pattern: check for urgent work
first, then scheduled work, then coverage gaps, then report clean state. The
framework names the checks to perform (what to survey) and the skill to invoke
for each priority level.

### Decision logging

Each run records its assessment in the weekly log under a `### Decision`
subheading with four required fields:

- **Surveyed** — what domain state was checked (e.g., "npm audit: 0 findings,
  Dependabot PRs: 0 open, coverage map: 7/8 topics at 'never'")
- **Alternatives** — what actions were available (e.g., "patch, triage, audit")
- **Chosen** — what action was selected and which skill was invoked
- **Rationale** — why this action over the alternatives

### Decision-quality invariants

The improvement coach's invariant list gains one invariant per agent, each
following the same pattern: "Agent surveyed domain state before choosing an
action." The invariant specifies what evidence to find in the trace (e.g., the
agent called npm audit or listed Dependabot PRs before deciding to audit a
topic) and the severity for violation (high — the agent acted without
assessing).

### What does not change

- **Skills.** All sixteen kata skills remain unchanged. Skills are procedures,
  not decisions.
- **Fix-or-spec discipline.** Agents still separate mechanical fixes from
  structural improvements.
- **Trust boundary.** The product manager remains the sole external merge point.
- **Scope constraints.** No agent gains new capabilities — they gain the
  autonomy to choose _when_ to apply existing capabilities.
- **Trace capture.** Every kata run still produces an NDJSON trace artifact.
- **PDSA loop.** The phases remain; agents now participate in more of them per
  run.
- **kata-action composite.** The dispatch mechanism is unchanged — only the task
  text and workflow file count change.

### Clean break — no backward compatibility

This is a clean break. The ten existing workflow files are deleted and replaced
by six new ones. Old workflow names, old task prompts, and old agent profile
sections (e.g., "Workflows") are removed entirely — no aliases, no deprecation
shims, no fallback paths. The goal is a clean code base where only the new
structure exists.

## Scope

### Affected

- `.github/workflows/` — ten kata workflow files consolidated into six:
  `security-engineer.yml`, `technical-writer.yml`, `release-engineer.yml`,
  `staff-engineer.yml`, `product-manager.yml`, `improvement-coach.yml`
- `.claude/agents/security-engineer.md` — Assess section replaces Workflows
- `.claude/agents/technical-writer.md` — Assess section replaces Workflows
- `.claude/agents/release-engineer.md` — Assess section replaces Workflows
- `.claude/agents/staff-engineer.md` — Assess section replaces Workflows
- `.claude/agents/product-manager.md` — Assess section replaces Workflows
- `.claude/agents/improvement-coach.md` — Assess section replaces Workflows
- `KATA.md` — Workflows table, workflow count, and PDSA descriptions updated
- `.claude/skills/kata-trace/references/invariants.md` — six new
  decision-quality invariants added (one per agent)

### Excluded

- Skill content (`kata-*/SKILL.md`) — procedures do not change
- `kata-action` composite action — dispatch mechanism unchanged
- `fit-eval` CLI — no changes to the evaluation runner
- Agent memory format — wiki file layout and naming unchanged; the new
  `### Decision` subheading (see Decision logging) is an addition, not a
  restructuring
- Trust boundary or permission model — unchanged

## Success Criteria

1. **Six workflow files** exist in `.github/workflows/` named
   `security-engineer.yml`, `technical-writer.yml`, `release-engineer.yml`,
   `staff-engineer.yml`, `product-manager.yml`, and `improvement-coach.yml` —
   replacing the ten previous files, each with a generic assessment-first task
   prompt.
2. **Every agent profile** contains a numbered priority framework in an Assess
   section that can be followed to determine next action from observed state
   alone — no task prompt routing required.
3. **Decision logging** appears in weekly wiki logs under a `### Decision`
   subheading with four fields: Surveyed, Alternatives, Chosen, Rationale.
4. **Invariant audit** includes one decision-quality invariant per agent in
   `invariants.md`, each specifying the trace evidence to check and a high
   severity for violation.
5. **Scheduling constraints** are preserved: security before product, product
   before planning, planning before release, all producers before the
   improvement coach. Off-minute staggering avoids API load spikes.
6. **`task-amend` input** (the `kata-action` composite's optional override that
   lets a caller append text to the task prompt) still works for manual steering
   on any workflow.
7. **`bun run check` and `bun run test` pass** with no regressions.
