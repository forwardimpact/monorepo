# Plan 1850-a-01 — landing layer (D3)

Scopes the wiki landing primitive's commit to the session's own write-set.
Covers SC3, SC4, SC5, SC11. Independent of Part 02.

Libraries used: libutil (GitClient), libwiki (WikiSync, runPushCommand),
libmock (createMockGitClient).

> **As-built note (merged-contract adaptation).** Spec 1780/1750 landed before
> this part and its `commitAndPush` contract is canonical (see
> [design § Relationship to spec 1780/1750](design-a.md#relationship-to-spec-17801750-the-contract-d3-builds-on)):
> a `{landed, reason}` / thrown `WikiPushFailure` taxonomy, the
> `#assertPublishable` + `AncestryRefusal` guard, and the singleton reapply path
> that already replaced the `-X ours` side-pick. So Steps 1–2 (the parallel
> `lsRemote`/`revParse` base-verification primitives) and the `{pushed}`
> `unverified-base`/`rebase-conflict`/`push-failed` reasons in Steps 3–6 are
> **subsumed** by the merged contract and were not implemented. The implemented
> residual is exactly the commit-scoping: a `#dirtyPaths` helper attributes the
> bare push's write-set, `commitAndPush` commits it via `commitPaths` instead of
> the whole-tree `commitAll`, and `runPushCommand` gains the repeatable
> `--paths` option. Read the steps below as the original intent; the merged
> contract supplies the base grounding and honest-outcome they describe.

## Step 1 — Add base-observation primitives to GitClient

Intent: give the landing path positive staleness evidence, replacing the
swallowed `fetch`.

Files: modify `libraries/libutil/src/git-client.js`,
`libraries/libutil/test/git-client.test.js`.

- Add `async lsRemote(remote = "origin", ref = "master", { cwd })` running
  `git ls-remote <remote> <ref>` and returning the 40-char tip SHA (first
  field of stdout), or `null` when stdout is empty. Non-zero exit throws
  `GitError` (no `allowFailure`): a failed observation is an error, not a
  swallowed success.
- Add `async revParse(rev, { cwd })` running `git rev-parse <rev>` and
  returning the trimmed SHA; throws `GitError` on failure.

Verification: `bun test libraries/libutil/test/git-client.test.js` — new cases
assert `lsRemote` returns the parsed SHA and `null` on empty, and that both
throw on non-zero exit.

## Step 2 — Register the new methods on the mock git client

Intent: keep the mock surface in lockstep with the real client.

Files: modify `libraries/libmock/src/mock/git-client.js`.

- Add `"lsRemote"` and `"revParse"` to `GIT_METHODS`.
- Default returns: extend the mock's string-default branch (currently
  `status`/`configGet`/`remoteGetUrl`) to include `lsRemote` and `revParse`, so
  both return `""` unless `responses[method]` is configured. WikiSync tests must
  configure both responses for the happy path; the empty-string default would
  otherwise read as a false-matching base (both `""`), so the tests set distinct
  or matching non-empty SHAs deliberately.

Verification: covered by Step 4's WikiSync tests, which configure these
responses.

## Step 3 — Rewrite WikiSync.commitAndPush

Intent: publish only the session's declared write-set on a verified-current
base, or refuse loudly; never side-pick, sweep, or report a false push.

Files: modify `libraries/libwiki/src/wiki-sync.js`.

Replace the `commitAndPush(message, paths)` body with:

- **Attribute the write-set.** When `paths` is given, the write-set is those
  paths (scoped callers). When `paths` is absent, the write-set is the session's
  own tree: collect the dirty paths from `status({ cwd })` porcelain output.
  Under the canonical per-session isolated checkout that dirty set holds no
  foreign content (KD6); the design's working-tree isolation is the operational
  precondition, not a runtime check, so SC11's "absent attribution, refuse"
  clause is satisfied by isolation for the bare path and by the explicit
  pathspec for scoped callers. If both are empty, return
  `{ pushed: false, reason: "clean" }`.
- **Commit scoped.** Commit only the attributed paths via `commitPaths(message,
  attributedPaths)` — never `add -A`. Foreign content on other paths is never
  staged.
- **Nothing ahead?** If not `#hasCommitsAhead()`, return
  `{ pushed: false, reason: "clean" }`.
- **Verify base current (do not rely on a swallowed fetch).** Read the
  authoritative remote tip directly with `remoteTip = await
  this.#authed().lsRemote("origin", "master", { cwd })`; `lsRemote` throws on a
  failed network observation rather than swallowing it. Read the local base
  with `localBase = await this.#git.revParse("origin/master", { cwd })`. The
  base is current iff `remoteTip` is truthy and `remoteTip === localBase`.
  Map a thrown `lsRemote` or a mismatch to `{ pushed: false, reason:
  "unverified-base" }` — no rebase, no push, the scoped commit preserved
  locally (SC5). Only on a verified-current base does the method fetch and
  rebase; this ordering makes the stale tip a positive observation, not a
  consequence of a suppressed fetch.
- **Rebase onto the verified base.** `fetch()` then `rebase("origin/master",
  { autostash: true })`. On non-zero exit, `rebaseAbort()` and return
  `{ pushed: false, reason: "rebase-conflict" }` — the `mergeOursStrategy`
  fallback is deleted (SC3). (1780's bounded retry and D9 residue handling are
  layered here when 1780 lands; this part adds neither, per the design's
  inherited-gate note.)
- **Honest push.** `await this.#authed().push("origin", "master", { cwd })`
  inside try/catch; on success return `{ pushed: true, reason: "pushed" }`, on
  throw return `{ pushed: false, reason: "push-failed" }` with the commit
  preserved locally (SC5, closes issue #1580). The push no longer swallows
  failure into `pushed: true`.

Because the base is verified by a direct `lsRemote` observation before any
fetch, the stale-tip case (SC5) reproduces whenever the remote tip differs from
the local `origin/master` ref — independent of whether a fetch would have
succeeded.

Verification: Step 6 tests.

## Step 4 — Wire the session-close caller and operator messages

Intent: `runPushCommand` (the Stop-hook landing) lands its own tree's write-set
with no manual declaration, and every refusal reason names a recovery path.

Files: modify `libraries/libwiki/src/commands/sync.js`,
`libraries/libwiki/src/cli-definition.js`.

- Add an optional repeatable `--paths <glob>` option to the `push` command for
  callers that know a narrower write-set; bare `npx fit-wiki push` (the hook
  invocation) passes no `--paths` and lands its dirty set, so the documented
  session-close invocation keeps working unchanged.
- Map the `reason` values to operator messages: `unverified-base`,
  `rebase-conflict`, and `push-failed` each print a distinct stderr line naming
  the recovery path and return `{ ok: false, code: 1 }`; `pushed` and `clean`
  keep exit 0.

`runClaimCommand` already scopes to `["MEMORY.md"]`; no change.

Verification: Step 6 CLI tests.

## Step 5 — Retire the whole-tree sweep path

Intent: no caller can reach the sweep.

Files: `libraries/libwiki/src/wiki-sync.js` (already done in Step 3 — the
`commitAll` branch is gone).

- Grep the repo: `commitAll` must have zero call sites in libwiki src after
  this part. (`GitClient.commitAll` itself stays — it is general-purpose — but
  is unused by the wiki landing path.)

Verification: `rg "commitAll" libraries/libwiki/src` returns nothing.

## Step 6 — Tests

Intent: lock the new contract; replace the assertions that encoded the old one.

Files: modify `libraries/libwiki/test/wiki-sync.test.js`,
`libraries/libwiki/test/cli-sync.integration.test.js`; the
`wiki-sync.integration.test.js` real-git cases updated to the new reasons.

Each mock case configures `responses.lsRemote` and `responses.revParse`
explicitly so a matching base is a deliberate non-empty SHA, never the mock's
empty-string default (which would otherwise read as a false-matching base).

Replace/extend cases:

- With `paths`, current base (`lsRemote === revParse`, both a non-empty SHA):
  commits scoped, rebases, pushes; result `{ pushed: true }`; call log contains
  `commitPaths, lsRemote, revParse, fetch, rebase, push` and no
  `mergeOursStrategy`/`commitAll` (SC4).
- Without `paths`: collects the dirty set via `status`, commits it via
  `commitPaths` (never `commitAll`), and on a current base pushes (the bare-hook
  case keeps working, SC11); a fully clean tree returns `{ pushed: false,
  reason: "clean" }`.
- Stale base (`lsRemote !== revParse`): `{ pushed: false, reason:
  "unverified-base" }`, no rebase, no push; the local commit remains (SC3, SC5).
- `lsRemote` throws (unobservable remote): same `unverified-base` outcome (SC5).
- Rebase conflict: `rebaseAbort` called, result `rebase-conflict`, no
  `mergeOursStrategy` in the call log (SC3).
- Push throws: result `{ pushed: false, reason: "push-failed" }` (SC5, #1580).
- Concurrent-writer tree: dirty foreign path present, `paths` names only the
  session's file; assert the `commitPaths` args carry only the declared
  pathspec, so foreign content is neither committed nor reverted (SC11).
- CLI: bare `fit-wiki push` on a current base exits 0; `unverified-base`,
  `rebase-conflict`, and `push-failed` each exit non-zero with their message.

Verification: `bun test libraries/libwiki/test/wiki-sync.test.js
libraries/libwiki/test/cli-sync.integration.test.js
libraries/libutil/test/git-client.test.js` all green; then `bun run check`.

## Risks

- The real-git integration test (`wiki-sync.integration.test.js`) exercises
  actual `ls-remote`/`rev-parse` against a local bare remote; the staleness
  case must move the bare remote's tip without refetching locally to reproduce
  `unverified-base`. If the harness cannot move the remote tip mid-test, assert
  that branch in the mock-based unit test only and note it.
