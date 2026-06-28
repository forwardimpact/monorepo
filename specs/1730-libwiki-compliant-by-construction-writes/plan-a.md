# Plan 1730 — Compliant-by-construction wiki writes

Executes [design-a.md](design-a.md) for [spec 1730](spec.md).

## Approach

Land the five capabilities bottom-up so each step verifies before the next
depends on it: seam-regex home → sub-entry rotation → word-cap trigger (with the
caller signature change) → append-time feedback → boot headroom → audit drift
rule + hint steering → pathspec guard → memory protocol. Each step is one
logical commit with its tests. The trigger signature change (step 3) touches all
three `rotateIfOverBudget` callers in one commit so the tree never holds a
half-migrated signature.

Libraries used: libwiki (weekly-log, commands/log, commands/rotate,
commands/fix, boot, audit/rules, constants), libutil (git-client). The new drift
rule reuses the existing `weekly-log-main`/`-part` scopes, so `audit/scopes.js`
is not modified.

## Step 1 — Home the day-section seam regex in constants

Move the `## YYYY-MM-DD` seam matcher to one constant so the seam-finder and the
new drift rule cannot disagree (design D5).

- Modified: `libraries/libwiki/src/constants.js`,
  `libraries/libwiki/src/weekly-log.js`,
  `libraries/libwiki/src/commands/log.js`

Add to `constants.js`:

```js
// Day-section seam: `## YYYY-MM-DD` at line start, optional suffix tolerated
// (e.g. `## 2026-05-19 (third activation)`). One home so the rotation
// seam-finder and the audit's drift rule cannot disagree on what a conforming
// entry heading is.
export const WEEKLY_LOG_SEAM_RE = /^## (\d{4}-\d{2}-\d{2})/;
```

Replace the inline `/^## (\d{4}-\d{2}-\d{2})/` literals in `weekly-log.js`
(`bisectWeeklyLog` seam scan and `rebisectOverBudgetPart` fallback) and
`commands/log.js` (`lastDateHeading`) with a
`new RegExp(WEEKLY_LOG_SEAM_RE, "gm")` where the `g` flag is needed. The audit's
`decisionWithin5` `entryRe` keeps its own stricter anchored variant (design
note).

Verify:
`bunx vitest run libraries/libwiki/test/weekly-log.test.js libraries/libwiki/test/cli-log.test.js`
— existing rotation/append tests pass unchanged.

## Step 2 — Sub-entry rotation for the irreducible day-section

Re-bisect a lone over-cap day-section at its `###` block seams inside
`bisectWeeklyLog` (design D1/D2). Generalise the seam-finder to take a matcher.

- Modified: `libraries/libwiki/src/weekly-log.js`
- Created: fixtures inline in the test

Mechanism:

- Extract the seam-find + `packSections` body of `bisectWeeklyLog` into an inner
  `splitAt(body, seamRe, measure, overBudget)` that returns
  `{partBodies, residue}`.
- When `packSections` flags a lone day-section as the residue, re-run `splitAt`
  on that section's text with a `###` block-seam matcher; the block sections
  pack under the same budgets. Splice the resulting block-bodies into
  `partBodies` in place of the single over-cap day-section.
- Terminal residue is now a single `###` block that alone exceeds a cap
  (criterion 3); never recurse below `###`. The packer's existing "chunk alone
  over budget → seal as own part + record residue" branch is the base case.
- **Residue naming:** the inner `splitAt` on the day-section returns its own
  `residue` naming the over-cap `###` block (heading text, lines, words). When
  the outer pass splices block-bodies in for a day-section, it replaces the
  outer day-section residue with this inner block residue, so the surfaced
  residue's `section` names the `###` block (not the date) and carries the
  block's `lines`/`words` — what criterion 3 requires reported. Generalise
  `residueOf`/`prologueResidue` to take a heading string rather than `sec.date`.
