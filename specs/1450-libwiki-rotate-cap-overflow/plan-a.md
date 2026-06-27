# Plan 1450 — Bisecting seal for the libwiki rotation primitive

Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md).

## Approach

Build the pure split first (`bisectWeeklyLog` + shared counters), then the
atomic writer, then re-shape `rotateIfOverBudget` to return the tagged union,
and finally migrate the three callers (`rotate`, `fix`, `log`) and the audit
hint text onto the new result. Each step is independently testable: the pure
split and counters carry unit tests; the writer, primitive, and every CLI path
that can now trigger a seal carry **real-fs** integration tests (libmock ships
async `rename` only — no `renameSync` — so a seal cannot run against
`createMockFs`). Clean break — `{ rotated, fromPath, toPath }` is replaced
everywhere, not wrapped.

Libraries used: libutil (isoWeekString).

## Step 1 — Shared budget counters

Extract the canonical line/word counters into a new module so the seal and the
audit cannot drift.

- **Created:** `libraries/libwiki/src/budget.js`
- **Modified:** `libraries/libwiki/src/audit/scopes.js`,
  `libraries/libwiki/src/index.js`

Move `countLines` and `countWords` verbatim out of `scopes.js` into
`budget.js` and `export` both. `scopes.js` imports them
(`import { countLines, countWords } from "../budget.js";`) and drops its local
copies — `loadFile`/`loadStoryboard` call sites are unchanged. `weekly-log.js`
(Step 3) imports the same pair. Add
`export { countLines, countWords } from "./budget.js";` to `index.js`. The
audit's split-based `countLines` is the canonical version; the char-scanning
copy in `weekly-log.js` (lines 14–20) — which is deleted in Step 3 — agrees with
it for every non-empty text and differs only on the empty string (split-based
`1` vs char-scan `0`), which is immaterial to the short-circuit against the 496
line budget.

Verification:
`bun test libraries/libwiki/test/audit-rules.test.js libraries/libwiki/test/audit-engine.test.js`
stays green (counts unchanged).

## Step 2 — Pure bisect

Add the content-preserving split that turns an over-budget source into an
ordered list of conforming parts plus an optional irreducible-residue
descriptor. No I/O.

- **Modified:** `libraries/libwiki/src/weekly-log.js`

Import `countLines`/`countWords` from `./budget.js` and `WEEKLY_LOG_WORD_BUDGET`
from `./constants.js` (alongside the already-imported `WEEKLY_LOG_LINE_BUDGET`).
Add `export function bisectWeeklyLog(text, agent, isoWeekStr)` returning
`{ parts: [{ h1, body }], residue: null | { section, lines, words, partIndex } }`:

- Treat the first line of `text` as the original H1; the **body** is everything
  after that first line's trailing newline. The original H1 is consumed here —
  it is replaced by the per-part H1s and never appears in any part body.
- Find the day-section seams in the body with `/^## (\d{4}-\d{2}-\d{2})/gm` (the
  regex `log.js` already uses — date at line-start, trailing suffix tolerated)
  and **slice the body at the seams' byte offsets** rather than `split`/`join`,
  so chunk concatenation reproduces the original body byte-for-byte (no newline
  added or dropped at a seam). The chunk above the first seam is the prologue,
  then one chunk per `## YYYY-MM-DD` section (each chunk keeps its own trailing
  newline).
- Render each part as `partH1 + "\n" + bodyChunk` where the part H1 is
  `# ${agentTitle(agent)} — ${isoWeekStr} (part ${i} of ${M})`. Measure a
  candidate part with the shared `countLines`/`countWords` on the **rendered
  part text** (H1 included) so the H1's own line/word cost is charged against
  both budgets. The prologue rides with part 1 and is included in part 1's
  measurement.
- Greedy left-to-right pack: append day-sections to the current part until
  adding the next would exceed **either** budget, then open a new part.
