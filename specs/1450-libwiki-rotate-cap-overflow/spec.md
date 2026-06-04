# Spec 1450 — libwiki rotate bisects an over-cap source into budget-conforming parts

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The memory protocol promises that sealed weekly-log parts conform to the budgets so a downstream reader (boot digest, fit-wiki audit, an agent skimming a teammate's history) can rely on a fixed-cost read per part. The rotation primitive can today produce a sealed part that exceeds a budget, and the only automated remediation (`fit-wiki fix`) cannot heal it — so the `check-context.yml` wiki audit recurs red until a human hand-bisects the over-cap file. The team's CI signal is repeatedly broken by a problem the tooling exists to prevent, and an unresolved red gate trains the team to treat the signal as noise. |
| Platform Builders | [Compose libraries](../../libraries/README.md#jobs-to-be-done) | `libwiki` is shared infrastructure consumed by every agent profile and by future tooling. A primitive whose documented invariant is "sealed parts are at-or-under the budget" but whose runtime behaviour silently violates that invariant — and whose only escape hatch is manual recovery — erodes the trust this audience extends to the library catalog. |

## Problem

A weekly log is governed by two independent budgets — a line-budget and a
word-budget. The libwiki rotation primitive performs a plain rename of the
current weekly-log file to the next `*-partN.md` slot whenever rotation is
triggered. It only protects the under-budget case — a file that already
exceeds a budget before rotation is renamed as-is. The sealed part is born
over-budget and the invariant the audit asserts ("sealed parts conform to
the budgets") is silently broken.

The shape occurs on both rotation paths:

| Trigger | Pre-rotation state | Today's outcome |
|---|---|---|
| Append path — the `log decision` / `log note` / `log done` commands call the rotation primitive (line-budget guard) before appending. The guard rotates when `current + appendLines` would exceed the line-budget and otherwise falls through. | Source already at or above the line-budget (e.g. a manual edit grew the file). | Rename runs; the sealed part carries the entire over-budget source. The append then succeeds against a fresh file, so the corruption hides in the sealed part the agent will not read until later. |
| Force-rotate path — `fit-wiki rotate` CLI and the `fit-wiki fix` auto-fixer, which call the rotation primitive with `force: true`. | Source already over a budget. | Rename runs unconditionally; the sealed part is born over-budget. The CLI prints a success line; the auto-fixer's re-audit re-flags the new part. |

The append-path guard tests only the line-budget, so a source that is over
the word-budget but under the line-budget is rotated only by the `force`
paths (the auto-fixer forces precisely so it catches that case). Either way,
once rotation does trigger, the rename can seal an over-budget part.

Recovery today is a manual day-section bisect by a human or agent who later
notices the over-cap part. The observed incident at the time of this spec
(2026-06-02, product-manager weekly-log W23-part1) landed at 566 lines
against a 496-line cap (~14 % over) after a single normal `fit-wiki rotate`
invocation; recovery split it into two budget-conforming parts at a
day-section seam.

### Why bisect, not refuse-and-error

An earlier draft of this spec committed to **(b) refuse-and-error** — refuse
the rename when the source already exceeds the cap and surface a structured
failure — and deferred **(a) auto-bisect** out of a concern that a boundary
heuristic would couple shared infrastructure to the weekly-log section
convention. Field evidence has reversed that call:

- **Refuse-and-error does not clear the recurring CI red.** The
  `check-context.yml` `wiki` job runs `fit-wiki audit` read-only on every
  push and PR. The only *automated* remediation is `fit-wiki fix`
  (`rotateOverBudgetMainLogs`), run by `kata-wiki-curate` and by agents at
  DO-CONFIRM. Under (b) that auto-fixer cannot self-heal an over-cap log: the
  primitive refuses, the budget finding survives the re-audit, and it flows
  to the **flag** set (exit 2, "needs a human"). The audit stays red until a
  human hand-bisects. "Agents have ignored wiki audit issues" is exactly this
  gap — (b) converts a silent corruption into a loud-but-still-manual one,
  and the manual step is the step that keeps getting skipped.

- **The coupling concern was weaker than it looked.** `rotateIfOverBudget`
  is not generic infrastructure — it is already weekly-log-specific. It
  computes `weeklyLogPath`, writes weekly-log H1s via `defaultH1`, and only
  ever operates on a `<agent>-YYYY-Www.md` file. Bisecting that same shape at
  its own `## YYYY-MM-DD` day-section seam adds no coupling the primitive does
  not already carry. The hypothetical "other consumer without the section
  convention" does not exist; the only callers (`fit-wiki rotate`,
  `fit-wiki log …`, `fit-wiki fix`) all act on weekly logs.

- **Refuse-and-error survives as the floor.** Bisect resolves the common
  multi-day overflow automatically. A single day-section that *alone* exceeds
  either budget cannot be split at a day seam; for that irreducible residue
  the primitive keeps the (b) guarantee — it never silently emits an
  over-budget part, it surfaces a structured signal naming the un-splittable
  section, and the audit's existing sealed-part rule flags exactly that one
  part. So this spec loses none of (b)'s "no silent over-budget part"
  guarantee while closing the automation loop for everything that *can* be
  split.

This spec therefore commits to **(a) auto-bisect at the day-section seam**,
with refuse-and-error retained as the irreducible-residue floor. Finer-grained
seams (splitting *within* a single day-section) remain a future opt-in
`bisectStrategy` extension; they are not needed to clear the observed CI
failures.

## Scope

### In scope

| Component | What changes |
|---|---|
| The rotation primitive's seal behaviour when the source exceeds the line- or word-budget. | Instead of one plain rename, the primitive splits the source at its `## YYYY-MM-DD` day-section seams and writes one-or-more sealed `*-partN.md` files, each at-or-under **both** the line- and word-budget and each carrying a conforming part H1 (`# <agent> — YYYY-Www (part N of M)`). No day-section is split across two parts. The original H1 and any preamble above the first day-section travel with the first part. The split is content-preserving — the parts' bodies (below their part H1s), in order, equal the original source body below its H1 — and atomic: all parts are written and the source replaced, or nothing changes. |
| The rotation primitive's behaviour for the under-budget case. | Unchanged. The opportunistic short-circuit (`current + appendLines` within the line-budget, on the non-`force` path) still means "no rotation needed"; this spec changes only what happens once rotation is triggered. |
| The rotation primitive's result shape. | Generalises to let a caller distinguish three outcomes: **no rotation needed**, **sealed** (with the list of `*-partN.md` files produced — one or many), and **bisect-incomplete** (a day-section that alone exceeds either budget remains, named in the signal). No two outcomes share a caller-visible shape. |
| The `force: true` path. | `force` triggers the same bisect-on-seal. It does not waive the per-part budget: a `force` rotation of an over-budget source yields conforming parts, not one born-over-budget part. |
| The irreducible-residue floor. | When a single `## YYYY-MM-DD` day-section alone exceeds either budget, the primitive seals it as its own part, bisects the rest as normal, and surfaces the bisect-incomplete signal naming that section. It never silently produces an over-budget part without that signal. |
| The `fit-wiki rotate` CLI handler. | Prints each `*-partN.md` file produced (not a single `→ part`). Exits non-zero only when the result is bisect-incomplete, naming the un-splittable day-section and its overflow and pointing at the manual-recovery convention. A clean multi-part seal exits zero. |
| The append paths (`fit-wiki log decision`, `log note`, `log done`). | Continue to rotate-then-append. The seal may now produce multiple parts; the append still proceeds against the fresh current file (opening a new dated entry). On a bisect-incomplete result the append still proceeds against the fresh current and the residue signal is surfaced (the over-budget residue is a sealed part, not the live file). |
| The `fit-wiki fix` auto-fixer (`rotateOverBudgetMainLogs`). | No structural change at the call site — it already invokes the primitive on the agent's current-week main log. The observable shift is the point of this spec: an over-cap current-week log is now **resolved** (the re-audit is clean and CI goes green) instead of being sealed into an over-cap part whose budget finding flows to the human-flag set. Only a genuinely irreducible day-section still flags for a human. |
| The fit-wiki audit's sealed-part-budget hint text. | The sealed-part budget hints are updated: the bisecting seal now produces parts at-or-under both budgets, so an over-budget sealed part means either a hand-edited part or an irreducible single-day section — the cases a human should still see and act on. The sealed-part budget findings remain a human-flag (they are produced at the seam by the primitive, not by re-splitting a part that is already sealed). |

### Out of scope

- **Finer-than-day-section splitting.** Splitting *within* a single
  `## YYYY-MM-DD` day-section (at `###` subheadings, paragraphs, or lines) is
  the future opt-in `bisectStrategy` extension. This spec bisects only at day
  seams and flags an irreducible single-day section.
- **Retroactive re-bisection of already-sealed over-cap part files.** No such
  part exists in the wiki today, and the bisecting seal prevents new ones. A
  curator still recovers a legacy or hand-edited over-cap part ad hoc; this
  spec does not add a part→parts re-split path.
- **Mutating the wiki from the CI `wiki` job.** The `check-context.yml` audit
  stays read-only. The fix happens when `fit-wiki fix` runs (curation or an
  agent's DO-CONFIRM); the *next* audit then passes. This spec makes that
  automated fix actually resolve the finding — it does not make CI write to
  the wiki.
- **Sibling issue #1371** — `fit-wiki rotate` env-fallback agent-selection
  footgun. Different code path, different failure shape, materially
  independent; tracked separately.
- **Retuning the line- or word-budget** (`WEEKLY_LOG_LINE_BUDGET`,
  `WEEKLY_LOG_WORD_BUDGET`, and the summary/storyboard caps). The cap values
  are not in question; only the primitive's behaviour at the cap is.
- **Changing the rotation trigger.** The opportunistic line-budget
  short-circuit on the non-`force` path continues to mean "no rotation
  needed"; this spec does not make the append path rotate on word-overflow
  (the `force` paths already do). Only the seal that runs once rotation is
  triggered changes.

## Success Criteria

| Claim | Verification |
|---|---|
| An over-budget source spanning multiple day-sections is sealed into multiple budget-conforming parts. | Drive the primitive against a source that exceeds the line-budget across several `## YYYY-MM-DD` sections, and again against one that exceeds only the word-budget; in each case observe ≥2 `*-partN.md` files are created, each at-or-under both the line- and word-budget, and the current `<agent>-YYYY-Www.md` is left as a fresh budget-clean file. |
| The split loses and duplicates no content. | Concatenate the bodies of the produced parts — each below its own `# <agent> — YYYY-Www (part N of M)` H1 — and observe they equal the original source body below its H1, in order, with no day-section content dropped or repeated. |
| Bisect cuts only at day-section seams. | Observe every produced part begins at a `## YYYY-MM-DD` boundary and no single `## YYYY-MM-DD` section's content is divided across two parts. |
| The re-audit is clean after a bisecting seal. | Seal an over-cap multi-day source via the primitive, then drive the fit-wiki audit; observe no `weekly-log.*-budget` or `weekly-log-part.*-budget` finding remains for that agent's logs. |
| `fit-wiki fix` resolves an over-cap current-week log end-to-end with no human action. | Drive `fit-wiki fix` against a wiki whose current-week main log exceeds the cap across multiple day-sections; observe it exits zero (audit clean), the budget finding does not appear in the human-flag set, and each resulting part conforms. |
| The `force: true` path bisects and does not waive the per-part budget. | Drive `fit-wiki rotate` (which forces) against an over-cap multi-day current log; observe it seals into conforming parts, prints each part path, and exits zero — no born-over-cap part. |
| An append path against an over-budget source bisects, then appends to a fresh current file. | Drive `fit-wiki log decision` against a wiki whose current weekly log exceeds a budget across multiple splittable day-sections; observe the source is sealed into conforming parts, the new entry opens a fresh dated entry in a fresh current `<agent>-YYYY-Www.md`, and a subsequent audit reports no budget finding for that agent's logs. |
| An irreducible single-day section is flagged, never silently shipped over-budget. | Drive the primitive against a source containing one `## YYYY-MM-DD` section that alone exceeds either budget; observe the primitive surfaces a bisect-incomplete signal naming that section, the rest of the source is still bisected into conforming parts, and the only audit finding is the single irreducible part — no clean-success line hides it. |
| The caller can tell the three outcomes apart. | Drive the primitive across under-cap, over-cap-but-splittable, and over-cap-with-an-irreducible-section sources; observe the caller branches on three distinct results (no rotation / sealed-with-part-list / bisect-incomplete) with no two mapping to the same observable outcome. |
| The seal is atomic. | Induce a write failure partway through producing the parts; observe the source file is left intact (path, contents, inode unchanged) and no partial set of `*-partN.md` files is left behind. |

— Product Manager 🌱
