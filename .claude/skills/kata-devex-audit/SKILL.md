---
name: kata-devex-audit
description: >
  Perform a deep-dive codebase-health review — dead code, duplication,
  inconsistency, and accumulating debt — one area per run against a coverage
  map. Use on a scheduled developer-experience shift, when reviewing a change
  for maintainability, or when debt in one area has started slowing every agent
  invocation.
---

# DevEx Audit

## When to Use

- Scheduled audit of the repository's codebase health (one area per run).
- Reviewing a change for maintainability, consistency, and debt.
- Investigating a reported hot-spot of duplication or dead code.

## Checklists

<do_confirm_checklist goal="Confirm the audit area was thoroughly checked">

- [ ] Read every file in the area's audit scope — not just grep results.
- [ ] Each finding cites a specific file path and line number.
- [ ] Each finding categorized: mechanical cleanup, structural (spec), or
      observation.
- [ ] Every mechanical-cleanup finding changes no behavior.
- [ ] Coverage map updated with today's date for the audited area.

</do_confirm_checklist>

## Audit Areas

Reference material for each area. The process selects one area per run and goes
deep.

### 1. Dead Code

Unreachable branches, unused exports, orphaned files, feature conditions that
can no longer be true, and commented-out blocks left as fossils.

### 2. Duplication

Copy-pasted logic that has drifted, near-identical helpers that should be one,
and repeated constants that should have a single source of truth.

### 3. Inconsistency

Divergent naming, mixed idioms for the same task, and interfaces that solve one
problem three different ways — friction that taxes every reader.

### 4. Accumulating Debt

`TODO`/`FIXME` markers past their half-life, workarounds whose root cause was
already fixed, and abstractions that leak or no longer earn their complexity.

### 5. Local Audit Invariants

Libraries and services may declare audit-time invariants in their local
CLAUDE.md. When the selected area covers that code, or when reviewing a change
that touches it, read the local CLAUDE.md and apply every invariant it declares.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `fit-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
Find the last audit date per area in the coverage map. Canonical area-rotation
runs write only to the wiki and never open a PR — do **not** `fit-wiki claim`
for them; the claim contract applies only when this skill opens a PR.

### Step 1: Select Area

Each run covers **one area** in depth.

#### Area table

| Area | What to audit |
| --- | --- |
| `dead-code` | Unreachable paths, unused exports, orphaned files |
| `duplication` | Drifted copies, near-identical helpers, repeated constants |
| `inconsistency` | Divergent naming, mixed idioms, redundant interfaces |
| `accumulating-debt` | Stale `TODO`/`FIXME`, obsolete workarounds, leaky abstractions |

#### Area selection

1. Build the coverage map — never-audited areas go first, then oldest.
2. Revisit threshold — if all areas covered within the last few runs, revisit
   the oldest.
3. Announce your pick and why before starting.
4. Go deep — read every relevant file, not just grep for patterns.

### Step 2: Audit the Area

Go deep on the selected area using the audit-area reference above. Read every
relevant file — do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Classify each finding with
[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests).
A **mechanical cleanup** changes no behavior and lands on a `fix/` PR; a
**structural refactor** routes to a `spec/` branch. Branch naming, commit
conventions, and independence rules are defined in the agent profile.

## Memory: What to Record

Append to the current week's log:

- **Area audited** — which area and why selected.
- **Coverage map** — updated table in `wiki/devex-engineer.md` § Coverage Map
  (area · last audited), today's date on the audited area.
- **Findings summary** — what found, severity, disposition
  (fixed / spec'd / deferred).
- **Deferred work** — items needing follow-up with enough context to resume.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **Discussion** — a cross-team consistency question surfaced from the audit
  (e.g. "should the whole tree adopt one naming idiom?") that needs input
  before a spec or fix.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