- Irreducible case: when a single chunk (a lone day-section, or the prologue
  when the source has zero day-sections) alone exceeds a budget, seal it as its
  own part, record `residue = { section, lines, words, partIndex }` — `section`
  is the `YYYY-MM-DD` date, or the sentinel `"prologue"` for a preamble/
  zero-section overflow; `partIndex` is that part's 0-based index in `parts`.
  The remaining chunks still pack normally. `residue` names the first such
  chunk.
- `M` is the count of parts this seal produces; H1s number `1..M` even though
  the file slots (Step 3) continue from the next free global index (design Key
  Decision: local `N of M`, existing slots kept).

Verification: new `bun test libraries/libwiki/test/weekly-log.test.js` cases
assert concatenated part bodies equal the original body below its H1, every part
is at-or-under both budgets, rendered H1s number
`(part 1 of M) … (part M of M)`, and no day-section spans two parts. Two
irreducible cases: a lone over-cap `## YYYY-MM-DD` section yields a `residue`
named with that date and its `partIndex`; a **zero-day-section** over-cap source
(all prologue) yields `residue.section === "prologue"` as its own part.

## Step 3 — Atomic writer, `nextPartIndex`, and the tagged primitive

Replace the plain-rename seal with a staged-then-commit writer and re-shape
`rotateIfOverBudget`. `defaultH1` and `agentTitle` are retained; only
`nextPartPath` and the local `countLines` are removed.

- **Modified:** `libraries/libwiki/src/weekly-log.js`,
  `libraries/libwiki/src/index.js`

Replace `nextPartPath` with `nextPartIndex(filePath, fs)` returning the first
free integer `n` such that `<base>-part${n}.md` does not exist (fixes the
same-slot bug: the writer assigns `start, start+1, …` for the M parts in one
seal rather than re-resolving slot 1 each time). Because every slot
`start … start+M-1` is verified free, rollback may unlink them without
destroying a pre-existing file.

Add an internal `atomicSeal(filePath, parts, agent, isoWeekStr, fs)` returning
the produced slot paths (`slots`) **in part order**:

1. From `start = nextPartIndex(filePath, fs)`, reconstruct the M slot paths
   `<base>-part${start}.md … <base>-part${start+M-1}.md` (same `<base>`
   derivation the deleted `nextPartPath` used); build the fresh-main body via
   `defaultH1(agent, isoWeekStr)`.
2. Write each part's rendered text and the fresh-main body to temp files
   (`${slotPath}.tmp` / `${filePath}.tmp`), recording each temp path created so
   rollback only ever unlinks temps this seal wrote (a pre-existing stale `.tmp`
   is overwritten on write and is not in the rollback set).
3. Commit: `renameSync` each part temp onto its `-partN.md` slot, recording each
   committed slot, then `renameSync` the fresh-main temp over `filePath` as the
   **final** step.
4. On any throw before the final rename: unlink every already-committed slot and
   every remaining temp this seal created, then re-throw. The source is never
   written until the last rename, so its path/contents/inode are untouched on
   failure.

This realizes the design's "replace the source as the single commit point": the
fresh-main rename over `filePath` is that point, and the per-part renames before
it are rolled back (slots unlinked) on failure — the design's "unlink the staged
parts" applied to fs-error renames, the only failure mode the spec's atomicity
criterion covers.

Re-shape `rotateIfOverBudget` to return the tagged union (delete the
`{ rotated, toPath }` shape and the local `countLines`; compute `isoWeekStr`
once via `isoWeekString(today)` and thread it to `bisectWeeklyLog`/
`atomicSeal`):

| `status` | Fields |
|---|---|
| `"noop"` | `fromPath` |
| `"sealed"` | `parts: string[]`, `fromPath` |
| `"incomplete"` | `parts: string[]`, `residue: { path, section, lines, words }`, `fromPath` |

- Missing file or the unchanged non-`force` short-circuit
  (`current + appendLines <= WEEKLY_LOG_LINE_BUDGET`, using shared `countLines`)
  → `{ status: "noop", fromPath }`.
