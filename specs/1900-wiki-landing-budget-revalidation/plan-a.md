# Plan 1900 — Post-landing pre-push budget re-validation (size axis)

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Amend `GitClient.showFile` to throw on an unreadable ref, export the budget
rule-id set from the audit, build a pure `budget-gate` module (measure + delta)
plus a `runBudgetGate` orchestrator, then site a single budget re-validation
call into `WikiSync.#reconcileAttempt` — after the conservation and secret
gates, before `#groundedPush` — that measures the committed `HEAD` against the
pre-fetch session base and the landed origin tip and **throws**
`WikiPushFailure` reason `budget` on a per-file/per-predicate regression,
surfacing caller-exempted memo-delivery breaches on the landed result. This is
the merged-1780-contract adaptation of the original design (owner-approved): the
refusal is a thrown failure, not a `{pushed:false}` return.

Libraries used: libutil (GitClient.showFile / revParse — `revParse` already
present, returns `""` on miss; countWords / countLines reused), libwiki (audit
RULES, buildContext, budget counters).

## Step 1: Amend `GitClient.showFile`

Distinguish an absent path from an unreadable ref so a tree measurement never
mistakes a pruned ref for an empty blob.

- Modified: `libraries/libutil/src/git-client.js`

`showFile` returns `null` only when stderr matches git's absent-path phrasing
(`does not exist in` / `exists on disk, but not in`); any other non-zero exit
throws `GitError`. (`revParse` is unchanged — it already resolves a ref or
returns `""`.)

Verification: `node --test libraries/libutil/test/git-client.test.js
libraries/libutil/test/git-client.integration.test.js`.

## Step 2: Export `BUDGET_RULE_IDS` from the audit

- Modified: `libraries/libwiki/src/audit/rules.js`

A frozen `Set` of the six budget rule ids, exported just before `RULES`.

Verification: imported by Step 3.

## Step 3: Build the `budget-gate` module

Measure outgoing and baseline budgets and compute the delta — pure functions
plus one orchestrator.

- Created: `libraries/libwiki/src/budget-gate.js`
- `budgetRules()` → resolved `[{id, scope, axis, check}]` (axis from the id
  suffix); throws on an unknown id (a rename surfaces here).
- `budgetedFiles(ctx, wikiRoot)` — enumerate budgeted files via the audit's
  `resolveScope` over the three budget scopes; returns `[{relPath, scope}]`.
- `measureRef(showFile, ref, budgeted)` — per file read the blob via `showFile`
  (`null` → counts 0), count once, and per budget rule on its scope record
  `{value, overCap}`. Returns `Map<relPath, Map<ruleId, {value, overCap}>>`. A
  thrown `GitError` (unreadable ref) propagates.
- `revalidateBudgets({outgoing, sessionBase, originTip, exemptSummaryFiles})` —
  pure delta: baseline = `max(sessionBase, originTip)` (absent → 0); refuse iff
  `overCap && value > baseline`, except a `summary.*` breach on an
  `exemptSummaryFiles` file is surfaced. Returns `{refusals, surfaced}`, each
  entry `{file, ruleId, baseline, value}`.
- `runBudgetGate({showFile, wikiRoot, today, fs, headRef, originRef,
  sessionBaseSha, exemptSummaryFiles})` — builds the context, enumerates,
  measures `HEAD` + both baselines, and returns the delta. Wraps the three
  `measureRef` calls in a `try/catch (GitError)` that aborts WITHOUT refusing
  (fail-visible) — never fabricating a value-0 baseline.

Verification: `node --test libraries/libwiki/test/budget-gate.test.js`.

## Step 4: Site the seam in `WikiSync`

- Modified: `libraries/libwiki/src/wiki-sync.js`

1. Add `BUDGET` to `PUSH_REASONS`; extend `WikiPushFailure` to carry optional
   `refusals` / `surfaced`.
