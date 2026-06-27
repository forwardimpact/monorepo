# Plan 1860-a — split the inbox region out of the summary budget

Executes [design 1860-a](design-a.md) for [spec 1860](spec.md).

## Approach

A1: partition each summary into a body span and a `## Message Inbox` span in
`audit/scopes.js`, point the summary budgets at the body counts, and add an
`inbox` scope with two fail-severity budgets reading the inbox counts. The inbox
limits sit one maximum delivery below their ceilings on both dimensions so one
conforming delivery never trips them. `fit-wiki memo`/`inbox` are untouched.
Documentation of the split lands in `memory-protocol.md` under the
`.claude/` self-edit path.

Libraries used: libwiki (audit scopes, rules, constants, budget), libutil
(runRules — read only, not modified).

## Step 1 — Inbox budget constants

Intent: name the inbox ceilings and the maximum-delivery reserve in one home.

Files: modify `libraries/libwiki/src/constants.js`.

- Add `INBOX_WORD_BUDGET = 2048` and `INBOX_LINE_BUDGET = 496` as the inbox
  region's own hard ceilings (a separate per-region envelope, not the file
  total). The budgets breach at these ceilings.
- Add `MAX_MEMO_WORDS = 256` and `MAX_MEMO_LINES = 64` as the maximum single
  delivery the no-recursion reserve must absorb. 256 words covers the largest
  observed delivery (174 words) with margin; 64 lines is a generous ceiling for
  a memo body (a 256-word memo formatted at a few words per line stays well
  under it). These two values define the reserve: an inbox is "conforming" when
  it sits at or below `INBOX_WORD_BUDGET − MAX_MEMO_WORDS` (1792 words) and
  `INBOX_LINE_BUDGET − MAX_MEMO_LINES` (432 lines), so one delivery to a
  conforming inbox lands at most at the ceiling and never breaches.
- Comment the reserve relation (ceiling, max delivery, conforming band), not the
  originating artifact.

Verification: imported by Steps 2–4; covered by their tests.

## Step 2 — Partition each summary into body and inbox spans

Intent: compute body and inbox word/line counts without double-counting.

Files: modify `libraries/libwiki/src/audit/scopes.js`.

- Add a helper `partitionInbox(fileLines)` returning `{ inboxText, bodyText }`.
  Scan `fileLines` by index (not the `h2s` array, which carries no line
  numbers) for the first line equal to `INBOX_HEADING` (the existing
  `## Message Inbox` constant from `constants.js` — reuse it, do not hardcode
  the literal). The inbox span runs from that line through the line before the
  next line matching `/^## /`, or end of file when none follows. Every line
  outside the span is body. When no `INBOX_HEADING` line exists — heading-less,
  renamed, or not-first-H2 with no exact match — `inboxText` is empty and
  `bodyText` is the whole file, so that content is fully measured by the summary
  budgets. The two spans reproduce the original `fileLines` exactly when
  concatenated in original order, so the partition covers the file once with no
  gap or overlap.
- In `loadFile`, call `partitionInbox` only for summary-shaped files; carry
  `bodyWords`/`bodyLines` and `inboxWords`/`inboxLines` (via the shared
  `countWords`/`countLines`) on the summary subject. Weekly-log and storyboard
  subjects are not partitioned and keep their existing `words`/`lines`. Because
  `loadFile` is shared, scope the new fields and the partition to the summary
  branch so the other kinds are unchanged.
- After Step 3, grep every `scope: "summary"` rule for `s.words`/`s.lines`; if
  none remain, drop those two fields from the summary subject to avoid dead
  state. If any non-budget summary rule still reads them, keep them.

Verification: `bun test libraries/libwiki/test/audit-engine.test.js` with new
partition cases — a summary with `## Message Inbox` followed by another `##`
splits at the boundary; an inbox-to-EOF summary puts the tail in the inbox; a
heading-less summary puts everything in the body; a summary whose inbox heading
is not the first H2 still splits at the heading. Each case asserts both that
body words plus inbox words equal the whole-file word count and that body lines
plus inbox lines equal the whole-file line count, so neither dimension
double-counts or drops.

## Step 3 — Point summary budgets at the body, add the inbox scope and budgets

Intent: exempt the inbox from the summary budgets and bound it on its own.

Files: modify `libraries/libwiki/src/audit/scopes.js` (scope resolver),
`libraries/libwiki/src/audit/rules.js` (rules).

- In `rules.js`, change `summary.word-budget` and `summary.line-budget` `check`
  functions to read `s.bodyWords`/`s.bodyLines` (add `bodyWordBudget(limit)` /
  `bodyLineBudget(limit)` helpers, or pass an accessor to the existing
  `wordBudget`/`lineBudget`). Messages and hints unchanged.