- Otherwise call `bisectWeeklyLog`, `atomicSeal` the parts, and return
  `"sealed"` (residue null) or `"incomplete"`. For `incomplete`, map the
  residue to its file with `residue.path = slots[residue.partIndex]` (drop the
  internal `partIndex` from the caller-facing object). `fs` errors propagate
  (the writer has already rolled back).

Update `index.js`: export `bisectWeeklyLog`; the `rotateIfOverBudget` export
line is unchanged.

Verification: rewrite
`bun test libraries/libwiki/test/weekly-log.integration.test.js` (real
`node:fs`) to assert the three statuses and multi-part `parts` arrays. The
atomicity case seeds a source that bisects into **≥2 parts** and passes a
real-fs-backed `fs` wrapper that delegates
`writeFileSync`/`existsSync`/`readFileSync`/`unlinkSync` to `node:fs` and wraps
only `renameSync` to succeed on the first part rename and throw on the
**second** (so ≥1 slot is already committed when the failure hits, exercising
the slot-unlink rollback — not just temp cleanup) → assert the source
path/contents/inode are intact and **no** `-partN.md` slot (committed or staged)
survives.

## Step 4 — `fit-wiki rotate` handler

Consume the tagged union; exit non-zero only on an irreducible residue.

- **Modified:** `libraries/libwiki/src/commands/rotate.js`

Replace the `result.rotated` branch with a `switch (result.status)`:

- `noop` → `no rotation needed for ${agent}\n`, `{ ok: true }`.
- `sealed` → print one `sealed → ${part}\n` line per `result.parts`,
  `{ ok: true }` (the old single `rotated ${fromPath} → ${toPath}` line is
  retired with the result shape).
- `incomplete` → print the part lines, then to stderr name
  `result.residue.section` with its `lines`/`words` overflow and point at the
  manual-recovery convention; return `{ ok: false, code: 1 }`.

Wrap the call in `try/catch`; a thrown fs error returns `{ ok: false, code: 1 }`
with the message on stderr.

Verification: new
`bun test libraries/libwiki/test/cli-rotate.integration.test.js` — modelled on
`cli-fix.integration.test.js` (real `node:fs` under `mkdtempSync`,
`makeRuntime`/`ctxFor` from `helpers.js`; **not** `createMockFs`, which has no
`renameSync`). Covers sealed-multi-part (exit 0, each part printed) and
irreducible (exit 1, residue named). The `rotate-help` golden
(`test/golden/fit-wiki/rotate-help.stdout.txt`) pins `--help` output only and is
unaffected — the command description in `cli-definition.js` is unchanged, and
the retired `rotated … → …` stdout string lived only in the integration tests
this plan rewrites (no other test asserts it).

## Step 5 — `fit-wiki fix` auto-fixer

Migrate the deterministic pre-pass onto the tagged result so an over-cap
multi-day current log now resolves clean.

- **Modified:** `libraries/libwiki/src/commands/fix.js`

In `rotateOverBudgetMainLogs`:

- A main log over **both** line and word budget yields two `rotate` findings
  with the **same `f.path`** (different rule ids); inside the loop, skip any
  `f.path` already sealed this pass (a `Set` of sealed paths) — deduping by rule
  id would not help. Otherwise the second `force: true` call bisects the
  freshly-written `defaultH1` main into a spurious near-empty part.
- Replace the `res.rotated` check with
  `if (res.status === "sealed" || res.status === "incomplete")` and print one
  relative `rotated … -> …` line per `res.parts`.
- Wrap each seal so a thrown fs error surfaces on stderr and the loop continues
  to the re-audit (the source is intact after a rollback).

No partition change: after the pre-pass, the re-audit (`audit()`) sees
conforming parts and the run exits 0 (`fixed: wiki audit is clean`); only a
genuine irreducible residue leaves a `weekly-log-part.*-budget` finding, which
flows to the existing flag set (exit 2).

