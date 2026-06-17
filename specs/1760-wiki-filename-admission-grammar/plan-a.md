# Plan 1760 — wiki filename admission grammar

Execution plan for [design-a.md](design-a.md) implementing [spec.md](spec.md).

## Approach

Build the grammar bottom-up: a pure classifier module (`grammar.js`) with its
own unit tests, then the disk-walk + git-index enumerator (`admission.js`), then
wire both into the audit via a new `admission` scope and one `fail`/`flag` rule.
`fit-wiki fix` needs no code change — its existing partition routes any
`remediation !== "agent"` finding to the flag-for-human report. Document the
grammar in a new shared `memory-protocol.md` section last, so the prose mirrors
the shipped classifier. Each step is independently verifiable; steps 1–2 land
before 3 (the scope imports both modules).

Libraries used: libutil (runRules engine, subprocess.runSync, emitFindings), libmock (createMockFs for unit/no-git tests); libwiki test helpers `makeRuntime` (real subprocess), `git`/`createBareRepo`/`cloneRepo` for the git-present integration test.

## Step 1 — Grammar matcher module

Intent: a pure function classifying one wiki-relative path against the grammar.

Files: create `libraries/libwiki/src/audit/grammar.js`.

- Export `classifyPath(relPath, { rootSummaryAgents })` → `"admitted"` | `"rejected"`.
- Calendar-token detection, **hyphen-boundary anchored, not per-segment** — a
  token must occupy whole hyphen-delimited segments, so `(?:^|-)TOKEN(?=-|$)`:
  - week `\d{4}-W\d{2}`, month `\d{4}-M\d{2}`, date `\d{4}-\d{2}-\d{2}`, bare year `\d{4}`.
  - `hasCalendarToken(name)` (name = basename sans `.md`) returns true iff any of
    the four boundary-anchored REs matches. The boundary anchoring is what makes
    `8080` *inside a longer segment* (`release8080-notes`) not a token while a
    standalone `8080` segment IS a bare-year token. A per-segment split would
    silently miss the multi-segment week/month/date tokens — the bug this guards.
- Root-file classification (path has no `/`):
  - named ledger: basename ∈ `{Home.md, MEMORY.md, STATUS.md}`.
  - weekly log: `WEEKLY_LOG_NAME_RE` or `WEEKLY_LOG_PART_NAME_RE` (import from `../constants.js`).
  - storyboard: `^storyboard-\d{4}-M\d{2}\.md$`.
  - dated deliverable: `^(.+)-\d{4}-\d{2}-\d{2}\.md$` where the captured `<topic>`
    group passes `!hasCalendarToken(topic)` (re-run the token check on the topic
    so a trailing date cannot smuggle in a token-bearing stem).
  - summary: ends `.md` and `!hasCalendarToken(basename sans .md)`.
  - any other root file (incl. non-`.md`, or token-bearing non-match) → `rejected`.
- Directory classification (first path segment of a nested path): admitted iff
  the segment is `metrics` or an `<agent>` ∈ `rootSummaryAgents`; else `rejected`.
  Files under an admitted root directory → `admitted` by membership.

Verification: a Node REPL (`node -e`) importing `classifyPath` returns
`"admitted"` for `staff-engineer.md` and `metrics/x/y.csv`, `"rejected"` for
`product-manager-2026-W24-history.md` and standalone `8080.md`, `"admitted"` for
`release8080-notes.md`. (Step 5 lands these as the `audit-grammar.test.js` suite.)

## Step 2 — Tracked-file enumerator

Intent: yield the admission universe (wiki-relative tracked paths) for the scope.

Files: create `libraries/libwiki/src/audit/admission.js`.

- Export `listAdmissionPaths({ wikiRoot, fs, subprocess })` → `string[]` (wiki-relative).
- Walk the tree with `fs.readdirSync(dir)` + `fs.statSync(entry)` per child
  (not `withFileTypes` — the sync fs surface and its mock do not expose it),
  recursing into directories, collecting file paths relative to `wikiRoot`.
  Skip a top-level `.git` directory.
