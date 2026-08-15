# Approval Signals

Approval state for spec, design, and plan phases lives in `wiki/STATUS.md`, the
canonical record. `kata-release-merge` reads it to decide which phase PRs may
merge. Many signal types feed it. The agent that observes one validates trust
and writes the row.

## The signals

Each signal is a work-item event: a trusted approval marker (`gate`), or a
trusted human who merges the change themselves (`merge-change`). Per-tracker
shapes live in the [matrix](x-work-trackers.md#the-matrix).

| Signal | Source | Captured by |
|---|---|---|
| `<phase>:approved` label on a change | Human or `/ship-it` | `kata-dispatch` (label event) |
| `gate` — trusted approval marker on a change | Trusted-account approver | `kata-dispatch` (review event) |
| Approval comment ("approve", "LGTM", "ship it") | Trusted contributor on the change | `kata-dispatch` (comment event) |
| `merge-change` by a human | Trusted human. The merge is the approval (§ Merge as approval) | `kata-dispatch` (close event, `merged: true`) |
| `merge-change` by an agent | **Not a signal**. The gate merges only what STATUS already authorized. The `plan implemented` it writes at an implementation merge records completion. It does not record approval | — |
| Direct user message in interactive session | Trusted user | Active agent (in-session) |
| `kata-plan` panel-clean | `staff-engineer` (plans only) | `kata-plan` skill |
| retention-PR approval | `product-manager` (retention PRs only) | `kata-release-merge` at the gate, with **no STATUS write** |

The retention-PR approval is the one class that STATUS does not mediate. It
carries no spec id and spans many `specs/NNN/` directories. So the gate reads
the PM review directly at merge time.

## Merge as approval

A human who merges a change approves it. The merge **is** the approval. It is
not bookkeeping that trails an approval held elsewhere.

When the gate never authorized the merge, STATUS contradicts the trunk and the
next phase stalls. An example is a `spec(NNN)` PR merged while its row reads
`spec draft`. Reconcile the row to what was merged:

| Merged by a human | Row to write |
|---|---|
| `spec(NNN)` PR | `{NNN}\tspec\tapproved` |
| `design(NNN)` PR | `{NNN}\tdesign\tapproved` |
| `plan(NNN)` PR | `{NNN}\tplan\tapproved` |
| implementation PR for `NNN` | `{NNN}\tplan\timplemented` |

Reconciliation stays bounded to that row. It records what happened. It never
advances a later phase or becomes standing authority for future work. A
`kata-release-merge` merge reconciles nothing. The gate merges only what STATUS
already authorized.

## Trust rule

Spec and design approvals must originate from a trusted human. Agents
**never** autonomously originate `spec approved` or `design approved`. They
only propagate signals that a trusted human already expressed. A human's merge
is such an expression. So reconciliation per § Merge as approval propagates. It
does not originate. `staff-engineer` may approve plans after a clean
`kata-plan` panel review. The product manager may originate a retention-PR
approval once every target is terminal and its durable signal preserved. The
human-only rule stays scoped to `spec approved` and `design approved`.

The release engineer's trust gate (the kata-release-merge settings
reference's configured trust source, or the CI app identity) is canonical.
`kata-dispatch` runs the same check before it writes STATUS on a
PR-side signal.

## Signal invalidation

A signal can un-count when a phase PR's head moves after approval. Four-point
mechanics:
[`review-transfer.md`](../../skills/kata-release-merge/references/review-transfer.md).
This section names the per-class pin source and consequence.

| Signal class | Pin source | On head move |
|---|---|---|
| `<phase>:approved` label | head SHA at the label event | human-originated. Any delta voids it, and needs fresh human re-approval |
| `gh pr review --approve` | the review's commit SHA | same |
| Approval comment | head SHA when posted | same |
| In-session user message | head SHA recorded with the STATUS write (§ In-session approval) | same |
| `kata-plan` panel-clean | head SHA on the PR-side panel record | agent-originated. Any delta voids it, and needs fresh `staff-engineer` re-approval |
| retention-PR approval | the PM review's own commit SHA | agent-originated. Any delta voids it, and needs a fresh `product-manager` review |

Retention PRs sit **outside** `review-transfer.md` (§ Applicability scopes it to
spec/design/plan PRs). The gate applies the row above directly. The mechanics
match `kata-plan` panel-clean. The PM review carries its own commit SHA, so it
needs no separate pin.

Rules:

- A signal with **no establishable pin** transfers to no other head. It is valid
  only where someone freshly re-confirms it.
- Patch-id equivalence alone never establishes a transfer.
- A content-identical move (review-transfer.md points 1 to 3) permits a recorded
  transfer. Any non-identical delta voids it.
- A void leaves STATUS as-is. Re-approval is a fresh signal with a fresh pin.
  It is not a STATUS rewrite.
- The merge classes need no pin. A merged PR is closed, so its head cannot
  move. This does not mean the merge carries no weight. A human merge is a full
  approval (§ Merge as approval).

## In-session approval

A trusted user may approve a spec, design, or plan in an interactive session
("approve this spec"). The active agent then sets the matching `wiki/STATUS.md`
row. It commits the wiki and lets the Stop hook push. This needs no GitHub
action, because STATUS is canonical. Merge happens on the next
`kata-release-merge` run.

The agent also records the approved head SHA with the write. The signal then
carries a pin: a PR comment when one exists, the wiki commit otherwise. The
first push pins any approval that precedes it. The same duty covers
`kata-plan` panel-clean approvals through their on-PR record.

## Writing STATUS

`wiki/STATUS.md` wraps a tab-separated body in a fenced code block. Replace a
row in place. Format: `{id}\t{phase}\t{status}`. Phases: `spec`, `design`,
`plan`. Statuses: `draft`, `approved`, `implemented` (plan only), `cancelled`.
Lifecycle: `spec draft → spec approved → design draft → design approved → plan
draft → plan approved → plan implemented`. Cancelled is terminal. A lockstep
spec+design PR (both in one `design(NNN)` PR) skips `spec approved`. The row
moves `spec draft → design draft → design approved`, which subsumes it.

Commit the edit with the session's other wiki updates. The Stop hook pushes it.

## Experiment rows

A spec-less experiment whose plan ships code carries its own row, keyed
`exp:{issue}`. Four tab cells:
`exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`. States are `registered` →
`approved` → `cancelled`. The `plan-ref` is the `#NNN` that holds the
gate-comparable execution plan.

| State | Meaning | Writer |
|---|---|---|
| `registered` | Registered with a code-shipping plan, no approval yet. Pin `-`. | Owning agent (bookkeeping) |
| `approved` | A trusted human gave a PR-side signal. Pin: the head SHA at signal time. | `kata-dispatch` or in-session agent |
| `cancelled` | Adjudicated FAIL or VOID, or retired. Pin stays if ever approved, else `-`. | Owning agent (bookkeeping) |

`registered` and `cancelled` are bookkeeping states the owning agent writes. The
session facilitator writes no files. Only `approved` requires a human origin.
Propagation needs a pre-existing `registered` row. On an absent row the signal
waits until the owner backfills registration.

**Head pin.** The `approved` write records the head SHA at signal time, read at
the gate. Any later commit re-blocks until a fresh human signal covers the new
head. This includes a gate-performed rebase. So the gate does not rebase an
approved-and-pinned experiment PR. This is stricter than pin-less spec rows
because no artifact bounds the approved commits.

Only the trusted-human PR-side signals in § The signals feed `approved` (label,
`gate` marker, approval comment, human merge, in-session message). An agent
verdict never does.

## Labels remain as input signals

Humans may still apply `<phase>:approved` labels for PR UI visibility. The label
fires `kata-dispatch`, which validates trust and writes STATUS. It is not the
merge gate.
