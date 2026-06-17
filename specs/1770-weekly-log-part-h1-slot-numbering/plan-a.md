# Plan 1770 — Sealed weekly-log part H1 numbers the filename slot

Executes [design-a.md](design-a.md) for [spec 1770](spec.md).

## Approach

Move the sealed-part H1 render from `bisectWeeklyLog` (which does not know the
slot) to the two seal functions (which do). The bisector returns part bodies and
a `renderH1(n)` shaped `(part N)`; `atomicSeal` and `atomicResealPart` parse N
off each `…-partN.md` slot path (via an extended `WEEKLY_LOG_PART_NAME_RE`) and
render the final header there. Drop `of M` and the stale-prone total. Widen the
audit H1 regex to also accept `(part N)` while keeping legacy `(part N of M)` and
bare headings valid. Declare the grammar once in `memory-protocol.md`.

Libraries used: none (libwiki internal).

## Step 1 — Capture the slot number in the part-name regex

Intent: a slot path resolves to its N with no second pattern.

Files: modify `libraries/libwiki/src/constants.js`,
`libraries/libwiki/src/weekly-log.js`.

- `WEEKLY_LOG_PART_NAME_RE`: add a trailing capture —
  `^([a-z][a-z-]*)-(\d{4})-W(\d{2})-part(\d+)\.md$`.
- `parsePartPath` (`weekly-log.js`): extend the destructure to
  `[, agent, year, week, part]` and return `partNumber: Number(part)` alongside
  the existing fields. (Audit `scopes.js` uses this regex only for `.test()`
  classification — adding a group does not change a boolean test, so no audit
  call site changes here.)

Verification: a unit test parses a `…-part7.md` path and asserts `partNumber === 7`.

## Step 2 — Render the H1 at seal time, shaped `(part N)`

Intent: one header render site, owned by the seal, fed the real slot.

Files: modify `libraries/libwiki/src/weekly-log.js`.

- In `bisectWeeklyLog`: delete `partH1(n, m)` and the `{h1}` field from
  `finish`. Parts become `{body}`. Add a returned
  `renderH1 = (n) => `# ${title} — ${isoWeekStr} (part ${n})``. The return shape
  becomes `{ parts: [{body}], residue, renderH1 }`.
- Change the measurement template (line ~142) to
  `const h1Template = `# ${title} — ${isoWeekStr} (part 1)`;` so measured ==
  rendered under the shorter suffix.
- `atomicSeal(filePath, parts, renderH1, agent, isoWeekStr, fs)`: after
  `nextFreeSlots` yields `slots`, build each leading write as
  `content: `${renderH1(slotN)}\n${parts[i].body}`` where `slotN` is the N parsed
  from the slot path (Step 1). The `agent`/`isoWeekStr` args stay only for the
  `anchor` `defaultH1`. `rotateIfOverBudget` passes the bisect result's
  `renderH1` through.
- `atomicResealPart(partPath, mainLogPath, parts, renderH1, fs)`: the source
  slot's N comes from `parsePartPath(partPath).partNumber`; each fresh sibling's
  N from `parsePartPath(newSlots[i]).partNumber`. Render with `renderH1(n)` for
  every part. `rebisectOverBudgetPart` passes the bisect result's `renderH1`.
- Update the stale `(part N of M)`-justifying comment at `weekly-log.js:139-141`
  to describe the `(part 1)` template.

Verification: `bisectWeeklyLog` no longer emits `.h1`, so the existing bisect
test `weekly-log.test.js:145-158` ("H1s number (part 1 of M)…") and the
`.h1`-reading `partConforms` helper (`weekly-log.test.js:72-78`, used at lines
73/180/232) are **structurally rewritten** to read the seal output / `renderH1`,
not merely re-string-matched. New assertions per Step 5.

## Step 3 — Widen the audit H1 shape; update the hint

Intent: accept the new shape, flag nothing legacy, keep broken headings failing.

Files: modify `libraries/libwiki/src/audit/scopes.js`,
`libraries/libwiki/src/audit/rules.js`.

- `WEEKLY_LOG_H1_RE`: change the optional suffix to
  `/^# (.*) — \d{4}-W\d{2}(?: \(part \d+(?: of \d+)?\))?$/` — accepts bare,
  `(part N)`, and `(part N of M)`. The non-optional `# (.*) — \d{4}-W\d{2}`
  anchor is unchanged, so a bad week token / missing separator still fails.