- Tracked intersection: run `subprocess.runSync("git", ["ls-files", "-z"], { cwd: wikiRoot })`.
  - exit 0 → split stdout on `\0`, drop empties; keep only walked paths in that set.
  - no git state — `exitCode !== 0` (covers both no `.git` and a non-repo cwd:
    `git ls-files` outside a work tree exits non-zero) — the fixtures/bootstrap
    case (design § Key Decisions) → keep the whole walk.

Verification: covered by Step 3's scope tests (git-present + no-git paths).

## Step 3 — `admission` scope and context wiring

Intent: expose non-admitted paths as audit subjects.

Files: modify `libraries/libwiki/src/audit/scopes.js`.

- `buildContext` gains `subprocess` in its options. Compute `rootSummaryAgents`
  **first** — the root-level files whose basename classifies as the summary class
  (depth-0, `.md`, token-free) sans `.md` — because directory classification
  depends on that set. Then run the enumerator. Store both on the ctx:
  `ctx.admission = { paths, rootSummaryAgents }`.
- Add `SCOPE_RESOLVERS.admission = (ctx) => ctx.admission.paths.filter(p => classifyPath(p, ctx.admission) === "rejected").map(p => ({ path: path.join(ctx.wikiRoot, p), relPath: p }))`. Passing the whole `ctx.admission` ({paths, rootSummaryAgents}) is intentional — `classifyPath` destructures `{ rootSummaryAgents }` and ignores the extra `paths` key.
- Import `classifyPath` from `./grammar.js`.

Files: modify `libraries/libwiki/src/commands/audit.js` (one `buildContext` call,
line 20) and `commands/fix.js` (two calls: line 126 in `rotateOverBudgetMainLogs`,
line 283 in the `audit` closure) — pass `subprocess: runtime.subprocess` into each.

Verification: `bun test test/audit-engine.test.js` (extended in Step 5) passes.

## Step 4 — Admission rule

Intent: one finding per rejected tracked path, routed to flag-for-human.

Files: modify `libraries/libwiki/src/audit/rules.js`.

```js
{
  id: "admission.not-in-grammar",
  scope: "admission",
  severity: "fail",
  remediation: "flag",
  check: () => ({}),
  message: (s) => `${s.relPath} matches no wiki filename grammar class`,
  hint: "rename to an admitted class or extend the grammar section in memory-protocol.md and audit/grammar.js together (see the admission path)",
}
```

(The resolver already filtered to rejected paths, so `check` always fires.)

Verification: `bun test test/audit-engine.test.js` shows `admission.not-in-grammar` for a rejected fixture and absent for a clean one.

## Step 5 — Tests

Intent: cover the classifier, the enumerator's two universes, the rule, day-one clean, and flag-for-human.

Files: create `test/audit-grammar.test.js`; extend `test/audit-engine.test.js`;
create `test/audit-admission.integration.test.js`; extend `test/cli-fix.integration.test.js` (or add a focused fix case).

- `audit-grammar.test.js` (unit, no fs): each root class admitted; the #1570
  rogue `product-manager-2026-W24-history.md` rejected; trailing-token smuggling
  (`...-history-2026-06-11.md`, `...-history-2026-W25.md`) rejected; calendar-token
  boundary cases — `release8080-notes.md` admitted (substring, not a token),
  standalone `8080.md` **rejected** (bare-year token matching no exact shape);
  each of the nine dated-deliverable filenames admitted; multi-segment week/month/
  date tokens detected (regression guard for the boundary-anchored helper);
  `metrics/x.csv` and `<agent>/y.csv` sidecar files admitted, a foreign root dir
  file (`.claude/worktrees/agent-x`) rejected.
