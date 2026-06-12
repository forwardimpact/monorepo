# Spec 1970 — Wiki metrics CSV appends survive concurrent sync-merges

## Personas and Jobs

| Persona            | Job                                                                                                                 | How the gap blocks progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki's metrics CSVs are the team's measurement substrate — XmR charts, experiment baselines, and verdict arithmetic all read them. When a sync-merge silently discards a concurrent session's appended rows, an experiment's verdict is computed from rows that no longer exist: #1706's growth-band adjudication lost its own baseline within 31 seconds of recording it. A measurement system that can unrecord measurements without anyone failing cannot anchor a Plan-Do-Study-Act loop. |
| Platform Builders  | [Libraries § Jobs To Be Done](../../libraries/README.md#jobs-to-be-done)                                            | The wiki sync behaviour in `libwiki` is the shared publish path every agent session uses. Its commit succeeds, its push succeeds, and the write is then destroyed by a _sibling_ session's conflict auto-resolution — a write API whose durability depends on what every other concurrent caller does is not safely composable, and no caller-side re-read can fix it.                                                                                                                            |

## Problem

On 2026-06-12 a single sync-merge erased three freshly recorded metric rows from
`wiki/metrics/improvement-coach/2026.csv` — one eraser, three victims
(forensics: [#1709](https://github.com/forwardimpact/monorepo/issues/1709),
re-keyed mechanism on
[#1711](https://github.com/forwardimpact/monorepo/issues/1711)):

| Time (UTC) | Event                                                                                                                                                            | Wiki commit |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 11:04:02   | Coach session records `storyboard_words,6094`                                                                                                                    | `c56a9086`  |
| 11:08:40   | Coach session records both #1706 baseline rows (`storyboard_autogen_words,5116`, `storyboard_narrative_words,1063`)                                              | `e64e43bb`  |
| 11:09:11   | A sibling session's sync-merge auto-resolves the concurrent CSV-tail conflict in favor of its own side — **all three rows erased**; that lane wins the push race | `c5ab3e6f`  |
| 11:26:40   | Two rows detected missing and backfilled by hand; the third was found only by the follow-up forensic pass                                                        | `f6d9b43b`  |

The mechanism is structural, not behavioral. The wiki sync publish behaviour
rebases on the remote branch and, when the rebase fails, falls back to a merge
that resolves **every** conflict by keeping the local side. Two sessions
appending different rows to the tail of the same CSV always conflict, so under
concurrent sessions — the normal operating mode of this team — whichever lane
publishes last silently destroys the other lane's measurement. The failure is
invisible to the writer: its append ran, its commit exists, its push succeeded.
The loss happens later, inside a process it does not control. This is why the
incident defeated both the writer's local re-read and the issue-side claim — and
why the first forensic pass misdiagnosed it as a write that never ran.

Detection exists only as an experiment-stage procedural check: the #1711
claim-vs-row boot verification (`claim_row_gaps`, verdict pending 2026-06-14)
catches a missing row one coach cycle later, as agent protocol rather than
shipped tooling. It stays regardless of outcome here — but detection without
prevention budgets a repair cycle per loss, and the wider corpus (the #1564
shared-workspace write-loss ledger; measurement-trust family #1704 / #1692 /
#1709) shows the loss rate is not rare.

Metrics CSVs are the right first target because they are the one wiki surface
where keep-both-sides is _always_ the correct merge for concurrent appends: rows
are append-only, line-oriented, and order-insensitive (each row carries its own
date and metric name; analysis groups by metric, never by file position).
Markdown surfaces have none of these properties, which is why they are excluded
below.

## Decision

The facilitated #1709 routing (2026-06-12 session, accepted by the
improvement-coach with the forensic reversal) adopted union-style merging — keep
both sides' lines — declared per path for `metrics/**/*.csv`, carried by the
wiki itself so it governs every clone and both publish paths. That decision is
this spec's WHAT; where the declaration lives, how provisioning ensures it, and
the precedence interaction with the existing merge fallback are the design's to
settle and demonstrate.

## What changes

| Component                           | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metrics-CSV merge behavior          | When two branches both change a `metrics/**/*.csv` file, the merged result keeps the rows from **both** sides instead of conflicting or side-picking — on every publish path the sync behaviour has (rebase and merge fallback alike). Concurrent appends to the same CSV stop being a conflict at all.                                                                                                                                                                                                                                                                                            |
| Wiki provisioning                   | Every wiki acquires the declaration without per-repo operator action: fresh wikis carry it from creation, existing wikis acquire it on their next sync, idempotently — present-and-correct means no edit and no churn commit. Downstream installations are covered by the same path. Which provisioning entity owns each half is a design choice.                                                                                                                                                                                                                                                  |
| Duplicate-row visibility            | When both sides append the **identical** line inside one merged region, the merged file carries it twice (the #1702 family's duplicate-row member). Requirement: duplicates are surfaced, never silently removed — the wiki audit gains a finding reporting exact-duplicate rows in metrics CSVs by file and line; removal stays with the row's owner. The finding has an exit path: the owner either deletes the surplus row or differentiates a genuinely-distinct measurement (any column edit — run id or note — makes the rows non-identical), so a confirmed-genuine pair cannot re-fire it. |
| Deletion durability under keep-both | Keep-both-sides cuts the other way for row _deletions_: a row deleted on one side while a concurrent append touches the same region is resurrected by the merge. Accepted, because deletions in metrics CSVs are rare, owner-driven repairs (dedup, corrections) — and a resurrected duplicate re-fires the audit finding, so the failure mode is a visible retry, not a silent loss. The spec trades silent erasure for visible, re-flagged resurrection; deletion convergence is the owner re-applying on a quiescent file.                                                                      |
| Erasure reproduction test           | An integration test reproduces the incident shape: two clones of one wiki each append a distinct row to the same metrics CSV and both publish through the sync behaviour, the second forcing the divergence. It asserts the final remote tip contains both rows; it fails on today's behavior.                                                                                                                                                                                                                                                                                                     |

Known accepted costs, recorded here so the design doesn't re-litigate them:
relative ordering of concurrently appended rows is arbitrary (harmless — order
is non-semantic per § Problem), and protection begins one sync after a clone
acquires the declaration, leaving a one-sync transition window per existing
clone during rollout (bounded, and covered by the #1711 detection check while it
lasts).

## Out of scope

- **Non-CSV wiki erasure.** Weekly logs, summaries, the claims table, MEMORY.md,
  and the storyboard keep today's merge behavior, and the keep-local-side
  fallback itself is not touched. Erasure on those surfaces is the structural
  territory of specs 1750/1780 (rows at `spec draft`, awaiting the human
  approval gate); this spec's scope is disjoint by construction — it alters
  merge behavior for `metrics/**/*.csv` and nothing else, and a success
  criterion below verifies the boundary rather than assuming it.
- **Read-side CSV validation** — refusing conflict markers, junk rows, glued or
  malformed lines (including the missing-trailing-newline merge edge) at
  analysis time is #1702's lane: this spec prevents one corruption class at
  write time; #1702 refuses what still gets through at read time.
- **The #1711 boot-verification protocol** — stays as the detection layer,
  unchanged.
- **Wiki edits made outside the sync path** (e.g. web UI) — out of reach of
  merge behavior declarations; unchanged.

## Success Criteria

| Claim                                           | Verification                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent distinct appends both survive.       | Integration test: two clones each append a different row to the same `metrics/**/*.csv` file and both publish via the sync behaviour; the final remote tip contains both rows (fails against current `main`). |
| The merge-fallback path also preserves appends. | A test case adds a concurrent **non-CSV** conflict so the rebase fails and the fallback merge runs; the tip still contains both CSV rows.                                                                     |
| Fresh wikis are protected from creation.        | Bootstrap a wiki fixture from scratch and run the two-clone append test against it with no further setup; both rows survive.                                                                                  |
| Existing wikis acquire protection idempotently. | Sync a wiki fixture lacking the declaration: exactly one change introduces it; a second sync produces zero changes and zero commits.                                                                          |
| Identical-row duplication is fail-visible.      | Against a fixture holding an exact duplicate row in a metrics CSV, `fit-wiki audit` reports a finding naming the file and line, and the rows are not auto-removed.                                            |
| A differentiated pair clears the finding.       | Edit one duplicate row's run id or note in the fixture; `fit-wiki audit` no longer reports the pair.                                                                                                          |
| The non-CSV boundary holds.                     | The two-clone conflict test repeated on a markdown file resolves exactly as today (local side wins on the fallback path).                                                                                     |
| Published contract is documented.               | `websites/fit/docs/libraries/predictable-team/wiki-operations/index.md` states the metrics-CSV keep-both-sides merge behavior, the duplicate-visibility trade, and the audit finding.                         |

## Relations

- [#1709](https://github.com/forwardimpact/monorepo/issues/1709) (obstacle)
  stays open on two clears: the #1711 verdict after 2026-06-14 EOD, and this
  spec landing. Forensic record: mechanism re-key on #1711
  ([comment](https://github.com/forwardimpact/monorepo/issues/1711#issuecomment-4691064627)),
  triage correction on #1709
  ([comment](https://github.com/forwardimpact/monorepo/issues/1709#issuecomment-4691067016)).
- Specs 1750/1780 — structural treatment of the general erasure mechanism;
  disjoint scope per § Out of scope.
- #1702 — read-side metrics parser trust; complementary lane.

— Staff Engineer 🛠️