- Add an `inbox` resolver to `SCOPE_RESOLVERS` in `scopes.js` returning every
  summary subject (`ctx.subjects.summary`). Returning all summaries, not only
  those with an inbox region, keeps a summary from escaping the inbox bound by
  dropping the heading: a missing region reads as zero inbox words/lines, which
  never breaches.
- Add `inbox.word-budget` and `inbox.line-budget` rules in `rules.js` with
  `scope: "inbox"`, `severity: "fail"`, checks reading `s.inboxWords`/
  `s.inboxLines` against `INBOX_WORD_BUDGET`/`INBOX_LINE_BUDGET`, messages
  `"${value} inbox words (limit ${INBOX_WORD_BUDGET})"` and the line analogue,
  and a hint directing the recipient to triage via `fit-wiki inbox`.

Verification: `bun test libraries/libwiki/test/audit-rules.test.js`. The
roster test asserts an ordered `deepEqual` of rule ids, so insert
`inbox.word-budget` and `inbox.line-budget` into that snapshot at the position
matching their definition order in `rules.js` (place the two inbox rules
directly after the summary budgets so the snapshot order is contiguous and
predictable). Also run `audit-engine.test.js`.

## Step 4 — Tests proving the spec criteria

Intent: lock the behavior the spec verifies.

Files: modify `libraries/libwiki/test/audit-rules.test.js`,
`libraries/libwiki/test/audit-engine.test.js`.

- **SC1 (delivery does not move the summary budget):** an engine fixture whose
  summary body sits just under `SUMMARY_WORD_BUDGET` and whose inbox holds a
  fresh memo produces no `summary.word-budget`/`summary.line-budget` finding,
  where the same total words measured whole-file would have breached.
- **SC2 (no-recursion, both dimensions):** a fixture whose inbox is at the
  conforming band edge (`INBOX_WORD_BUDGET − MAX_MEMO_WORDS` words and
  `INBOX_LINE_BUDGET − MAX_MEMO_LINES` lines) then receives one maximum delivery
  (`MAX_MEMO_WORDS` words, `MAX_MEMO_LINES` lines), landing the inbox at exactly
  the ceiling, produces no inbox finding on either dimension (the check is
  `> ceiling`, and ceiling is not greater than ceiling). A second fixture whose
  inbox already exceeds the conforming band before the delivery, so the same
  delivery pushes it past the ceiling, produces both inbox findings.
- **SC3 (one command, one surface):** assert `fit-wiki memo` appends under the
  `<!-- memo:inbox -->` marker and `fit-wiki inbox list` reads the delivered
  memo, with the recipient summary in each of the under-budget and over-budget
  states, so the command and surface do not fork on budget state. Add these
  assertions to the memo/inbox tests; do not leave them conditional.
- **SC5 (no unmeasured class, negative fixture):** non-memo text planted in the
  inbox region as the only over-bound content produces a fail-severity
  `inbox.word-budget` finding; the same fixture without the planted text is
  clean. A second fixture plants over-bound text under a renamed inbox heading
  and asserts it falls in the body and trips `summary.word-budget`, proving no
  region escapes.

Verification: `bun test libraries/libwiki`.

## Step 5 — Document the interaction in memory-protocol

Intent: SC4 — the reference documents the split and states the enforced limits.

Files: modify `.claude/agents/references/memory-protocol.md` via the
`.claude/` self-edit path (`echo … | bunx fit-selfedit <path>` on a non-`main`
branch, per CONTRIBUTING.md).

- Add a short subsection explaining that the summary budgets measure the
  summary body and a separate inbox bound measures the `## Message Inbox`
  region, and stating the four limits so they match the `constants.js` values.
  State the figures as the enforced limits, with no reference to the originating
  spec.

Verification: read `memory-protocol.md`; the four figures equal the constants.

## Risks

- **Other readers of whole-file summary counts.** Before removing `words`/
  `lines` from the summary subject (Step 2), grep all rules with
  `scope: "summary"`; any that still read `s.words`/`s.lines` must move to the
  body counts or the removal breaks them. The roster test catches a missed rule.
- **Counter consistency.** Body and inbox counts must use the same `budget.js`
  counters the rotation seal uses, or a part the seal calls conforming could be
  flagged. Step 2 reuses `countWords`/`countLines`; do not introduce a second
  counter.

## Execution

Single engineering agent (`staff-engineer`), steps in order — Step 5's doc edit
may run last and independently. Steps 1–4 are one cohesive libwiki change.
