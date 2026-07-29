# Approval Signals

Approval state for spec, design, and plan phases lives in `wiki/STATUS.md` — the
canonical record, read by `kata-release-merge` to decide which phase PRs may
merge. Many signal types feed it; the agent that observes one validates trust
and writes the row.

## The signals

Each signal is a work-item event — a trusted approval marker (`gate`) or a
trusted human merging the change themselves (`merge-change`). Per-tracker shapes
live in the [matrix](x-work-trackers.md#the-matrix).

| Signal | Source | Captured by |
|---|---|---|
| `<phase>:approved` label on a change | Human or `/ship-it` | `kata-dispatch` (label event) |
| `gate` — trusted approval marker on a change | Trusted-account approver | `kata-dispatch` (review event) |
| Approval comment ("approve", "LGTM", "ship it") | Trusted contributor on the change | `kata-dispatch` (comment event) |
| `merge-change` by a human | Trusted human — the merge is the approval (§ Merge as approval) | `kata-dispatch` (close event, `merged: true`) |
| `merge-change` by an agent | **Not a signal** — the gate merges only what STATUS already authorized; the `plan implemented` it writes at an implementation merge records completion, not approval | — |
| Direct user message in interactive session | Trusted user | Active agent (in-session) |
| `kata-plan` panel-clean | `staff-engineer` (plans only) | `kata-plan` skill |
| retention-PR approval | `product-manager` (retention PRs only) | `kata-release-merge` at the gate — **no STATUS write** |

The retention-PR approval is the one class not mediated by STATUS: it carries no
spec id and spans many `specs/NNN/` directories, so the gate reads the PM review
directly at merge time.

## Merge as approval

A human who merges a change has approved it. The merge **is** the approval, not
bookkeeping trailing one held elsewhere.

When the gate never authorized the merge — a `spec(NNN)` PR merged while its row
reads `spec draft` — STATUS contradicts the trunk and the next phase stalls.
Reconcile the row to what was merged:

| Merged by a human | Row to write |
|---|---|
| `spec(NNN)` PR | `{NNN}\tspec\tapproved` |
| `design(NNN)` PR | `{NNN}\tdesign\tapproved` |
| `plan(NNN)` PR | `{NNN}\tplan\tapproved` |
| implementation PR for `NNN` | `{NNN}\tplan\timplemented` |

Reconciliation is bounded to that row: it records what happened, never advances
a later phase, never becomes standing authority for future work. A
`kata-release-merge` merge reconciles nothing — the gate merges only what STATUS
already authorized.

## Trust rule

Spec and design approvals must originate from a trusted human. Agents
**never** autonomously originate `spec approved` or `design approved` —
they only propagate signals already expressed by a trusted human. A human's
merge is such an expression, so reconciling per § Merge as approval is
propagation, not origination. Plans
may be approved by `staff-engineer` after a clean `kata-plan` panel
review. The product manager may originate a retention-PR approval once every
target is terminal and its durable signal preserved; the human-only rule stays
scoped to `spec approved` and `design approved`.

The release engineer's trust gate (top-7 contributor or `kata-agent-team`) is
canonical; `kata-dispatch` runs the same check before writing STATUS on a
PR-side signal.

## Signal invalidation

What un-counts a signal when a phase PR's head moves after approval. Four-point
mechanics:
[`review-transfer.md`](../../skills/kata-release-merge/references/review-transfer.md).
This section names the per-class pin source and consequence.

| Signal class | Pin source | On head move |
|---|---|---|
| `<phase>:approved` label | head SHA at the label event | human-originated: any delta voids, needs fresh human re-approval |
| `gh pr review --approve` | the review's commit SHA | same |
| Approval comment | head SHA when posted | same |
| In-session user message | head SHA recorded with the STATUS write (§ In-session approval) | same |
| `kata-plan` panel-clean | head SHA on the PR-side panel record | agent-originated: any delta voids, needs fresh `staff-engineer` re-approval |
| retention-PR approval | the PM review's own commit SHA | agent-originated: any delta voids, needs fresh `product-manager` review |

Retention PRs sit **outside** `review-transfer.md` (§ Applicability scopes it to
spec/design/plan PRs); the gate applies the row above directly. Mechanics match
`kata-plan` panel-clean — the PM review carries its own commit SHA, so no
separate pin is needed.

Rules:

- A signal with **no establishable pin** transfers to no other head; it is valid
  only where freshly re-confirmed.
- Patch-id equivalence alone never establishes a transfer.
- A content-identical move (review-transfer.md points 1 to 3) permits a recorded
  transfer. Any non-identical delta voids it.
- Voiding leaves STATUS as-is. Re-approval is a fresh signal with a fresh pin,
  not a STATUS rewrite.
- The merge classes need no pin — a merged PR is closed, so its head cannot
  move. That is not the same as carrying no weight: a human merge is a full
  approval (§ Merge as approval).

## In-session approval

When a trusted user approves a spec, design, or plan in an interactive session
("approve this spec"), the active agent sets the matching `wiki/STATUS.md` row,
commits the wiki, and lets the Stop hook push. No GitHub action is needed —
STATUS is canonical. Merge happens on the next `kata-release-merge` run.

The agent also records the approved head SHA with the write, so the signal
carries a pin: a PR comment when one exists, the wiki commit otherwise. An
approval given before any push is pinned at first push. The same duty covers
`kata-plan` panel-clean approvals through their on-PR record.

## Writing STATUS

`wiki/STATUS.md` wraps a tab-separated body in a fenced code block; replace a
row in place. Format: `{id}\t{phase}\t{status}`. Phases: `spec`, `design`,
`plan`. Statuses: `draft`, `approved`, `implemented` (plan only), `cancelled`.
Lifecycle: `spec draft → spec approved → design draft → design approved → plan
draft → plan approved → plan implemented`. Cancelled is terminal. A lockstep
spec+design PR (both in one `design(NNN)` PR) skips `spec approved`:
the row moves `spec draft → design draft → design approved`, which subsumes it.

Commit the edit with the session's other wiki updates; the Stop hook pushes it.

## Experiment rows

A spec-less experiment whose plan ships code carries its own row, keyed
`exp:{issue}`. Four tab cells:
`exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`. States are `registered` →
`approved` → `cancelled`; `plan-ref` is the `#NNN` holding the gate-comparable
execution plan.

| State | Meaning | Writer |
|---|---|---|
| `registered` | Registered with a code-shipping plan, no approval yet; pin `-`. | Owning agent (bookkeeping) |
| `approved` | A trusted human's PR-side signal observed; pin is the head SHA at signal time. | `kata-dispatch` or in-session agent |
| `cancelled` | Adjudicated FAIL or VOID, or retired; pin retained if ever approved, else `-`. | Owning agent (bookkeeping) |

`registered` and `cancelled` are bookkeeping states the owning agent writes; the
session facilitator writes no files. Only `approved` requires a human origin,
and propagation needs a pre-existing `registered` row — on an absent row the
signal waits until the owner backfills registration.

**Head pin.** The `approved` write records the head SHA at signal time, read at
the gate. Any later commit — including a gate-performed rebase — re-blocks until
a fresh human signal covers the new head, so the gate does not rebase an
approved-and-pinned experiment PR. This is stricter than pin-less spec rows
because no artifact bounds the approved commits.

Only the trusted-human PR-side signals in § The signals feed `approved` (label,
`gate` marker, approval comment, human merge, in-session message); an agent
verdict never does.

## Labels remain as input signals

Humans may still apply `<phase>:approved` labels for PR UI visibility. The label
fires `kata-dispatch`, which validates trust and writes STATUS. It is not the
merge gate.