2. In `commitAndPush(message, paths, { reapply, maxReapply, exemptSummaryFiles
   = [] })`: after the mid-merge guard, capture `sessionBaseSha = await
   revParse("origin/master")` (pre-fetch branch point), and thread
   `sessionBaseSha` + `exemptSummaryFiles` into `#reconcileAndPush` → opts.
3. In `#reconcileAttempt`, after `#gateOrRefuse` and before `#groundedPush`:
   `const gate = await this.#revalidateBudgets(opts.sessionBaseSha,
   {exemptSummaryFiles})`; if `gate.refusals.length`, `throw
   this.#budgetFailure(gate)`.
4. `#revalidateBudgets` is a thin bind of the clone's git/fs/clock onto
   `runBudgetGate` (`headRef: "HEAD"`, `originRef: REMOTE_BRANCH`).
5. `#budgetFailure(gate)` builds the `WikiPushFailure(BUDGET, msg, {refusals,
   surfaced})`, naming the offending files and the lead tuple.
6. On a landed push, attach `surfaced` to the result **only when non-empty**
   (happy path byte-identical — criterion 10).

Verification:
`node --test libraries/libwiki/test/wiki-sync-budget.integration.test.js` and
the existing `wiki-sync*.test.js` files stay green.

## Step 5: Tests

- Modified: `libraries/libutil/test/git-client.test.js` — absent-path mock now
  carries the matching stderr; new unreadable-ref-throws mock.
- Modified: `libraries/libutil/test/git-client.integration.test.js` — real-git
  read / absent-null / bad-ref-throws.
- Created: `libraries/libwiki/test/budget-gate.test.js` — pure coverage of the
  delta, equal-or-better pass, foreign pass-through, exempt-surface, and the
  measurement-parity + predicate-inheritance halves of criterion 8.
- Created: `libraries/libwiki/test/wiki-sync-budget.integration.test.js` —
  real-git bare-repo scenarios, one per criterion, against the merged taxonomy
  (a breach throws `WikiPushFailure` reason `budget`; the landed result carries
  `surfaced`):

| Test | Criterion |
|---|---|
| two under-cap inputs union over cap (distinct file regions, clean rebase) → throws `budget`, commit kept local | 1 |
| no-merge session-close rewrite over cap → throws `budget` | 2 |
| origin already over cap, writer adds words → throws `budget` | 3 |
| foreign over-cap file the writer did not touch → lands | 4 |
| owner trim leaves breached file ≤ baseline → lands | 5 |
| weekly-log line-budget regression → throws `budget` | 6 |
| failure names file, baseline, value, ruleId; reason class `budget` | 7 |
| gate over-cap decision equals the audit's; a stubbed predicate changes the gate with no gate code change (`budget-gate.test.js`) | 8 |
| `exemptSummaryFiles` summary breach → lands, `surfaced` non-empty | 9 |
| clean under-budget sync → lands, `surfaced` absent | 10 |
| foreign uncommitted over-cap dirt → lands (HEAD-only measurement) | residue |

Verification: `bun run test:gate` (node --test), then `biome format/lint`,
`eslint` (jsdoc), `bunx coaligned instructions`.

## Risks

- **Rebase conflict pre-empts the gate**: a wholesale-rewrite test fixture
  conflicts on rebase (the merged contract fails loud, no `-X ours`), throwing
  `conflict` before the gate. The union test must edit **distinct file regions**
  so the 3-way merge is clean and the gate is reached. (Encoded in the Step-5
  criterion-1 fixture.)
- **`surfaced` on the happy path**: attaching `surfaced: []` unconditionally
  changes the landed shape the merged tests strict-equal; attach only when
  non-empty.
- **`showFile` throw vs merged callers**: `#assertConserved` / `#tier1Probe`
  pass only observed-present refs, and `#tier1Probe` already swallows; the throw
  never fires there.

## Execution

Single engineering agent, sequential: Steps 1→2→3→4, then tests 5.

— Staff Engineer 🛠️
