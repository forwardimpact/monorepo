# Plan 1780 — libwiki commitAndPush failure surfacing

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Rework `WikiSync.commitAndPush` to ground success in observed remote state,
remove the `-X ours` clobber fallback, classify every failure through a typed
`WikiPushFailure` reason, add a write-time conservation guard and a
post-reconcile residue check, and emit a per-event conservation self-report;
then map outcomes per caller at the three surfaces, retire the `wiki-sync.sh`
push-mode bypass, and wire the Stop hook to a blocking exit. Retry (D3) is out
of contract here (1750's ancestry judgment is absent from this tree); its
activation is 1750's plan. Build bottom-up: primitives, core, surfaces,
publication coverage, hook, docs, tests.

Libraries used: libutil (GitClient), libwiki (WikiSync, command surfaces),
libmock (createMockGitClient / createMockSubprocess, real-git test harness).

## Step 1 — GitClient primitives

Intent: the read-only and push observations the honest classification, the
conservation guard, and the residue check require.

Files: `libraries/libutil/src/git-client.js` (modified),
`libraries/libutil/test/git-client.test.js` (modified),
`libraries/libmock/src/mock/git-client.js` (modified).

Add to `GitClient`:

```js
/** Push with the machine-readable per-ref status (`--porcelain`); allowFailure. */
async pushPorcelain(remote, branch, { cwd } = {}) {
  return this.#runRaw(["push", "--porcelain", remote, branch], { cwd, allowFailure: true });
}
/** The commit SHA the remote ref points at, read fresh (ls-remote); throws on
 *  transport failure, returns "" when the ref does not exist on the remote. */
async remoteRefTip(remote, branch, { cwd } = {}) {
  const r = await this.#runRaw(["ls-remote", remote, branch], { cwd });
  return r.stdout.split("\t")[0]?.trim() ?? "";
}
/** Whether `ancestor` is an ancestor of `descendant` (merge-base --is-ancestor). */
async isAncestor(ancestor, descendant, { cwd } = {}) {
  const r = await this.#runRaw(["merge-base", "--is-ancestor", ancestor, descendant], { cwd, allowFailure: true });
  return r.exitCode === 0;
}
/** Porcelain status XY codes for unmerged-path detection. */
async statusPorcelain({ cwd } = {}) {
  return this.#runRaw(["status", "--porcelain"], { cwd });
}
/** Whether a rebase is in progress (.git/rebase-merge or rebase-apply). */
// (implemented in WikiSync via fsSync, no git call — see Step 2)
/** Name-status lines between two tree-ish (`<code>\t<path>`). Codes are read
 *  going `a`→`b`: a path present in `a` but gone in `b` is `D`, modified `M`,
 *  added `A`. The conservation guard calls it tip-first (a=remote-tip, b=HEAD)
 *  so a dropped foreign file reads `D`. */
async diffNameStatus(a, b, { cwd } = {}) {
  const r = await this.#runRaw(["diff", "--name-status", a, b], { cwd });
  return r.stdout.trim();
}
/** Read a blob at `ref:path`, or "" when absent (allowFailure). */
async showFile(ref, filePath, { cwd } = {}) {
  const r = await this.#runRaw(["show", `${ref}:${filePath}`], { cwd, allowFailure: true });
  return r.exitCode === 0 ? r.stdout : "";
}
/** Drop a stash by SHA (never by stack position). */
async stashDropBySha(sha, { cwd } = {}) {
  return this.#runRaw(["stash", "drop", sha], { cwd, allowFailure: true });
}
```

Add each new method name to `GIT_METHODS` in
`libraries/libmock/src/mock/git-client.js` so the mock exposes them (the mock
spies every name in that array and returns `responses[method]`; new methods
have no default special-casing, so tests must supply a response).

Verification: `bun test libraries/libutil/test/git-client.test.js` and
`bun test libraries/libmock` — assert each method's argv and exit-code mapping,
including `pushPorcelain` returning the raw `<flag>\t<src>:<dst>\t<summary>`
stdout for a rejected (`!`) and an accepted (`=`/` `) ref so the destination-ref
parse is covered at the primitive level (WikiSync tests in Step 2 exercise the
classification on top of it), and `remoteRefTip` returning `""` for an empty
`ls-remote` (absent ref).

## Step 2 — commitAndPush honest core

Intent: ground success, remove the clobber fallback, classify failures, run
the precondition, conservation, and residue checks, and self-report.

Files: `libraries/libwiki/src/wiki-sync.js` (modified),
`libraries/libwiki/test/wiki-sync.test.js` (modified).

Add the reason vocabulary and error:

```js
const PUSH_REASONS = Object.freeze({
  LANDED: "landed", NOTHING: "nothing-to-push", REJECTED: "rejected",
  CONFLICT: "conflict", RESIDUE_CONFLICT: "residue-conflict",
  TRANSPORT: "transport", PRECONDITION: "precondition",
  CONSERVATION: "conservation",
});

export class WikiPushFailure extends Error {
  /** @param {string} reason - A PUSH_REASONS value. @param {string} message */
  constructor(reason, message, { stashSha } = {}) {
    super(message);
    this.name = "WikiPushFailure";
    this.reason = reason;
    if (stashSha) this.stashSha = stashSha;
  }
}
```

Rewrite `commitAndPush` to the design's outcome flow:

1. **Precondition (D7).** Refuse before mutating when a rebase is in progress
   (`#runtime.fsSync.existsSync` of `.git/rebase-merge` or `.git/rebase-apply`
   under `wikiDir`) or HEAD is detached. Detached-HEAD detection uses a small
   private `#onBranch()` helper that runs `git symbolic-ref -q HEAD` with
   `allowFailure` and treats a **non-zero exit** (no branch) as detached — not
   a string compare, since `symbolic-ref` exits non-zero rather than returning a
   name on a detached HEAD. (When 1750 later lands, this collapses onto 1750's
   `headBranch` primitive; until then the local helper stands.) Throw
   `WikiPushFailure(PRECONDITION, …)`.
2. **Commit** if dirty (unchanged: `commitPaths`/`commitAll`).
3. **Grounded nothing-to-push (D2).** Read the remote tip
   (`remoteRefTip("origin","master")`); a non-empty tip that `isAncestor("HEAD",
   <tip>)` returns `{ landed: false, reason: NOTHING }`. An **empty** tip
   (ref absent on the remote) is never nothing-to-push — it falls through to the
   push so a first publication lands. Never gate on tree dirtiness — a
   clean-but-ahead stranded-resume tree falls through to push.
4. **Fetch + rebase autostash** (unchanged call). Capture the fetch outcome
   (success/failure) for the rejected-vs-transport conditioning.
5. **Residue check (D9).** A single private `#hasUnmergedPaths()` reads
   `statusPorcelain` after the rebase returns; if any XY ∈
   {UU,AA,DD,AU,UA,DU,UD}, throw `WikiPushFailure(RESIDUE_CONFLICT, …,
   { stashSha })` — resolve the stash SHA from `refs/stash` (a
   `rev-parse refs/stash` read), leave `refs/stash` intact, do not push. This
   one grounded check covers whatever tree state any reconcile path left (the
   design's `#hasUnmergedPaths()`); `statusPorcelain` is the GitClient method it
   calls.
6. **Conflict (D2).** If the rebase exited non-zero (and the tree is not in the
   residue shape), abort and throw `WikiPushFailure(CONFLICT, …)`. The
   `mergeOursStrategy` fallback is **deleted**.
7. **Conservation guard (D5).** Compare the would-be-pushed tree (`HEAD`)
   against the observed remote tip. Direction matters:
   `diffNameStatus(<remote-tip>, "HEAD")` reports content present at the remote
   tip but **gone in HEAD** as `D` (deleted going tip→HEAD), and content
   modified as `M` — these are the candidate drops. (Equivalently
   `diff HEAD <remote-tip>` reports the same files as `A`; the plan fixes the
   tip-first arg order so the code is `D`/`M`, matching the "dropped/changed at
   the remote" intent.) For each `D`/`M` path, read `showFile(<remote-tip>,
   path)` vs `showFile("HEAD", path)` and detect whether a **foreign** row or
   section present at the tip is absent in HEAD (whole-file `D`, or a
   row/section `M`-drop). A detected foreign drop refuses
   (`WikiPushFailure(CONSERVATION, …)`) unless carried by a deliberate act:
   a release/expiry record, an authored shared-record state transition, or a
   removal declaration in the intent sidecar (Step 3). Pusher-authored content
   (own files/own rows) is excluded. Emit the self-report (Step 5) for the
   outcome class.
8. **Push grounded (D2).** `pushPorcelain`; parse the per-ref line for
   `refs/heads/master` — flag ` `/`=` ⇒ landed, `!` ⇒ rejected. If the report
   is ambiguous, fall back to a post-push `remoteRefTip` + `isAncestor`. On
   not-landed: if the fetch succeeded ⇒ `REJECTED`; if the fetch failed ⇒
   `TRANSPORT`. Push transport error (thrown) ⇒ `TRANSPORT`. Return
   `{ landed: true, reason: LANDED }` only on grounded acceptance.

Retry (D3) is **not** implemented here: `REJECTED` throws immediately with
rerun guidance. Leave a single commented seam noting 1750's plan owns
activation.

Verification: `bun test libraries/libwiki/test/wiki-sync.test.js` — new tests
drive each branch via `createMockGitClient`, each asserting the named spec
criterion:

- **Landed only when grounded** — landed reported only on a per-ref `=`/` `
  flag or a post-push remote-tip containing HEAD.
- **Occurrence-#41 fixture** — force only the inadmissible channels to report
  success (success-shaped subprocess + zero exit) while the per-ref report is
  **absent or reports the ref un-updated, never a fabricated ok line**, and the
  remote tip does not advance; assert a D2 failure reason and the success
  shape **absent**, so both grounding mechanisms classify failure.
- **Honest-rejection companion** — push subprocess exits non-zero honestly
  (no forced stub, the `ba1468cf`/`bc982943` shape); assert the wrapper does
  not mint success.
- **Grounded nothing-to-push** — only when the observed remote ref contains
  local HEAD.
- **Stranded-resume re-push** — clean tree, local commits ahead, stale
  tracking ref; assert a push **is** attempted and nothing-to-push is
  **absent** (an implementation gating on tree-dirtiness fails).
- **Precondition (D7)** — rebase-in-progress **and** plain detached HEAD,
  separately; assert non-zero, precondition reason, success **and**
  nothing-to-push messages absent, **no remote mutation and no local
  mutation** (no new commit, rebase state untouched, stash unchanged); plus
  the state-equivalent interrupted-reconcile leg (stopped rebase + autostash
  entry present) on re-invocation, stash left untouched and named.
- **Rebase conflict** — loud, aborted, **no** merge commit resolving to the
  local side, `mergeOursStrategy` never called, remote tip unchanged.
- **Rejected-vs-transport** — rejection after a successful fetch ⇒ `rejected`;
  push failure after a failed fetch ⇒ `transport`; push transport error ⇒
  `transport` with exactly one push attempt.
- **Residue-conflict (D9)** — autostash pop leaves `UU`; assert
  `residue-conflict`, stash preserved and named by SHA, push not attempted,
  the own rebased commit not reported landed.

Existing `commitAndPush` tests are revised to the new contract — notably the
"tolerates a failing push (fire-and-forget)" test (`wiki-sync.test.js:218` at
spec time) is **inverted** to assert a `WikiPushFailure`, and the silent-clobber
recovery rows are revised to the loud-conflict contract.

## Step 3 — Conservation intent sidecar

Intent: record locally that a removal is deliberate so the guard passes it,
surviving a stranded-push retry from the same clone.

Files: `libraries/libwiki/src/wiki-sync.js` (sidecar read/consult),
`libraries/libwiki/src/active-claims.js` (claim-row release/expiry already
records intent; confirm it composes),
`libraries/libwiki/test/wiki-sync.test.js`.

The sidecar is a single file at a fixed, git-reserved-name-free path under the
wiki clone's `.git/` — `.git/fit-wiki-removal-intent` (untracked, clone-local
so it persists across invocations but never publishes, and cannot collide with
git's own `.git` entries such as `rebase-merge`/`refs/stash`). It lists
declared-removal paths/rows for the current pending push. The conservation
guard (Step 2.7) consults it; a release/expiry record and an authored
shared-record transition are recognized without a sidecar entry. Lifecycle:
write on a declared removal; read in the guard; **clear only on a landed push**
(not on `nothing-to-push` or a refusal, so a stranded declaration survives to
its session-end retry per D5 — but a landed push that did not carry the
declared removal also clears it, so a stale declaration cannot leak into an
unrelated later push).

Verification: real-git fixtures for every conservation criterion, each reading
**content state of the remote-tip tree, never file-history output** (D5 —
`git log -S` TREESAME-prunes this erasure class):

- **Clean-rebase drop refused** — stale-read commit deletes a foreign claim
  row present in base and tip, no textual overlap (clean replay); refuse, row
  survives on the remote.
- **Post-resolution drop refused** — a manual conflict resolution dropped a
  foreign row; refuse, row survives.
- **Side-pick foreign run-record refused** — conflict resolution picks the
  local side of another writer's weekly-log file, dropping a run-record
  section; refuse, section survives.
- **Clean-replay non-claim refused (Run 414b shape)** — plain stale-base
  commit, no merge/conflict, whose tree deletes another writer's run-record/
  summary content; refuse — an implementation keyed to merge/conflict/
  resolution events fails this row.
- **Declared removal passes** — pushed history carries a removal declaration
  (cross-lane budget-trim); push succeeds, trim lands.
- **Shared-record state transition passes** — authored commit transitions a
  foreign-written row to a new state (`plan approved` over another writer's
  row); push succeeds, row at the new state, **no** declaration demanded.
- **Stale revert refused** — would-be-pushed tree restores a superseded
  foreign row state with no authored transition (erases an approval signal);
  refuse, advanced state survives.
- **Conservation on the claim surface** — drive the stale-read deletion through
  `fit-wiki claim`; zero exit with the saved-locally warning (the guard refusal
  is a push failure under D1), foreign row survives, no silent drop.
- **Deliberate removals incl. retried** — targeted release and
  `release --expired` push successfully; then a targeted release whose push is
  forced to fail, then `fit-wiki push` from the same clone — carried removal
  lands; repeat the stranded-retry leg for a declared budget-trim removal.

## Step 4 — Surface outcome mapping

Intent: map `PushOutcome`/`WikiPushFailure` per caller (D1, D7, D9).

Files: `libraries/libwiki/src/commands/sync.js`,
`libraries/libwiki/src/commands/claim.js`, their tests.

- `sync.js` `runPushCommand`: print the success message only on
  `{ landed: true }`; on `WikiPushFailure` write the reason message to stderr
  and `return { ok: false, code: 1 }` (plain non-zero; the Stop-hook recipe
  maps it to 2, Step 6). On `nothing-to-push` print the existing message, zero
  exit.
- `claim.js`: `claim`/`release`/`release --expired` keep **zero exit** with a
  saved-locally warning carrying the reason on `rejected`/`transport` (the
  landed-locally write is complete; session-end push is the retry), but exit
  **non-zero** on `precondition`/`residue-conflict`/`conservation` (D7/D9
  unsafe-state family — distinct from D1's zero-exit). The success message
  prints only on `{ landed: true }`.

Verification: integration tests (real-git harness) covering each named spec
criterion:

- **`claim` failed push** — rejection and transport, separately: **zero exit**
  in both, honest saved-locally warning naming the reason, success message
  **absent**; and a landed claim ⇒ success message, zero exit.
- **`release` targeted** — repeat the three claim rows on an owned claim: same
  exit codes, warning, success gating.
- **`release --expired`** — repeat over an expired foreign claim: same, and the
  expired row's removal still pushes when healthy.
- **Parallel-claim trajectory end-to-end** — two fixture sessions claim the
  same table tail; assert the loser's claim exits zero with the saved-locally
  warning, its session-end `fit-wiki push` fails loud with a conflict/rejected
  reason, and a pull-then-push from the true tip lands the row.
- **Failed push never loses uncommitted work** — `claim`/`release` with the
  work-preservation step forced to conflict on the failure path; assert the
  residue is present in the working tree or retained where the message names.
- Across all surfaces: the success message is absent on every non-land.

## Step 5 — Conservation self-report (D8)

Intent: every publication event records its conservation outcome class at the
guard seam.

Files: `libraries/libwiki/src/wiki-sync.js`.

Emit a single structured line to **stderr** (never stdout — the surfaces parse
stdout for the success/nothing-to-push messages) naming the outcome class —
`pass`, `pass-via-exclusion`, `declared-removal`, `refusal` — once per
`commitAndPush` that **reaches the conservation comparison**. Pre-guard
early-returns (`precondition`, `nothing-to-push`, `residue-conflict`,
`conflict`) never run the comparison, so they legitimately emit no conservation
line — the D8 outcome classes are all comparison classes, and "every
publication event" (design) means every event that reaches the guard. Prefix
the line (`wiki-conservation:`) so it is greppable and unambiguously not a
surface message. No new dependency — `this.#runtime.proc.stderr.write`.

Verification: tests assert exactly one prefixed self-report line on stderr per
outcome class across the guard branches, and that stdout carries no
self-report line (so surface message parsing is unaffected). The hook and
background-sync surfaces reach the same seam because they invoke the same
`commitAndPush`; an integration test driving `fit-wiki push` confirms the line
appears for a CLI publication, and the routed-equivalence argument (one
primitive, all surfaces) is stated for the hook/background paths that share it.

## Step 6 — Publication-surface coverage and hook wiring (D8, D4)

Intent: remove the `wiki-sync.sh` push-mode bypass and wire the Stop hook to a
blocking, fidelity-preserving exit.

Files: `scripts/wiki-sync.sh` (modified), `justfile` (`wiki-push` recipe),
`.claude/settings.json` (Stop hook), `scripts/` tests if present.

- `scripts/wiki-sync.sh`: **delete** the push-mode block (the
  `git rebase … || git merge -X ours` fallback and the `auth_git push`);
  replace push mode with a delegation to `bunx fit-wiki push` (or remove push
  mode entirely and have callers use `fit-wiki push`). Pull mode is unchanged.
- `justfile` `wiki-push` / `.claude/settings.json` Stop: translate the CLI's
  non-zero push-failure exit into Claude Code's stop-blocking exit `2`. `just`
  propagates a recipe's exit code unchanged, so the translation is explicit in
  the recipe: `bunx fit-wiki push || exit 2` (a single command whose status is
  the CLI's, no pipeline to mask it — `$?` is read directly). Plain `fit-wiki
  push` keeps its own non-zero exit for CI steps (no remapping there). Document
  the wiring inline.

Writing under `.claude/`: follow self-improvement.md — use
`echo … | bunx fit-selfedit .claude/settings.json` if a direct write is
blocked.

Verification, per named spec criterion:

- **No in-tree publication bypass (D8)** — enumerate the in-tree publication
  surfaces of the wiki remote (CLI, session-end hook, background/harness sync);
  observe each routes through the guarded primitive or is named an accepted
  residual with an owner. For `wiki-sync.sh` specifically: drive the
  clean-replay erasure fixture through the script's push invocation and observe
  the **same refusal class the CLI reports** (never the clobber fallback), or
  confirm its push mode is absent/delegating.
- **Self-report per publication event (D8)** — drive one publication per routed
  surface (CLI `fit-wiki push`, the hook `just wiki-push`, the background/sync
  path) through fixtures producing each outcome class; observe the prefixed
  self-report line at the seam in every case (the surfaces share the one
  guarded primitive, so the seam fires regardless of caller).
- **Stop-hook blocks + feeds reason (D4)** — invoke the hook wiring with a push
  forced to fail; observe the blocking exit-2 semantics carrying the reason,
  and that a subsequent clean push permits the stop.
- **Exit-status fidelity (D4)** — wiring fixture where the CLI exits non-zero
  while every other process in the chain exits zero (the 2026-06-11 03:02Z
  shell-pipeline masking shape); observe the failure classification and the
  blocking semantics engage — an implementation whose observed status can be a
  downstream process's fails this row.

## Step 7 — Contract documentation

Intent: the `commitAndPush` JSDoc states the taxonomy, per-caller mapping, and
conservation guard.

Files: `libraries/libwiki/src/wiki-sync.js` (JSDoc).

Verification: `bun run jsdoc` passes; the block names the outcome taxonomy, the
per-caller exit mapping, the conservation guard, and traces to spec 1780. Plus
two suite-level criteria: **whole-tree sweep unchanged** — a fixture with
changes across multiple files through `fit-wiki push` produces a single
sweeping commit as today; and **healthy-clone otherwise unchanged** — run the
full libwiki suite (`bun test libraries/libwiki`) with the defect-asserting
rows inverted (the fire-and-forget test and silent-clobber recovery rows), plus
a healthy-clone fixture through all three surfaces showing unchanged outcomes
apart from the honest-success gating.

## Risks

- **`git push --porcelain` ambiguity**: parse the destination-side per-ref
  line (`<flag>\t<src>:<dst>\t…`) for `refs/heads/master`; treat an
  unparseable report as not-landed and fall back to the post-push remote-tip
  read (Step 2.8) rather than assuming success.
- **Conservation diff direction**: the guard must call
  `diffNameStatus(<remote-tip>, "HEAD")` (tip first) so a dropped foreign file
  reads `D`; the reversed arg order reports it as `A` and the guard would
  detect zero drops — silently passing the erasure class it exists to catch.
- **Conservation false positives**: an authored shared-record state transition
  (approval propagation) must pass; key the deliberate-act recognition on the
  pushed history / sidecar, never on merge-commit presence, or the
  approval-propagation flow breaks (spec D5 criteria explicitly test this).
- **Detached-HEAD seam with 1750**: on a tree where 1750's guard is later
  present, detached HEAD triggers both refusals; they must collapse to one
  observable refusal. This implementation owns only the `precondition` form;
  the second-lander reconciles reason naming.
- **`.claude/settings.json` write gating**: the Stop-hook edit may be blocked;
  use `fit-selfedit` per self-improvement.md.

## Execution

Single engineering agent, sequential: Steps 1→7. Step 1 (libutil) precedes
Step 2 (libwiki depends on the primitives); Steps 3–5 extend Step 2's core;
Step 6 depends on the CLI exit contract from Step 4. Step 6's `.claude/` and
`scripts/` edits and Step 7's docs can be done last. Retry activation is
explicitly **not** in this plan — it is owned by spec 1750's plan (D3).

— Staff Engineer 🛠️
