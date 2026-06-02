# Spec 1440 — Codify block-comment re-ping cadence in `kata-release-merge`

## Persona and job

Hired by **Teams Using Agents** so the release-merge gate stays a
two-way channel: when a PR fails a gate, the team running the agent
team can rely on fresh signal arriving at a known cadence, not a
single comment that silently ages while the gate state drifts. Today
the skill posts a block comment on the failing gate and then never
re-comments on subsequent runs, even when the gate state changes
(CI repairs, STATUS row advances, owner shifts); the approver-facing
surface goes dark and approvals stall.

Related JTBD:
[Teams Using Agents — Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).

## Problem

The `kata-release-merge` skill runs a scheduled sweep over open PRs
and, when a gate fails, posts a comment from the skill's templates
and records the PR in the release-engineer's classification table
(the agent-memory artifact named in the skill's memory contract as
the per-PR classification table). The comment posts once on the
sweep that first detected the failure. The classification table
carry behaviour keeps the row across subsequent sweeps, but no rule
in the skill describes what to do on those subsequent sweeps once
the row is already present.

### Observed drift

Snapshot taken 2026-06-02: every open at-gate PR in the
classification table, with its issue timeline queried for the most
recent comment authored by `app/kata-agent-team` and compared to the
snapshot date.

| PR | Phase | Cal-days at gate | Days since last RE comment |
| --- | --- | ---: | ---: |
| #1251 | design(1360) | 6 | >3 |
| #1250 | spec(1350) | 6 | >3 |
| #1226 | spec(1330) | 7 | >3 |
| #1161 | design(1220) | 10 | >3 |
| #1154 | spec(1290) | 10 | >3 |
| #1107 | design(1210) | 12 | >3 |
| #1064 | plan(1160) | 13 | >3 |
| #1043 | design(1040) | 14 | >3 |
| #972  | design(0940) | 16 | >3 |

Snapshot date: 2026-06-02. The table is not maintained after the
snapshot. Nine of nine open at-gate PRs are silent. The storyboard's
Q1 target on this count is **0**.

### Storyboard signals consistent with the drift

| Signal | Value | Q1 target | Source |
| --- | --- | --- | --- |
| `prs_merged` consecutive below-μ run | 16+ | break the run | `wiki/metrics/kata-release-merge/2026.csv` `prs_merged` rows, μ≈2.6 / σ̂≈1.82 |
| `approvals_recorded_per_run` weekly average | 0.39 | ≥1.0 | `wiki/metrics/kata-release-merge/2026.csv` `approvals_recorded_per_run` rows |
| Open at-gate PRs silent >3 cal-days | 9 | 0 | Snapshot table above |

The correlation between silence and approval-throughput is not by
itself causal; the change this spec proposes is the test. See
§ Storyboard outcome, separated from § Success criteria below.

### Why the skill cannot tell itself to re-ping

The skill has no named rule that fires re-comments. Once a
gate-failure comment is posted and the row is recorded in the
classification table, the skill has nothing instructing a subsequent
sweep to comment again, regardless of how the gate state has
changed. Whether the skill derives staleness from its own memory or
from a fresh API query is a design choice; the gap this spec closes
is the absence of any rule at all, not the data path the rule reads
from.

## Scope

### In scope

- The `kata-release-merge` skill carries a named re-ping rule that
  fires on every scheduled sweep, with a 3 calendar-day silence
  window. For any open at-gate PR whose most recent
  release-engineer comment is older than the silence window, the
  rule posts a fresh comment.
- The skill's templates carry a re-ping comment template whose
  body, when posted, lets the awaited owner take the next action:
  it conveys the current gate state, the named owner whose action
  unblocks the PR, and the next action that owner would take.
- The skill's per-PR output lets a storyboard observation
  distinguish re-pings from initial blocks, so re-ping cadence is
  observable separately from initial-block cadence.

### Excluded

- **Changes to the six gates themselves.** Trust, type, CI,
  mechanical readiness, approval, open comments — none of the
  gate logic changes. The change is about what the skill does
  after a gate fails, not which gates exist.
- **Notification surfaces outside the PR thread.** The re-ping
  rule posts a fresh PR comment; it is not a Slack ping, an
  Issue cross-link, or any out-of-band notification. Approver
  routing remains the existing label/review/comment path.
- **How the rule determines staleness.** Whether the skill reads
  the most-recent-comment time from the classification table,
  from a per-sweep timeline query, from a derived index, or from
  any other source is a design choice. The spec requires the rule
  to fire correctly; the data path is not specified.
- **Subsequent tuning of the cadence.** Storyboard observation
  may later argue for moving the 3-day window or the per-sweep
  rate; that tuning is a later obstacle, not this spec.
- **Backfilling re-ping comments to currently silent PRs.** Once
  the change lands, the first sweep against `main` posts the
  fresh round; no separate backfill step is part of this spec.
- **The release-engineer's free-form summary or weekly log
  content.** The classification table's memory contract is what
  the skill owns; what the release-engineer writes in summary or
  weekly logs is unchanged.

## Success criteria

| Claim | Verifies via |
|---|---|
| The `kata-release-merge` skill states a named re-ping rule with a 3 calendar-day silence window that fires on every scheduled sweep. | Reading the skill shows a named rule with those two parameters. |
| The skill's templates carry a re-ping comment whose body conveys the current gate state, the named owner whose action unblocks the PR, and the next action that owner would take. | Reading the templates shows a re-ping section whose body conveys those three things, referenced from the re-ping rule. |
| The skill's per-PR output distinguishes re-pings from initial blocks. | Reading the skill shows the re-ping case as an observable per-PR signal a storyboard run can read out, separate from the initial-block signal. |

## Storyboard outcome (not a spec success criterion)

After the change lands, the storyboard observes — over multiple
weeks — whether the three signals in § Storyboard signals move
toward target. The spec is considered delivered when § Success
criteria pass; whether the storyboard targets move is a separate
observation that informs the next obstacle, not a precondition for
approving this spec.

— Release Engineer 🚀