- `weekly-log-part.h1-shape` hint: `"set the H1 to '# <agent> — YYYY-Www
  (part N)' where N is the filename slot; legacy '(part N of M)' and bare
  headings remain valid on historical parts."`
- `weeklyAgentMismatch` is unchanged — it slug-matches group 1, which the widened
  regex still captures for all accepted shapes.

Verification: audit fixtures per Step 5.

## Step 4 — One contract home in memory-protocol.md

Intent: declare the heading grammar once, next to the filename convention.

Files: modify `.claude/agents/references/memory-protocol.md` (via
`bunx fit-selfedit` if a direct write is blocked).

- In the shared grammar section spec 1760 § Decision 2 adds
  (`## Wiki Filename Grammar`): add the sealed-part heading grammar —
  `# <agent> — YYYY-Www (part N)`, N is the filename slot; legacy `(part N of M)`
  and bare headings grandfathered. If that section is not yet on `main` (1760
  pending), create the `## Wiki Filename Grammar` header and place the heading
  grammar in it; 1760's merge reconciles into the same section.
- In `## Weekly Log Contract`: reconcile the absolute "no part is ever rewritten"
  sentence with sanctioned in-place re-bisection of an over-budget part, and
  point it at the grammar section rather than restating it. Remove the
  re-bisection path's "local to this split" caveat — the H1 number is the slot.

Verification: `bunx fit-wiki audit` over the repo wiki yields no new findings;
manual read confirms one declaration, referenced not duplicated.

## Step 5 — Tests for every success criterion

Intent: pin each spec criterion.

Files: modify `libraries/libwiki/test/weekly-log.test.js`,
`libraries/libwiki/test/weekly-log-part.integration.test.js`,
`libraries/libwiki/test/cli-fix-rotation.integration.test.js`; extend the
audit heading-shape fixtures in `libraries/libwiki/test/audit-rules.test.js`
(the existing home of the `weekly-log-part.h1-shape` rule assertions).

- Rotation with no existing parts → every `…-partN.md` opens `(part N)`.
- Rotation beside occupied slots 1–4 → seals land on 5,6 with `(part 5)`/`(part 6)`.
- Force-rotate single chunk onto slot 5 → `(part 5)`, never `(part 1 of 1)`.
- Re-bisect over-budget part on slot 2 beside parts 1–3 → slot-2 file `(part 2)`,
  each fresh sibling H1 equals its new slot.
- Repeated within-week rotation → no produced H1 contains `of`, all agree with
  filename.
- Budget exactness: seal a residue-free source landing on two-digit slots →
  each part at-or-under both budgets; unit-assert `measure` of the bisect
  template equals the seal's rendered header+body for a two-digit slot N (the
  assertion targets the seal/`renderH1` output, since bisect no longer renders
  the H1).
- Audit fixture mirroring the live tree (legacy `(part N of M)`, bare
  title-cased, bare slug-cased on a `staff-engineer-…` file) → zero
  heading-shape and zero agent-prefix findings.
- Audit fixture: legacy-suffixed + bare + new-shaped + a bad-week-token part →
  only the last yields the heading-shape finding.
- Main-log of each accepted shape (bare, part-suffixed) + one rejected →
  identical findings before/after.
- Agent-prefix: a part of each accepted shape whose title mismatches the prefix →
  each flagged; a slug-equal casing/separator difference → neither flagged.
- Within-budget legacy-headed parts byte-identical after rotation + `fit-wiki
  fix` (over-budget parts exempt).

Verification: `bun test libraries/libwiki/test` green; `bunx fit-wiki audit`
on the repo wiki clean.

## Risks

- **1760 ordering.** The contract section is 1760's; if 1770 implements before
  1760 lands on `main`, Step 4 creates the section header and 1760's merge must
  fold into the same `## Wiki Filename Grammar` section rather than adding a
  second. Implementer: check `origin/main` for the section before writing.
- **`.claude/` write gate.** Step 4 edits `memory-protocol.md` under `.claude/`;
  use `bunx fit-selfedit` per CLAUDE.md if a direct Edit is blocked.

## Execution

Single engineering agent, steps in order (Step 1 → 2 are coupled; 3 independent;
4 doc; 5 throughout). No parallelism warranted.

— Staff Engineer 🛠️
