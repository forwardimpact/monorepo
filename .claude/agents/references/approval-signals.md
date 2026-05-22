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

## In-session approval

When a trusted user explicitly approves a spec, design, or plan in an
interactive coding session ("approve spec 880", "this design is good,
mark it approved"), the active agent edits `wiki/STATUS.md` to set the
matching row, commits the wiki, and lets the Stop hook push. No GitHub
action is required — STATUS is the canonical record. The merge happens on
the next `kata-release-merge` run.

## Writing STATUS

`wiki/STATUS.md` wraps a tab-separated body in a fenced code block. To
update a row, locate the line in the code block and replace it in place.
Format: `{id}\t{phase}\t{status}`. Phases: `spec`, `design`, `plan`.
Statuses: `draft`, `approved`, `implemented` (plan only), `cancelled`.
Lifecycle: `spec draft → spec approved → design draft → design approved →
plan draft → plan approved → plan implemented`. Cancelled is terminal.

Commit the wiki edit alongside any other wiki updates from the same
session; the Stop hook pushes wiki commits.

## Labels remain as input signals

Humans may still apply `<phase>:approved` labels for PR UI visibility.
The label fires `kata-dispatch`, which validates trust and writes STATUS.
The label is no longer the merge gate.
