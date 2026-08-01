---
name: kata-devex-audit
description: >
  Perform a deep-dive codebase-health review of dead code, duplication,
  inconsistency, and accumulating debt. Cover one area per run against a
  coverage map. Use on a scheduled developer-experience shift, when you review
  a change for maintainability, or when debt in one area slows every agent
  invocation.
---

# DevEx Audit

## When to Use

- A scheduled audit covers the repository's codebase health (one area per run).
- You review a change for maintainability, consistency, and debt.
- You investigate a reported hot-spot of duplication or dead code.

## Checklists

<do_confirm_checklist goal="Confirm the audit area was thoroughly checked">

- [ ] Read every file in the area's audit scope. Do not stop at grep results.
- [ ] Confirm each finding cites a specific file path and line number.
- [ ] Categorize each finding: mechanical cleanup, structural (spec), or
      observation.
- [ ] Confirm every mechanical-cleanup finding changes no behavior.
- [ ] Update the coverage map with today's date for the audited area.

</do_confirm_checklist>

## Audit Areas

Reference material for each area. The process selects one area per run and goes
deep.

### 1. Dead Code

Unreachable branches, unused exports, orphaned files, feature conditions that
can no longer be true, and commented-out blocks left as fossils.

### 2. Duplication

Copy-pasted logic that drifted, near-identical helpers that should be one, and
repeated constants that should have a single source of truth.

### 3. Inconsistency

Divergent names, mixed idioms for the same task, and interfaces that solve one
problem three different ways. This friction taxes every reader.

### 4. Accumulating Debt

`TODO`/`FIXME` markers past their half-life, workarounds whose root cause was
already fixed, and abstractions that leak or no longer earn their complexity.

### 5. Local Audit Invariants

Libraries and services may declare audit-time invariants in their local
CLAUDE.md. When the selected area covers that code, read the local CLAUDE.md.
Do the same when you review a change that touches it. Apply every invariant it
declares.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`, then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
Find the last audit date per area in the coverage map. Canonical area-rotation
runs write only to the wiki and never open a PR. Do **not** `gemba-wiki claim`
for them. The claim contract applies only when this skill opens a PR.

### Step 1: Select Area

Each run covers **one area** in depth.

#### Area table

| Area | What to audit |
| --- | --- |
| `dead-code` | Unreachable paths, unused exports, orphaned files |
| `duplication` | Drifted copies, near-identical helpers, repeated constants |
| `inconsistency` | Divergent names, mixed idioms, redundant interfaces |
| `accumulating-debt` | Stale `TODO`/`FIXME`, obsolete workarounds, leaky abstractions |

#### Area selection

1. Build the coverage map. Never-audited areas go first, then the oldest.
2. Revisit threshold — if you covered all areas within the last few runs,
   revisit the oldest.
3. Announce your pick and why before you start.
4. Go deep. Read every relevant file. Do not stop at a grep for patterns.

### Step 2: Audit the Area

Go deep on the selected area with the audit-area reference above. Read every
relevant file. Do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Classify each finding with
[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests).
A **mechanical cleanup** changes no behavior and lands on a `fix/` PR. A
**structural refactor** routes to a `spec/` branch. The agent profile defines
branch names, commit conventions, and independence rules.

## Memory: What to Record

Append to the current week's log:

- **Area audited** — which area, and why you selected it.
- **Coverage map** — updated table in `wiki/devex-engineer.md` § Coverage Map
  (area · last audited), today's date on the audited area.
- **Findings summary** — what you found, its severity, and its disposition
  (fixed / spec'd / deferred).
- **Deferred work** — items that need follow-up with enough context to resume.
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
