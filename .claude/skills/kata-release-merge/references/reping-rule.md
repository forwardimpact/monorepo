# Re-ping Rule — Candidate Set and Mechanics

Mechanics for the **Re-ping Rule** invoked in SKILL.md Step 10 (item 4). The
rule keeps the gate a two-way channel: a PR that stays blocked across runs gets
a fresh, owner-named comment on a known cadence instead of one block comment
that silently ages.

## Parameters

The named **Re-ping Rule** has three parameters:

- **Window** — a **3 calendar-day** silence window.
- **Trigger** — **fires on every release-merge run**, scheduled sweep and
  on-demand single-PR run alike (SKILL.md § When to Use).
- **Reset** — each re-ping **resets the window** from its own timestamp, so the
  next re-ping on the same PR is no sooner than 3 calendar days later. The rule
  is therefore self-limiting to once per window per PR — no comment-storm.

## Candidate set

Open PRs still **blocked** after this run's merges (Step 10 items 1–3). PRs
that passed all gates merged and are gone. There is no prior-run-membership
check — the silence window test below filters out PRs first blocked this run.

For each candidate, `read` the change's discussion
([work-trackers.md](../../../agents/references/work-trackers.md)) and take the
most-recent bot comment timestamp (`user.login == "kata-agent-team[bot]"`).

This is the same conversation thread the open-comment gate reads
([`comment-gate.md`](comment-gate.md)); every block, re-ping, and merge comment
this skill posts is a `comment` on the change and lands here, so the
most-recent bot comment is the true silence anchor. The login on this endpoint
is `kata-agent-team[bot]` — pin that, not the `app/kata-agent-team` identity
slug.

The per-week PR classification table carries **no** last-comment timestamp
column. Staleness comes from this fresh query each run, not from maintained
table state — a maintained column is per-run state that drifts silently.

## Decision per candidate

- Most-recent bot comment **older than 3 calendar days** → **due**.
- **No bot comment at all** → **due** (guarantees every blocked PR carries one
  owner-named comment; rare, since Steps 2–8 of this run normally posted a
  first-block comment).
- Most-recent bot comment **within 3 calendar days** (including the first-block
  comment Steps 2–8 just posted) → **not due**: skip.

When due, post the matching re-ping variant from
[`templates.md`](templates.md) § Re-ping Comments for the PR's block reason
**already computed in this run's Steps 2–8** — do not re-run the gates or
re-`read` the change's CI checks
([work-trackers.md](../../../agents/references/work-trackers.md)); the failing
checks and reason carry from the run's own classification.

## Owner taxonomy

The `owner` section of each re-ping names the role whose next action unblocks
the PR. Role → login resolution reuses existing mechanisms, with no new logic:

| Gate (attribute)     | Gate (block reason)                | `owner` role on the re-ping                        |
| -------------------- | ---------------------------------- | -------------------------------------------------- |
| trust                | Untrusted Author                   | A trusted human (top-7 contributor) who can review |
| type                 | Unsupported PR Type                | A trusted human who can re-title or close the PR   |
| CI                   | CI Failing                         | The PR author (agent or human)                     |
| mechanical readiness | Substantive Conflict               | The PR author                                      |
| approval             | Awaiting Approval Signal           | A trusted human who can apply the approval signal  |
| open comments        | Awaiting trusted-contributor reply | The named trusted-contributor whose comment remains open |

The **CI** and **mechanical readiness** rows resolve to the PR author; the
**open comments** row resolves to the unresolved-concern author via
[`comment-gate.md`](comment-gate.md); the **trust**, **type**, and **approval**
rows name a role drawn from the Step 2 top-7 list and stay role-level (no
single login).