- `audit-engine.test.js` (mock fs, no `.git`): a clean seed of every class plus
  sidecar/metrics entries fires zero `admission.*`; adding a rejected file fires
  exactly one finding naming its relPath; reconstruct `.claude/worktrees/agent-a41a176e`
  → rejected.
- `audit-admission.integration.test.js` (real temp repo via `createBareRepo`/`cloneRepo`/`git`,
  `makeRuntime` real subprocess): seed admitted + one untracked rogue → audit
  clean (untracked excluded); `git add` the rogue → audit flags it; confirms the
  `git ls-files -z` intersection. A separate no-git case runs the enumerator with
  `cwd` pinned to a fresh temp dir **outside** any git tree (so `git ls-files`
  exits non-zero) and asserts the whole-walk fallback — never relying on the
  process cwd, which is inside the monorepo's own repo.
- fix integration: a wiki with one rejected tracked file → `runFixCommand`
  leaves the file byte-identical and reports it in the flag-for-human (stderr)
  output, exit code 2.

Verification: `bun test` in `libraries/libwiki` green.

## Step 6 — Document the grammar (Decision 2 + 4)

Intent: declare the filename grammar in its one contract home.

Files: modify `.claude/agents/references/memory-protocol.md`.

- Add a new `## Wiki Filename Grammar` H2 (after `## Weekly Log Contract`)
  declaring: the git-tracked universe and its no-git fixture fallback; the
  calendar-token vocabulary (week/month/date/bare-year, segment-anchored); the
  five root classes and token-free `<topic>`/`<slug>` constraints; the
  root-level directory rule (`metrics/`, `<agent>/` sidecars, innards
  unpoliced); flag-for-human remediation; and the admission path (extend this
  section **and** `audit/grammar.js` in one reviewed change) as the single
  admission mechanism. Note the section also hosts Spec 1770's sealed-part
  heading grammar (created by whichever lands first).
- In the `## Summary Contract` / `## Weekly Log Contract` sections, add a one-line
  pointer to this section as the normative declaration of filename shapes (no
  drifting copies).

Verification: `rg "Wiki Filename Grammar" .claude/agents/references/memory-protocol.md`; `bun run check` passes the Context/instructions budget for the file.

## Step 7 — Day-one-clean against the live wiki

Intent: prove the grammar admits every legitimate file at real HEAD (spec
criterion 1), not just representative fixtures.

Files: none (verification step).

- From a project with the live wiki cloned, run `bunx fit-wiki audit` and
  observe zero `admission.not-in-grammar` findings. If any legitimate file is
  flagged, the grammar — not the file — is wrong: widen the matching class (e.g.
  an undocumented dated-deliverable stem) and add a regression fixture in
  `audit-grammar.test.js`. Never rename or move a live file (spec § Grandfathering).

Verification: `bunx fit-wiki audit` on the live wiki → no `admission.*` finding.

## Risks

- `memory-protocol.md` has a CI line/word budget (`Context/instructions`). The
  new section plus 1770's heading grammar must fit; keep the prose terse and
  defer mechanics to the audit. If over budget, tighten the existing contract
  sections that now defer to the grammar section rather than dropping grammar
  content.
- The fix command builds `buildContext` in two places (`fix.js` lines 126 and
  283); missing either leaves a `subprocess`-less context that throws on
  `runSync`. After Step 3, `rg "buildContext\(" libraries/libwiki/src/commands`
  to confirm all three sites (audit.js + the two in fix.js) thread `subprocess`.
- The live wiki may hold a legitimate file under an undocumented convention not
  in the HEAD survey; Step 7 surfaces it as a grammar gap to widen, not a file to
  move.

## Execution

Single engineering agent, sequential: Steps 1→2→3→4→5→6→7. Step 6 (docs) could
be routed to `technical-writer` but is tightly coupled to the shipped grammar,
so keep it with the implementer. No parallelism warranted.

— Staff Engineer 🛠️
