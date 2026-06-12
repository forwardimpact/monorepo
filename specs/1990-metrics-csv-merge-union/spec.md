# Spec 1990: Union merge for wiki metric CSVs

**Status:** draft
**Origin:** Obstacle [#1709](https://github.com/forwardimpact/monorepo/issues/1709),
mechanism forensics on experiment
[#1711](https://github.com/forwardimpact/monorepo/issues/1711)
(structural fix accepted in the facilitated session of 2026-06-12)
**Persona / Job:** Teams Using Agents —
[run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
The team's improvement loop adjudicates experiments from XmR metrics; that
only works if a metric row, once appended, stays appended.

## Problem

Wiki metric appends are silently erased when two sessions write
concurrently. The wiki sync layer (libwiki `WikiSync.commitAndPush`)
resolves divergence by rebasing on the remote and, when the rebase
conflicts, falls back to a merge that favors the local side. Metric CSVs
are append-only event logs: concurrent sessions append different rows at
the same file tail, the tails conflict, and the favor-local resolution
discards every row the other session pushed — committed, pushed work
erased with no conflict surfaced to either writer.

Evidence (all first-hand-verified on #1711, comment
[4691064627](https://github.com/forwardimpact/monorepo/issues/1711#issuecomment-4691064627)):

- One sync merge on 2026-06-12 erased **three** metric rows from
  `metrics/improvement-coach/2026.csv` — two #1706 experiment baseline
  rows (committed and pushed, erased 31 seconds later) and one
  `storyboard_words` row. A single eraser, three victims.
- The erasure blocked adjudication of experiment #1706 (its baseline
  vanished), spawned obstacle #1709 and experiment #1711, misled #1711's
  first forensic pass (path-limited pickaxe is blind to merge-discarded
  side-branch commits), and cost three backfill repairs.
- This is one instance of the stale-base side-pick erasure corpus
  tracked on obstacle
  [#1564](https://github.com/forwardimpact/monorepo/issues/1564) and the
  wiki's `parallel-collision-ledger.md` (85+ occurrences), a large
  fraction of them wiki-file erasures by exactly this rebase-abort →
  favor-local merge path.

The current countermeasures are detection, not prevention: per-cycle
claim-vs-row sweeps catch the loss one cycle late and require manual
backfill from issue bodies or git blobs. For append-only CSVs the
conflict is spurious — both sides' rows are wanted, always.

## What

Declare git's built-in **union merge** for metric CSVs in the wiki, so
concurrent appends to the same CSV keep both sides' rows instead of
discarding one side:

1. **Wiki `.gitattributes`** — the wiki repository carries the attribute
   line `metrics/**/*.csv merge=union`. In a clone whose checked-out
   tree carries the committed attribute, both branches of the sync flow
   — the rebase and the favor-local merge fallback — resolve CSV
   append-append divergence by keeping both row sets, so this erasure
   class no longer fires on metric appends.
2. **libwiki bootstrap support** — `fit-wiki init` (the session-start
   bootstrap) ensures the attribute **line** is present in the wiki's
   `.gitattributes` (creating the file or appending the line to an
   existing one) and **committed**, so protection is active in that
   clone immediately and propagates to the wiki remote on the session's
   normal push. An uncommitted scaffold is not sufficient: the sync
   flow autostashes uncommitted residue and reads attributes from the
   checked-out tree, and pathspec-scoped commits would never sweep it.
3. **Repro test** — a libwiki test reproduces the #1709 erasure —
   divergent appends to one metrics CSV, one side pushed, the other
   side running `commitAndPush` — and demonstrates that without the
   attribute one side's rows are lost and with it both row sets survive
   at the merged tip.

## Why union merge is correct here

Metric CSVs under `metrics/` are append-only event rows (schema
`date,metric,value,unit,run,note,event_type`, one event per line with no
embedded newlines); rows are independent events keyed by date/metric/run,
and consumers (`fit-xmr`, `fit-wiki refresh`) order by the date column,
so file order carries no meaning. Union merge's caveats are acceptable
for this content class:

- **Duplicate lines** require both sessions to append a byte-identical
  event row; the run-id and note columns make that practically
  impossible, and a duplicate would be visible in the file rather than
  silent.
- **Concurrent edits** to an existing row (the rare correction case,
  e.g. a backfill flag) can retain both versions when they collide with
  a divergent sibling — again visible as two adjacent variants, not a
  silent loss; normalization stays out of scope.
- The shared header line is identical on both sides and cannot
  conflict.

The trade across the board: today's failure mode is silent erasure of
committed work; union's worst case is visible duplication.

## Scope

| In                                                               | Out                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `metrics/**/*.csv` union-merge attribute line in the wiki        | Markdown wiki surfaces (MEMORY.md claims table, weekly logs, storyboards) — union is unsafe there  |
| `fit-wiki init` ensuring the line is present and committed       | Redesign of the sync/rebase flow itself (specs 1750/1780 lineage, human gate)                      |
| Repro/regression test in libwiki                                  | Allocation/reservation contracts (specs 1840/1850, in adjudication)                                |
|                                                                   | Dedup or ordering normalization of CSV rows                                                        |
|                                                                   | Widening the attribute to all CSVs (`**/*.csv`) — future CSVs are not guaranteed append-only       |

## Success criteria

| # | Claim                                                                                                                                                     | Verify by                                                                          |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 | `fit-wiki init` ensures the `metrics/**/*.csv merge=union` line in the wiki `.gitattributes` — creating the file, or appending the line to an existing file that lacks it — and commits it; when the committed line is already present, init makes no change. | libwiki init integration test covering all three cases                                |
| 2 | The repro test shows the #1709 mechanism: without the attribute, divergent CSV appends through `commitAndPush` lose one side's rows.                         | libwiki test exercising the sync flow without the attribute                           |
| 3 | With the attribute committed, the same divergent appends survive at the merged tip — both row sets present.                                                  | libwiki test asserting both row sets after `commitAndPush`                            |
| 4 | Existing libwiki behavior is unchanged for non-CSV paths (favor-local fallback still resolves markdown conflicts as today).                                  | existing libwiki test suite passes (`bun test libraries/libwiki`)                     |
| 5 | Repository quality gates pass.                                                                                                                               | `just check` / CI                                                                     |
| 6 | *Deployment end-state (post-merge, not PR-gated):* the wiki remote's published tip carries the attribute line after the first post-fix session push.         | `git show origin/master:.gitattributes` in the wiki clone                             |

## Open questions

1. **Eager propagation** — init commits the attribute locally, which
   protects that clone's own merges immediately; other clones are
   protected only after the commit reaches the remote and they pull.
   Should init push the commit eagerly rather than ride the session's
   normal push, to shrink the multi-clone window? (Default assumed:
   normal push; the design decides.)

— Staff Engineer 🛠️
