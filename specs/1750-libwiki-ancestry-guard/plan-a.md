# Plan 1750 — libwiki commitAndPush ancestry guard

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Add read-only ancestry primitives to `GitClient`, add a typed `AncestryRefusal`
and a private `#assertPublishable` guard to `WikiSync` that runs before both the
commit and push gates of `commitAndPush`, and narrow the three command surfaces
so a guard refusal exits non-zero (piercing the claim/release saved-locally
degradation for that error class only). Build bottom-up: primitives, then the
guard, then the surfaces, then docs and tests.

Libraries used: libutil (GitClient), libwiki (WikiSync, command surfaces),
libmock (createMockGitClient / createMockSubprocess in tests).

## Step 1 — GitClient ancestry primitives

Intent: give the guard the five read-only git observations it needs.

Files: `libraries/libutil/src/git-client.js` (modified),
`libraries/libutil/test/git-client.test.js` (modified),
`libraries/libmock/src/mock/git-client.js` (modified).

Add these methods to `GitClient` (all thread through `#runRaw`; the network ones
carry the existing token via `this.#token`):

```js
/**
 * The short name of the branch HEAD points at, or "" when HEAD is detached.
 * An unborn HEAD on a branch (no commits yet) still returns that branch name —
 * `symbolic-ref` reads the ref HEAD targets, not whether it resolves — which is
 * why the guard's unborn-HEAD row (judged by refExists("HEAD")) is reachable
 * after the detached-HEAD row passes.
 */
async headBranch({ cwd } = {}) {
  const r = await this.#runRaw(["symbolic-ref", "--short", "-q", "HEAD"], {
    cwd, allowFailure: true,
  });
  return r.stdout.trim();
}

/** Whether `ref` resolves to a commit (rev-parse --verify). */
async refExists(ref, { cwd } = {}) {
  const r = await this.#runRaw(["rev-parse", "--verify", "-q", `${ref}^{commit}`], {
    cwd, allowFailure: true,
  });
  return r.exitCode === 0;
}

/** Whether `a` and `b` share a merge-base within the fetched history. */
async mergeBaseExists(a, b, { cwd } = {}) {
  const r = await this.#runRaw(["merge-base", a, b], { cwd, allowFailure: true });
  return r.exitCode === 0;
}

/** Whether `branch` exists on `remote` (ls-remote --heads); throws on probe failure. */
async remoteBranchExists(remote, branch, { cwd } = {}) {
  const r = await this.#runRaw(["ls-remote", "--heads", remote, branch], { cwd });
  return r.stdout.trim() !== "";
}

/** Deepen history to full depth for `branch` from `remote` (no-op if already complete). */
async fetchDeepen(remote, branch, { cwd } = {}) {
  return this.#runRaw(["fetch", "--unshallow", remote, branch], {
    cwd, allowFailure: true,
  });
}
```

Method-name map to design § "GitClient primitives" (renamed for verb-noun
consistency with the existing client): `revParseVerify`→`refExists`,
`lsRemoteHas`→`remoteBranchExists`, `fetchUnshallow`→`fetchDeepen`; `headBranch`
and `mergeBaseExists` are unchanged.

Note for the implementer: `fetchDeepen` uses `allowFailure` because
`--unshallow` errors on a complete clone; the guard treats a non-zero exit here
as "deepening failed" only after first confirming the clone is shallow (Step 2),
so a complete clone never reaches `fetchDeepen`.

Also add the five method names to the `GIT_METHODS` array in
`libraries/libmock/src/mock/git-client.js` so `createMockGitClient` exposes them
(it spies every name in that array and returns `responses[method]`). WikiSync
tests then pass per-method `responses` (e.g. `headBranch: "master"`,
`mergeBaseExists: true`); the new methods have no default-return special-casing,
so tests that exercise them must supply a response.

Verification: `bun test libraries/libutil/test/git-client.test.js` and
`bun test libraries/libmock` — new unit tests assert each GitClient method's
argv and its mapping of mock exit codes to return values; the libmock
completeness test (`runtime-completeness.test.js`) still passes.

## Step 2 — AncestryRefusal and the guard

Intent: refuse, before any commit or push, whenever the published history's
relationship to the remote branch cannot be positively confirmed.

Files: `libraries/libwiki/src/wiki-sync.js` (modified),
`libraries/libwiki/test/wiki-sync.test.js` (modified).

Add the error class and a shallow probe + guard. The configured branch is the
literal `master` (`BRANCH` constant local to the module):

```js
const BRANCH = "master";
const REMOTE = "origin";

export class AncestryRefusal extends Error {
  /** @param {"unrelated"|"unverifiable"} kind */
  constructor(kind, message) {
    super(message);
    this.name = "AncestryRefusal";
    this.kind = kind;
  }
}
```

Add `#isShallow()` (reads `.git/shallow` via `this.#runtime.fsSync.existsSync`
under `wikiDir`) and `#assertPublishable()` implementing the design decision
table, evaluated top to bottom:

