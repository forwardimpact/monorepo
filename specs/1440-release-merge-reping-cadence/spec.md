# Spec 1440 — Codify re-ping cadence for blocked PRs in `kata-release-merge`

## Persona and job

Hired by **Teams Using Agents** so the release-merge gate stays a
two-way channel: when a PR fails a gate, the team running the agent
team can rely on fresh signal arriving at a known cadence, not a
single comment that silently ages while the gate state drifts. Today
the skill posts the per-gate block comment from
`references/templates.md` once and then never re-comments on
subsequent runs, even when the gate state has changed (CI repairs,
STATUS row advances, owner shifts). The PR's awaited owner —
whichever role each gate makes responsible — sees nothing new, and
the loop stalls.

Related JTBD:
[Teams Using Agents — Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).

## Problem

Three terms used below, anchored to the existing skill:

- **Block comment** — the comment the skill posts when a PR is
  marked **blocked** by any of the six gates (trust, type, CI,
  mechanical readiness, approval, open comments). The five
  templated variants live in `references/templates.md` § Skip
  Comments (Untrusted Author, Unsupported PR Type, Awaiting Approval
  Signal, CI Failing, Substantive Conflict); the sixth — `awaiting
  trusted-contributor reply` — is the open-comment gate's reason
  per [`references/comment-gate.md`](../../.claude/skills/kata-release-merge/references/comment-gate.md).
- **Re-ping** — a fresh block comment from the skill on a
  subsequent release-merge run, posted while the PR is still in the
  same blocked state. A re-ping is a *new* comment, not an edit of
  the prior one.
- **At-gate PR** — an open PR that the skill classified as
  **blocked** on its most recent release-merge run and that remains
  blocked on the current run. Step 0 extracts these from the
  per-week PR classification table the skill appends in Memory.

The skill's Step 0 already reads the per-week PR classification
table to extract PRs blocked in previous runs with their
consecutive-block counts; the table is what carries at-gate state
across runs. The block comment posts once on the run that first
detected the failure. No rule in the skill describes what to do on
subsequent runs once the PR is already a known at-gate PR — so the
skill stays silent on the PR thread, and the awaited owner has
nothing new to read.

### Observed drift

Snapshot taken 2026-06-02: every open at-gate PR in the most recent
classification table, with its issue timeline queried for the most
recent comment authored by `app/kata-agent-team` and compared to the
snapshot date. The "Days since last RE comment" column equals
"Cal-days at gate" by construction — the block comment posted on
the run that first detected the failure and no re-ping has fired
since.

| PR | Phase | Cal-days at gate | Days since last RE comment |
| --- | --- | ---: | ---: |
| #1251 | design(1360) | 6 | 6 |
| #1250 | spec(1350) | 6 | 6 |
| #1226 | spec(1330) | 7 | 7 |
| #1161 | design(1220) | 10 | 10 |
| #1154 | spec(1290) | 10 | 10 |
| #1107 | design(1210) | 12 | 12 |
| #1064 | plan(1160) | 13 | 13 |
| #1043 | design(1040) | 14 | 14 |
| #972  | design(0940) | 16 | 16 |

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

The skill has no named rule that fires re-pings. Once a block
comment is posted and the PR is recorded as blocked in the
classification table, the skill has nothing instructing a subsequent
run to comment again, regardless of how the gate state has changed.
Whether the rule derives staleness from the table, from a fresh API
query, or from any other source is a design choice; the gap this
spec closes is the absence of any rule at all.

## Scope

### In scope

- The `kata-release-merge` skill carries a named **re-ping rule**
  that fires on every release-merge run — both scheduled sweeps and
  on-demand single-PR runs (per SKILL.md § When to Use) — with a
  3 calendar-day silence window. For any at-gate PR whose silence
  window has expired, the rule posts a fresh block comment from the
  matching gate template. The rule fires at most **once per silence
  window per PR**: each re-ping resets the window from its own
  timestamp, so the next re-ping on the same PR is no sooner than
  3 calendar days later. A literal "every run" reading that posts
  on every sweep is explicitly out (see § Excluded — comment-storm).

  The rule's staleness input is the timestamp of the most recent
  PR comment authored by the bot identity `app/kata-agent-team`.
  The *source* of that timestamp (a read from the per-week
  classification table, a fresh `gh api …/issues/<n>/comments`
  query, a derived index) is a design choice. The bot identity is
  committed; the data path is not.

- The skill's templates carry a **re-ping variant** of each per-gate
  block comment in `references/templates.md`. Each re-ping
  variant's body has three named sections — `state`, `owner`,
  `next_action` — populated per the per-gate owner taxonomy below.
  These named sections are testable: the success criterion below
  checks for the section names, not the prose around them.