Verification: `bun test libraries/libwiki/test/cli-fix.integration.test.js` —
the existing over-budget test (`cli-fix.integration.test.js:253`, a single
600-line block with **zero** day-sections — now a prologue-overflow irreducible
case) has its fixture replaced with a **multi-day** over-cap log (≥2
`## YYYY-MM-DD` sections, each individually under both budgets but jointly over
the line budget); its current `result.code === 2` /
flagged-`weekly-log-part.line-budget` assertions invert to exit 0 + clean
re-audit + ≥2 conforming parts. Add a separate irreducible single-day test (one
`## YYYY-MM-DD` section alone over a budget) asserting exit 2 with
`weekly-log-part.line-budget` still flagged.

## Step 6 — Append paths

Begin consuming the result instead of discarding it; never block the append.

- **Modified:** `libraries/libwiki/src/commands/log.js`

In `runDecision`/`runNote`/`runDone`, capture the `rotateIfOverBudget` return.
On `status === "incomplete"`, write a one-line residue notice to
`runtime.proc.stderr` (the residue is a sealed part, not the live file); on any
status the append proceeds against the fresh current file as today (`runNote`'s
`lastDateHeading` read runs against that fresh file and correctly opens a new
dated entry). Wrap the rotate call in `try/catch` — a thrown fs error is
reported to stderr and the command still returns `{ ok: true }` after appending
against the (intact) current file.

Verification: add a real-fs integration case (a new
`cli-log.integration.test.js`, modelled on `cli-fix.integration.test.js`;
**not** the mock-backed `cli-log.test.js`, whose `createMockFs` has no
`renameSync`) driving `log decision` against a current log over the **line**
budget across ≥2 day-sections (the append path's non-`force` short-circuit
triggers on the line budget only, so a word-only-over fixture would `noop` and
never seal); assert the source is sealed into conforming parts and the new dated
entry lands in a fresh current `<agent>-YYYY-Www.md`. `note`/`done` share the
same rotate-then-append path; the existing under-budget `cli-log.test.js` cases
(no seal triggered) keep passing on the mock.

## Step 7 — Sealed-part hint text

Reword the sealed-part budget hints so a surviving over-budget part reads as a
hand-edited part or an irreducible single-day section — the cases a human
should still act on.

- **Modified:** `libraries/libwiki/src/audit/rules.js`

Reword the `weekly-log-part.line-budget` and `weekly-log-part.word-budget`
`hint` strings: a sealed part over budget now means a hand-edited part or an
irreducible single-day section; the bisecting seal produces conforming parts
otherwise. Rules stay `remediation: "flag"`; `severity`, `check`, and `message`
are unchanged.

Verification: `bun test libraries/libwiki/test/audit-rules.test.js` green (the
engine does not assert hint text; no golden pins it — the rotate/fix goldens
cover `--help` only).

## Risks

- **No in-memory `renameSync`.** Every test that triggers a seal must run
  against real `node:fs` (Steps 3–6 say so); a reviewer or implementer reaching
  for `createMockFs` will hit an undefined `renameSync`.
- **`incomplete.parts` includes the over-cap residue part.** Callers must not
  treat a non-empty `parts` as "all conforming" — the residue part is in the
  list and is the one the audit then flags. Steps 4/5 rely on this so the flag
  reaches a human.
- **Residual post-commit failure is out of scope.** Atomicity holds up to the
  final fresh-main rename; a crash *between* the part renames and that rename
  (kernel-level, not an `fs` throw) can leave committed parts with the source
  still over-budget, so a re-run would create duplicate parts. The design's
  Atomicity decision (unlink the staged parts on failure) and the spec's
  atomicity criterion address fs-error renames, which the rollback covers; a
  mid-commit kernel crash is not in that envelope.

## Execution

Single library, one cohesive change — execute on one engineering agent
(`staff-engineer`) in step order. Steps 1→3 are sequential (each builds on the
prior); Steps 4–7 depend on Step 3's result shape and can be done in any order
once it lands. No `technical-writer` hand-off — the only prose touched is the
in-code hint strings, which travel with the rules change.