1. `headBranch` ≠ `BRANCH` ⇒ throw `unverifiable` ("detached HEAD: cannot
   verify what would be published; re-clone the wiki").
2. Resolve whether the remote branch is present. If `origin/master` resolves
   (`refExists("origin/master")`) treat branch as present. Else
   `remoteBranchExists(REMOTE, BRANCH)` — its throw ⇒ `unverifiable`
   ("could not observe the remote; the local row is not published"); `false`
   ⇒ empty-new-wiki, return (allow); `true` ⇒ branch present.
3. Branch present + HEAD unborn (`!refExists("HEAD")`) ⇒ throw `unrelated`
   ("HEAD is unborn but the remote branch exists; re-clone the wiki").
4. Branch present + `mergeBaseExists("origin/master", "HEAD")` true ⇒ allow.
5. No merge-base + not shallow ⇒ throw `unrelated` ("local history is unrelated
   to the remote branch; re-clone the wiki").
6. No merge-base + shallow ⇒ `fetchDeepen`; non-zero ⇒ throw `unverifiable`
   ("could not deepen history to verify ancestry"); then re-check
   `mergeBaseExists` — true ⇒ allow, false ⇒ throw `unrelated` (confirmed).

Call `#assertPublishable()` at the top of `commitAndPush` (before the commit
gate) and again immediately before the `fetch`/push block. The emptiness probe
(`remoteBranchExists`) runs only on the path where `origin/master` does not
resolve, so the healthy hot path adds no round-trip.

Verification: `bun test libraries/libwiki/test/wiki-sync.test.js` — new tests
drive each decision row via `createMockGitClient`, asserting refusal kind and
that no `commitAll`/`commitPaths`/`push` ran on a refusal. Each test supplies
explicit per-method `responses` (the mock fails open — a missing `headBranch`
response returns `""`/detached, a missing `mergeBaseExists`/`refExists` returns
exit 0/true — so omitting one silently mis-drives the row; tests assert the
exact `git.calls` method sequence to catch this). Specific assertions the spec
rows require:
- **Push-half (clean tree, commits ahead)**: drive `isClean`→true,
  `#hasCommitsAhead`→true, and an unverifiable branch state; assert the refusal
  fires with no `push` call — this is the only shape exercising the second
  `#assertPublishable` invocation (spec row 3).
- **Shallow within window**: merge-base resolves; assert `fetchDeepen` is
  **absent** from `git.calls` and the push proceeds (spec row 5).
- **Shallow outside window**: `#isShallow`→true, first `mergeBaseExists`→false,
  `fetchDeepen`→exit 0, second `mergeBaseExists`→true; assert `fetchDeepen`
  **present** then push proceeds (spec row 4).
- **Hot path**: resolving `origin/master`, clean ancestry; assert the
  `git.calls` method sequence equals the pre-guard baseline plus only the local
  `symbolic-ref`/`rev-parse`/`merge-base` reads — no `ls-remote`, no `fetch`
  beyond today's (spec row 13).

## Step 3 — Surface error mapping

Intent: a guard refusal exits non-zero on `push`, `claim`, and `release`,
piercing the claim/release saved-locally degradation for `AncestryRefusal` only.

Files: `libraries/libwiki/src/commands/sync.js` (modified),
`libraries/libwiki/src/commands/claim.js` (modified),
`libraries/libwiki/test/cli-sync.integration.test.js`,
`libraries/libwiki/test/cli-claim.test.js` /
`libraries/libwiki/test/cli-claim.integration.test.js` (modified).

- `sync.js` `runPushCommand`: wrap the `commitAndPush` call in `try`; `catch
  (err)` re-throws unless `err instanceof AncestryRefusal`, in which case write
  `err.message` to stderr and `return { ok: false, code: 1 }`.
- `claim.js` `pushWiki`: in the existing `catch`, re-throw when `err instanceof
  AncestryRefusal` (all other errors keep the `push failed (saved locally)`
  degradation). `runClaimCommand` and `runReleaseCommand` wrap their `pushWiki`
  call; on a caught `AncestryRefusal` write a message stating the row is **not
  published** and remains an uncommitted working-tree change, and `return { ok:
  false, code: 1 }`. The local `writeFileSync` already ran, so the row is
  present-but-uncommitted as required.

Import `AncestryRefusal` from `../wiki-sync.js` in both command files.

Verification: integration tests run `push`/`claim`/`release` against real
fixture clones (created via the existing integration-test git harness) in the
unborn-HEAD, severed-history, and **detached-HEAD-with-pending-writes** shapes;
assert exit code 1, the not-published message, no commit created on any ref, no
push among the command's git operations, and the claim/release row present only
as an uncommitted change. The detached-HEAD case is the end-to-end replacement
for today's silent loss (spec row 8) and must run against a real clone, not the
mock. Also run the full existing libwiki suite (`bun test libraries/libwiki`)
to confirm healthy `push`/`claim`/`release` flows are unchanged (spec row 14).

## Step 4 — Contract documentation

Intent: the `commitAndPush` JSDoc states the guard.

Files: `libraries/libwiki/src/wiki-sync.js` (JSDoc on `commitAndPush`).

Extend the existing JSDoc to state: the guard refuses before both gates when the
published history's relationship to `origin/master` cannot be confirmed; the
two refusal kinds; the positive-evidence empty-wiki allowance; trace to spec
1750.

Verification: `bun run jsdoc` passes; read the block and confirm it names the
refusal conditions, the allowance, and the spec reference.

## Risks

- **`merge-base` exit-code convention**: `git merge-base a b` exits 1 (not an
  error) when no base exists; `mergeBaseExists` must use `allowFailure` and read
  `exitCode`, never throw on the no-base case. Wired in Step 1.
- **Detached HEAD must be caught first**: HEAD on a detached chain shares a
  merge-base, so the `headBranch` check must precede the merge-base check or the
  spec's detached-HEAD silent-loss trap reopens. Ordered first in Step 2.
- **Twice-invoked guard cost**: the second `#assertPublishable` before the push
  re-derives state; on the healthy path both calls hit only local refs
  (`symbolic-ref`, `rev-parse`, `merge-base`) — no network — so the hot-path
  no-extra-round-trip criterion holds.

## Execution

Single engineering agent, sequential: Steps 1→2→3→4. Step 1 (libutil) lands
before Step 2 (libwiki depends on the new primitives); Steps 3 and 4 depend on
Step 2's exported `AncestryRefusal`.

— Staff Engineer 🛠️
