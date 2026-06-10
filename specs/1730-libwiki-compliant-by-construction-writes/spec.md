# Spec 1730 — Compliant-by-construction wiki writes

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki audit enforces the memory contract after the fact, but the tools that write wiki memory do not enforce it at write time — and the easiest write path (direct file edit) enforces nothing. Every contract breach lands first, is discovered later by a different agent than its writer, and turns the shared CI gate red for everyone until someone repairs shared memory by hand. |
| Empowered Engineers | [Operate a Predictable Agent Team](../../libraries/README.md#empowered-engineers-operate-a-predictable-agent-team) | `libwiki` is the stable-memory substrate that promise rests on. A library that audits invariants it does not help writers uphold delegates its own arithmetic to every consumer, and the gate noise it produces trains the team to treat a red signal as someone else's problem. |

## Problem

Wiki memory is governed by budgets (summary word/line caps, weekly-log
word/line caps, sealed-part line/word caps) and structure rules (the
dated entry-heading grammar, a leading `### Decision` block). The audit
checks these read-only in CI, after the write has landed. Spec 1450 made
rotation seal only budget-conforming parts — splitting at every dated
entry heading, including multiple entries sharing one date — and that
half holds. The remaining breaches all enter through writes the tooling
either cannot see or cannot finish:

- **Grammar-drifted headings defeat both the bisector and the audit.**
  Entry headings that do not match the dated grammar (observed:
  `## Run 220 — 2026-06-10 …` and `## Mon 2026-06-08 — …` in the
  product-manager W24 log, 6501/6400 words at discovery) are invisible
  to the rotation seam matcher — when every heading drifts, as in that
  file, the whole body degrades to one unsplittable prologue. The same
  drift is silent at audit time: the decision-block rule matches only
  dated headings and skips everything else, so no finding ever names
  the drift, and a drifted over-cap file must have its headings
  repaired before any rotation seam exists. Manual writes are the only
  source of these headings — the log commands emit conforming ones.
- **A lone over-cap entry has no seam the tooling will cut.** When a
  single dated entry exceeds a cap, rotation reports an irreducible
  residue and leaves a hand-split as the only exit — observed 2026-06-10
  when the auto-fixer refused the improvement-coach part file. The
  audit's sealed-part budget hints then direct that hand-split
  explicitly. Humans split below the entry heading, at the `###` block
  boundaries inside it, and chose correctly every time — the finer seam
  rule is mechanical.
- **Hand-splits carry no invariant.** The 2026-06-10 coach hand-split
  copied two tail sections into the new part without removing them from
  the old one (split-by-copy residue, the 4th sub-pattern on Obstacle
  #1427); later appends then breached the cap on content that had
  already "moved". This spec closes the shape by removing its occasion:
  sub-entry rotation takes over the case that forces hand-splits, and
  the protocol reserves direct edits for repair.
- **Writers cannot see headroom.** The boot digest reports claims,
  inbox, and summary content but not remaining budget, so agents compose
  entries blind against a ceiling they discover only when the gate turns
  red — usually for someone else.

### Evidence — the night of 2026-06-10

The audit's failure surface moved across three agents' files in under
one hour: a coach sealed part at 541/496 lines (split-by-copy residue),
the release-engineer summary at 2060/2048 then again 2063/2048 words
(the Obstacle #1480 shape — durable Carry obligations crowding the
summary's settled-state budget — twice in one night against a ~1/week
prior estimate), and a trim-recording entry that itself failed the
decision-block structure rule. Every breach was written in good faith,
every fix was correct, every breach was discovered by a non-writer, and
the shared gate was red for most of the window. Full chronology:
[Obstacle #1427, comment 4675522155](https://github.com/forwardimpact/monorepo/issues/1427#issuecomment-4675522155).

### Breach-shape coverage

Of the three breach shapes observed that night, this spec closes two and
explicitly leaves one to its existing owner:

| Breach shape | Owner |
|---|---|
| Weekly-log line/word budget via append or split | This spec |
| Entry structure (`### Decision`, heading grammar) | This spec |
| Summary word budget via manual prose edit | Spec 1610; this spec only adds headroom visibility |

Spec 1610 (inventory move off the summary surface) is at `spec draft` on
PR #1487; if it is reshaped, the summary-budget shape needs a new owner
rather than a wider 1730.

## What

Four capabilities, smallest first:

1. **Append-time budget feedback.** Every weekly-log append command
   reports the file's budget state (value, cap, remaining headroom) on
   completion, and an append that would land the file over either
   budget — words as well as lines, superseding spec 1450's append-path
   word-overflow exclusion — triggers rotation first so no append
   silently breaches. An entry whose own body exceeds a cap lands via
   capability 2's sub-entry rotation or surfaces as a declared residue;
   the append itself always lands.

2. **Sub-entry rotation for the irreducible case.** When a single dated
   entry alone exceeds a cap, rotation splits it at the block boundaries
   inside the entry instead of reporting an irreducible residue. The
   move-not-copy guarantee that already governs entry-level splits
   extends to this finer seam: outputs concatenate to content-equal with
   the input, and no produced part exceeds a cap except a declared
   residue — now only a single block that alone exceeds a cap, reported,
   never silently sealed.

3. **Heading-grammar drift becomes visible and steered.** The audit
   gains a finding for weekly-log entry headings that do not match the
   dated grammar, and structure findings (this one and the
   decision-block rule) name the log command that emits a conforming
   entry by construction. The sealed-part budget hints stop directing
   hand-splits once capability 2 makes them unnecessary. The memory
   protocol — which already names the log commands as the append path —
   additionally reserves direct weekly-log file edits for repair.
   (Obstacle #1427 also floated a write-time guard rejecting direct
   sealed-part writes; this spec routes that concern to protocol
   deliberately — the tooling cannot distinguish a repair edit from a
   drive-by one, and repair edits must stay possible.)

4. **Headroom in the boot digest.** The boot digest surfaces remaining
   budget (words and lines) for the agent's summary and active weekly
   log, turning the ceiling from a tripwire into a gauge writers see
   before composing.

Auto-rotation mints part files whose names are derived at runtime, so a
fifth, security-routed requirement rides with it (carried from the PR
#1571 security review,
[#1427 comment 4675559762](https://github.com/forwardimpact/monorepo/issues/1427#issuecomment-4675559762)):
**the commit layer's path boundary stays scope-safe** — a dynamically
derived filename handed to the wiki commit path can never widen the
commit beyond the named files, because the boundary rejects
pathspec-magic forms (git `:`-prefixed pathspecs survive the `--`
separator) before they reach git.

## Scope

- **In**: the weekly-log append commands' budget behaviour and
  reporting, rotation of a lone over-cap entry, the audit's weekly-log
  structure rules, the structure and sealed-part budget hint text, the
  boot digest payload, the memory-protocol clause reserving direct
  edits for repair, and the wiki commit layer's path-boundary guard.
- **Out**: the summary surface's content and inventory (spec 1610); the
  `fit-wiki sync` whole-tree commit semantics (whole-tree by design) and
  the already-landed claim/release pathspec fix (Issue #1568) — what
  this spec adds is keeping that fix closed when rotation-minted
  filenames reach the commit layer; wiki filename-grammar auditing
  (Issue #1574); the storyboard surface; enforcement against
  cross-agent manual edits (a protocol concern, not a tooling one).

## Success Criteria

| # | Claim | Verify |
|---|---|---|
| 1 | An append against a weekly log near either cap lands the entry and leaves the active file under both budgets, rotating first when needed — the word-cap trigger being the delta over spec 1450. | `libwiki` test: append fixtures at line-cap and word-cap boundaries; assert the entry is present and `fit-wiki audit` passes on the result. |
| 2 | A weekly log whose excess sits in one over-cap dated entry containing multiple blocks is split below the entry heading into budget-conforming parts. | `libwiki` test: single over-cap dated entry with multiple `###` blocks, through the append-path rotation, the auto-fixer, and the force-rotate path. |
| 3 | A single block that alone exceeds a cap is sealed as a declared residue and reported — never silently shipped over budget. | `libwiki` test: fixture whose one `###` block exceeds the cap; assert the residue signal names file, budget, and overage. |
| 4 | Sub-entry splits lose and duplicate no content: outputs concatenate to content-equal with the input. | `libwiki` test asserting the move-not-copy invariant on the new sub-entry seam (entry-level splits already carry this assertion). |
| 5 | Every append reports value, cap, and remaining headroom for both budgets of the file it wrote. | `libwiki` test asserting the append commands' reported output. |
| 6 | The boot digest includes remaining words and lines for the agent's summary and active weekly log. | `libwiki` test asserting digest fields against fixtures. |
| 7 | The audit flags weekly-log entry headings that do not match the dated grammar; that finding and the decision-block finding name the log command, and the sealed-part budget hints no longer direct a hand-split. | `fit-wiki audit` against a grammar-drifted fixture; hint-text assertions for the three rules. |
| 8 | The memory protocol reserves direct weekly-log file edits for repair, stated alongside the append-path instruction. | `rg -C3 "fit-wiki log" .claude/agents/references/memory-protocol.md \| rg -i "repair"` |
| 9 | The wiki commit path rejects `:`-prefixed pathspec entries, so a rotation-minted filename can never widen a commit beyond the named files. | `libwiki`/`libutil` test: a `:/`-prefixed path handed to the commit boundary is rejected, not passed to git. |

## Why Now

Spec 1450 made rotation seal only budget-conforming parts and was the
right first half; the 2026-06-10 churn shows the remaining breaches
enter through the seams above — grammar drift, the irreducible entry,
the unguarded hand-split, and the invisible ceiling. Obstacle #1427 has
been open since 2026-06-04 with its structural section unaddressed, its
recurrence estimate just revised an order of magnitude upward, and the
staff-engineer design offer for exactly this scope is on record on the
issue.

Addresses #1427.

— Product Manager 🌱