- **`rebisectOverBudgetPart` narrowing (the one caller whose result changes).**
  It already calls `bisectWeeklyLog` then short-circuits on
  `parts.length === 1`. Once sub-entry splitting lands, a formerly-irreducible
  part yields multiple block-parts, so that branch is reached only for a true
  single over-cap `###` block — the narrowing happens structurally with no edit
  to the branch logic. Step 1 already replaced its inline date-seam literal with
  the constant. No further change here; the part-level fixture below pins the
  new behaviour.
- The move-not-copy invariant holds: block bodies are byte-slices of the
  day-section text, which is a byte-slice of the body.

Verify: `libwiki` tests covering all three paths spec criterion 2 enumerates —
(a) bisector unit test in `weekly-log.test.js`: a single over-cap dated entry
with multiple `###` blocks splits into budget-conforming parts; assert outputs
concatenate content-equal with the input (criterion 4) and no part exceeds a cap
except a single over-cap `###` block whose residue names the block, lines, and
words (criteria 2, 3); (b) the auto-fixer / part path in
`weekly-log-part.integration.test.js` via `rebisectOverBudgetPart`; (c) the
force-rotate path in `cli-rotate.integration.test.js` via `fit-wiki rotate`.

## Step 3 — Word-cap trigger and caller signature change

Widen `rotateIfOverBudget`'s `appendLines` number to a `{lines, words}` delta
and trigger on either projected cap (design D3). Clean break — change all
callers.

- Modified: `libraries/libwiki/src/weekly-log.js`,
  `libraries/libwiki/src/commands/log.js`,
  `libraries/libwiki/src/commands/rotate.js`,
  `libraries/libwiki/src/commands/fix.js`

Change:

- `rotateIfOverBudget(wikiRoot, agent, today, delta = {lines: 0, words: 0}, options, fs)`.
  Replace the line-only guard with: read `current` lines and words; if
  `!force && current.lines + delta.lines <= LINE_BUDGET && current.words + delta.words <= WORD_BUDGET`
  return noop.
- `commands/log.js`
  `rotateBeforeAppend(wikiRoot, agent, today, delta, runtime)`; each sub-handler
  computes `delta = { lines: countLines(body), words: countWords(body) }` for
  the body it is about to append (`note` uses the conservative `withHeading`
  body, the same string its line-count path uses today, so the word projection
  does not under-count). `commands/log.js` adds `countLines`/`countWords`
  imports from `budget.js` (not imported today).
- `commands/rotate.js` (line 30) and `commands/fix.js` (line 108) currently pass
  the 4th positional as the bare number `0`; both change to
  `{ lines: 0, words: 0 }` (both force-rotate; the delta is moot but the
  signature is uniform).

Verify: `libwiki` test — append fixtures at the line-cap and at the word-cap
boundary (line count under cap, word count over — the `6501/6400` shape); assert
the entry lands and `fit-wiki audit` passes on the result (criterion 1, the
audit, not a budget recount). Add `cli-rotate`/`cli-fix` assertions that the
force-rotate and fix paths still seal under the new delta-object signature.

## Step 4 — Append-time budget feedback

Report value/cap/headroom for both budgets after every successful append
(design D4, criterion 5).

- Modified: `libraries/libwiki/src/commands/log.js`

Add a `reportBudget(target, runtime)` helper that reads the just-written file,
computes lines/words via `budget.js`, and writes one line per budget to stdout:
`weekly log: 412/496 lines (84 remaining), 5980/6400 words (420 remaining)`.
Call it at the end of all three sub-handlers, after `appendEntry`, so it runs on
both the rotated and non-rotated path.

Verify: `libwiki` test asserting `runDecision`/`runNote`/`runDone` stdout
contains value, cap, and remaining for both budgets (criterion 5).

## Step 5 — Boot digest headroom

Add `summary_headroom` and `weekly_log_headroom` to the digest (design,
criterion 6).

- Modified: `libraries/libwiki/src/boot.js`

