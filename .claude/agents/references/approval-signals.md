# Approval Signals

Approval state for spec, design, and plan phases is recorded in
`wiki/STATUS.md` — the canonical record. STATUS is read by
`kata-release-merge` to decide which phase PRs may merge. Multiple signal
types feed STATUS; the agent that observes the signal validates trust and
writes the row.

## The signals

| Signal | Source | Captured by |
|---|---|---|
| `<phase>:approved` label on PR | Human or `/ship-it` | `kata-dispatch` (label event) |
| `gh pr review --approve` | Trusted-account approver | `kata-dispatch` (review event) |
| Approval comment ("approve", "LGTM", "ship it") | Trusted contributor on PR | `kata-dispatch` (comment event) |
| Merged phase PR | Trusted merger (`kata-release-merge` or human) | `kata-dispatch` (PR close event with `merged: true`) |
| Direct user message in interactive session | Trusted user | Active agent (in-session) |
| `kata-plan` panel-clean | `staff-engineer` (plans only) | `kata-plan` skill |
| Implementation merge | `kata-release-merge` | Skill (writes `plan implemented`) |

## Trust rule

Spec and design approvals must originate from a trusted human. Agents
**never** autonomously originate `spec approved` or `design approved` —
they only propagate signals already expressed by a trusted human. Plans
may be approved by `staff-engineer` after a clean `kata-plan` panel
review.

The release engineer's trust gate (top-7 contributor or `kata-agent-team`)
is the canonical trust check. `kata-dispatch` runs the same check before
writing STATUS in response to a PR-side signal.

## Signal invalidation

The signals table above defines which signals count. This section defines
what un-counts them when a phase PR's head moves after approval. The full
four-point mechanics live in
[`kata-release-merge/references/review-transfer.md`](../../skills/kata-release-merge/references/review-transfer.md);
this section names the per-class pin source and the head-move consequence.

| Signal class | Pin source | On head move |
|---|---|---|
| `<phase>:approved` label | head SHA at the label event | re-verify per review-transfer.md; human-originated, so any delta voids and needs fresh human re-approval |
| `gh pr review --approve` | the review's commit SHA | same as label (human-originated) |
| Approval comment | head SHA when the comment was posted | same as label (human-originated) |
| In-session user message | head SHA recorded with the STATUS write (§ In-session approval) | same as label (human-originated) |
| `kata-plan` panel-clean | head SHA on the PR-side panel record | agent-originated; any delta voids and needs fresh `staff-engineer` re-approval |

Rules:

- A signal with **no establishable pin** transfers to no other head. It is
  valid only on a head where it is freshly re-confirmed.
- Patch-id equivalence alone never establishes a transfer.
- A content-identical move (review-transfer.md points 1 to 3) permits a
  recorded transfer. Any non-identical delta voids it.
- STATUS is untouched by voiding. A voided transfer leaves the row as-is.
  Re-approval is a fresh signal with a fresh pin, not a STATUS rewrite.
- The "Merged phase PR" and "Implementation merge" classes are inert. A
  closed PR has no head move, so they need no pin beyond their existing record.

## In-session approval

When a trusted user explicitly approves a spec, design, or plan in an
interactive coding session ("approve this spec", "this design is good,
mark it approved"), the active agent edits `wiki/STATUS.md` to set the
matching row, commits the wiki, and lets the Stop hook push. No GitHub
action is required — STATUS is the canonical record. The merge happens on
the next `kata-release-merge` run.

The active agent also records the approved head SHA alongside the STATUS
write, so the signal carries a pin. Record it as a PR comment when a PR
exists, or with the wiki commit otherwise. An approval given before any push
is pinned by the same agent at first push. The same recording duty covers
`kata-plan` panel-clean approvals through their existing on-PR record.

## Writing STATUS

`wiki/STATUS.md` wraps a tab-separated body in a fenced code block. To
update a row, locate the line in the code block and replace it in place.
Format: `{id}\t{phase}\t{status}`. Phases: `spec`, `design`, `plan`.
Statuses: `draft`, `approved`, `implemented` (plan only), `cancelled`.
Lifecycle: `spec draft → spec approved → design draft → design approved →
plan draft → plan approved → plan implemented`. Cancelled is terminal.

Commit the wiki edit alongside any other wiki updates from the same
session; the Stop hook pushes wiki commits.

## Experiment rows

A spec-less experiment whose execution plan ships code carries its own
approval row, keyed `exp:{issue}` (the experiment issue number). The row is
four tab cells: `exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`. States are
`registered` → `approved` → `cancelled`; `plan-ref` is the `#NNN` of the issue
holding the gate-comparable execution plan.

| State | Meaning | Writer |
|---|---|---|
| `registered` | Experiment registered with a code-shipping plan, no approval yet; pin is `-`. | Owning agent (bookkeeping) |
| `approved` | A trusted human's PR-side signal observed; pin is the head SHA at signal time. | `kata-dispatch` or in-session agent, on a human signal |
| `cancelled` | Experiment adjudicated FAIL or VOID, or retired; pin retained if it was ever approved, else `-`. | Owning agent (bookkeeping) |

`registered` and `cancelled` are bookkeeping states the owning agent writes —
the agent that creates, comments on, and closes its own experiment issues. The
session facilitator writes no files. Only `approved` requires a human origin,
and propagation requires a pre-existing `registered` row: on an absent row the
signal does not propagate until the owner backfills registration.

**Head pin.** The `approved` write records the PR head SHA at signal time, read
from the row at the gate. Any later commit — including a gate-performed
mechanical rebase — re-blocks the PR until a fresh human signal covers the new
head. The gate does not rebase an approved-and-pinned experiment PR. This pin
is stricter than the pin-less spec-row approvals because no spec, design, or
plan artifact bounds what the approved commits contain.

The signal types feeding `approved` are the trusted-human PR-side signals in
§ The signals (label, `--approve` review, approval comment, in-session
message); an agent verdict is never one of them.

## Labels remain as input signals

Humans may still apply `<phase>:approved` labels for PR UI visibility.
The label fires `kata-dispatch`, which validates trust and writes STATUS.
The label is no longer the merge gate.