- The skill's per-run **Classification Report** (Step 10 +
  `references/templates.md` § Report Summary) distinguishes a
  re-pinged PR from a newly-blocked PR via a **distinct action
  category** — e.g., a `re-pinged` value in the `Action` column,
  separate from `blocked`. The category is committed; the exact
  field name and report layout remain a design choice.

#### Per-gate owner taxonomy

The `owner` section of each re-ping comment names the role whose
next action unblocks the PR. The taxonomy is committed at the role
level; resolving the role to a concrete login (e.g., looking up the
top-7 list, or reading the latest unresolved-concern author) uses
the existing skill mechanisms (Step 2, comment-gate.md), not new
logic.

The `Gate (attribute)` column ties each row back to the six-gate list
at § Problem ¶1 ("trust, type, CI, mechanical readiness, approval,
open comments"). The `Gate (block reason)` column is the
template-name vocabulary used in `references/templates.md` and on the
re-ping comment itself.

| Gate (attribute)     | Gate (block reason)                | `owner` role on the re-ping              |
| -------------------- | ---------------------------------- | ---------------------------------------- |
| trust                | Untrusted Author                   | A trusted human (top-7 contributor) who can review |
| type                 | Unsupported PR Type                | A trusted human who can re-title or close the PR |
| CI                   | CI Failing                         | The PR author (agent or human)           |
| mechanical readiness | Substantive Conflict               | The PR author                            |
| approval             | Awaiting Approval Signal           | A trusted human who can apply the approval signal |
| open comments        | Awaiting trusted-contributor reply | The named trusted-contributor whose comment remains open |

### Excluded

- **Changes to the six gates themselves.** Trust, type, CI,
  mechanical readiness, approval, open comments — none of the gate
  logic changes. The change is about what the skill does after a
  gate fails, not which gates exist.
- **A literal "fires on every run" reading.** The rule fires at
  most once per silence window per PR; each re-ping resets the
  window. Implementations that post a fresh comment on every
  release-merge run once the window first opens — a comment-storm —
  are explicitly out.
- **Notification surfaces outside the PR thread.** The re-ping
  rule posts a fresh PR comment; it is not a Slack ping, an Issue
  cross-link, or any out-of-band notification. Approver routing
  remains the existing label/review/comment path.
- **How the rule reads the staleness timestamp.** The bot identity
  is committed (`app/kata-agent-team`); whether the skill reads the
  staleness signal from the per-week classification table, from a
  fresh `gh api …/issues/<n>/comments` query, from a derived index,
  or from any other source is a design choice. The data path is
  deferred; the input is not.
- **The exact report-channel format.** The Classification Report
  must distinguish re-pings from initial blocks via a distinct
  action category (committed). Whether that is a new `Action`
  value, a new column, or a separate report section is a design
  choice.
- **Subsequent tuning of the cadence.** Storyboard observation may
  later argue for moving the 3-day window or the per-run rate;
  that tuning is a later obstacle, not this spec.
- **Backfilling re-ping comments to currently silent PRs.** Once
  the change lands, the first run against `main` posts the fresh
  round; no separate backfill step is part of this spec.
- **The release-engineer's free-form summary or weekly log
  content.** What the skill writes into the per-week classification
  table is what the skill owns; what the release-engineer writes in
  summary or weekly logs is unchanged.

## Success criteria

| Claim | Verifies via |
|---|---|
| The `kata-release-merge` skill states a named re-ping rule whose three parameters are: (a) a 3 calendar-day silence window, (b) fires on every release-merge run (scheduled and on-demand), (c) each re-ping resets the window. | Reading the skill shows a named rule whose stated parameters match all three: window length, trigger scope, reset-on-fire behaviour. |
| The skill's templates carry a re-ping variant of each per-gate block comment, referenced from the re-ping rule, whose body contains three named sections — `state`, `owner`, `next_action` — with the `owner` populated per the per-gate owner taxonomy above. | Reading `references/templates.md` shows one re-ping variant per gate; each variant's body has the three named section headers and references the rule; spot-checking one variant per gate shows the `owner` role matches the taxonomy row. |
| The skill's per-run Classification Report distinguishes re-pings from initial blocks via a distinct action category, observable per-PR. | Reading Step 10 and `references/templates.md` § Report Summary shows a re-ping action category in the report schema that is separate from `blocked`, with one row per re-pinged PR. |

### Rationale for the 3-day window

The window mirrors the storyboard's `Open at-gate PRs silent >3
cal-days = 0` target, so a successful sweep against the rule
directly retires that storyboard signal. Subsequent tuning is
excluded above.

## Storyboard outcome (not a spec success criterion)

After the change lands, the storyboard observes — over multiple
weeks — whether the three signals in § Storyboard signals move
toward target. The spec is considered delivered when § Success
criteria pass; whether the storyboard targets move is a separate
observation that informs the next obstacle, not a precondition for
approving this spec.