Add a helper `headroom(text, lineCap, wordCap)` returning the design's field
shape exactly:
`{ words, lines, word_cap, line_cap, words_remaining, lines_remaining }` (reuse
`countLines`/`countWords`). `summary_headroom` from the already-read
`summaryText` against `SUMMARY_*` caps. `weekly_log_headroom` is a new read of
`weeklyLogPath(wikiRoot, agent, today)` against `WEEKLY_LOG_*` caps; absent file
→ zero counts, full headroom. boot.js gains imports for
`countLines`/`countWords` (`budget.js`), `weeklyLogPath` (`weekly-log.js`), and
the four cap constants (`constants.js`), none imported today. Both fields
additive.

Verify: `libwiki` test asserting both digest fields against fixtures
(`boot.test.js`).

## Step 6 — Audit drift rule and hint steering

Add the heading-grammar-drift finding; steer structure findings to `fit-wiki
log`; drop the hand-split hints (design D5, criterion 7).

- Modified: `libraries/libwiki/src/audit/rules.js`

Changes:

- New rule `weekly-log.heading-grammar` on `weekly-log-main` and a twin on
  `weekly-log-part`: a `check` flagging each `^##` line whose remainder does
  not match `WEEKLY_LOG_SEAM_RE` (i.e. an entry-shaped heading the seam-finder
  would skip). Message names the offending line; hint names `fit-wiki log`.
- `decision-block.heading-within-5` hint: append "open entries with `fit-wiki
  log decision`, which emits a conforming heading and block."
- `weekly-log-part.line-budget`/`word-budget` hints: drop the "split at a finer
  seam by hand" clause — `fit-wiki fix` now sub-splits automatically.

Verify: `fit-wiki audit` against a grammar-drifted fixture flags the heading;
hint-text assertions for the three rules (`audit-rules.test.js`, criterion 7).

## Step 7 — Pathspec guard at the commit boundary

Reject `:`-prefixed `paths` entries in `git-client.js` before any spawn (design
D6, criterion 9).

- Modified: `libraries/libutil/src/git-client.js`

Add a module-private `assertSafePaths(paths)` that throws
`Error("unsafe pathspec: ':'-prefixed entries are rejected (...)")` when any
entry's first char is `:`. Call it at the top of `commitPaths` (covering both
its `add --` and `commit --` spawns at one site) and `status` (before the
spawn). `commitAll` takes no `paths` and is untouched. Neither method documents
its `paths` parameter with a `@param` tag today, so the step **adds** a
`@param {string[]} [paths]` JSDoc line to each warning that `:`-prefixed entries
are rejected.

Verify: `libutil` test — a `:/`-prefixed path handed to `commitPaths` and to
`status` throws and never reaches the git spy; JSDoc-presence not asserted in
test but verified by review (criterion 9).

## Step 8 — Memory protocol repair clause

Reserve direct weekly-log edits for repair (criterion 8).

- Modified: `.claude/agents/references/memory-protocol.md`

Alongside the existing `fit-wiki log` append instruction (§ During Each Run /
Weekly Log Contract), add one sentence: direct edits of a weekly-log file are
reserved for repair of an existing entry; new entries always go through
`fit-wiki log`. Follow
[self-improvement.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/self-improvement.md)
for the `.claude/**` write.

Verify:
`rg -C3 "fit-wiki log" .claude/agents/references/memory-protocol.md | rg -i "repair"`
(criterion 8).

## Risks

- **`rebisectOverBudgetPart`'s `parts.length === 1` short-circuit.** Once step 2
  lands, a part that used to be irreducible may now split; the short-circuit
  must narrow to the true base case (a single over-cap `###` block). Step 2's
  test must include a part-level fixture (`weekly-log-part.integration.test.js`)
  so the `fix` path inherits sub-entry rotation, not just the append path.
- **Word-count of the `note` conservative heading.** `runNote` may or may not
  prepend a date heading; the delta must use the same `withHeading` body the
  line-count path already uses, or the word projection under-counts.

## Execution

Single engineering agent, sequential — each step depends on the prior
(step 2 needs step 1's constant; step 4 adds `reportBudget` to the same
`commands/log.js` step 3 touches, so 4 follows 3 to avoid a merge within one
file; step 6 needs step 1's constant). Steps 7 and 8 are independent of
1–6 and of each other but are small; keep them in sequence for one clean diff.

— Staff Engineer 🛠️
