# Plan 1920 — Wiki sync merge discipline for shared singletons

Executes [design-a.md](design-a.md) for [spec 1920](spec.md).

## Approach

Build the path-scoped git primitives first, then the registry, then the
`commitAndPush` re-apply path, then wire the claim/release closures, then docs.
Each step verifies in isolation before the next depends on it. The re-apply path
intercepts the rebase-conflict branch ahead of the existing `mergeOursStrategy`
fallback and only for registered ops carrying a `reapply` closure; the
no-intent path is byte-unchanged (1780's floor to remove later). Criteria 1–5
bind on this implementation; criteria 6–8 are joint with 1780 and not activated
here (the no-intent path keeps the fallback).

Libraries used: libwiki (wiki-sync, commands/claim, active-claims, constants),
libutil (git-client), libmock (mock/git-client).

## Step 1 — Path-scoped git primitives

Add HEAD-only and path-scoped reset primitives the re-apply path needs.

- Modified: `libraries/libutil/src/git-client.js`

```js
/** Move HEAD to `ref` without touching the index or working tree. */
async resetSoft(ref, { cwd } = {}) {
  return this.#runRaw(["reset", "--soft", ref], { cwd });
}

/** Reset only `paths` to their content at `ref` (working tree + index).
 * `allowMissing` tolerates a path absent on `ref` (a founding write). */
async checkoutPaths(ref, paths, { cwd, allowMissing = false } = {}) {
  return this.#runRaw(["checkout", ref, "--", ...paths], {
    cwd,
    allowFailure: allowMissing,
  });
}
```

`#runRaw`'s existing `allowFailure` returns the result instead of throwing, so a
missing path yields a non-zero result the caller ignores (the file simply stays
absent and the row op creates the section).

Verify: `libutil` test — `resetSoft` spawns `reset --soft <ref>`;
`checkoutPaths` spawns `checkout <ref> -- <paths>`; with `allowMissing` a
non-zero result does not throw.

## Step 2 — Mock git client: new methods and per-call sequencing

- Modified: `libraries/libmock/src/mock/git-client.js`

Two changes:

1. Add `"resetSoft"` and `"checkoutPaths"` to `GIT_METHODS` so the spies exist.
2. Let a `responses[method]` value be an **array** consumed one entry per call
   (falling back to the last entry when exhausted), so a test can express "push
   rejected on call 1, succeeds on call 2". Today the closure returns the single
   static `responses[method]` every call; wrap it: if the configured value is an
   array, shift/peek per invocation. Scalars keep current behavior. A rejected
   push is expressed as a response whose `exitCode !== 0` **or** a sentinel the
   mock throws as a `GitError` — match how `GitClient.push` surfaces rejection
   (it throws via `#runRaw`), so the mock entry for a rejected push throws.

Verify: `libmock` test (or inline in `wiki-sync.test.js`) — an array `responses`
yields successive values across calls; a throw-sentinel entry rejects one call.

## Step 3 — Singleton registry

- Modified: `libraries/libwiki/src/constants.js`

```js
// Surfaces governed by spec 1920's sync-merge discipline: a contended landing
// is resolved by re-running the row operation against the fresh remote tip, not
// textually. Founding member: MEMORY.md (Active Claims). STATUS.md / metrics
// CSVs are future members (each its own approval).
export const SINGLETON_PATHS = new Set([MEMORY_FILE]);
```

Verify: imported by `wiki-sync.js` in Step 4; no standalone test.

## Step 4 — Re-apply path in `commitAndPush`

Intercept the rebase-conflict branch for registered ops; conserve the tree.

- Modified: `libraries/libwiki/src/wiki-sync.js`

Add `WikiSyncConflict extends Error` (sibling of `WikiPullConflict`), carrying
`paths` and a `reason`. Change the signature to
`commitAndPush(message, paths, { reapply, maxReapply = 3 } = {})`.

Replace the rebase-conflict block (currently `rebaseAbort` →
`mergeOursStrategy`) with:

```
if (rebase.exitCode !== 0) {
  await this.#git.rebaseAbort({ cwd });
  const registered =
    reapply && paths?.length &&
    paths.every((p) => SINGLETON_PATHS.has(p));
  if (registered) {
    return this.#reapplyLoop(message, paths, reapply, maxReapply);
  }
  // No recorded intent (or unregistered path): keep today's fallback.
  await this.#git.mergeOursStrategy({ cwd, ref: "origin/master", autostash: true });
}
```

`#reapplyLoop` returns its own outcome (it owns its push) and does not fall
through to the existing fire-and-forget push at the end of `commitAndPush`; that
swallowing push stays only on the non-conflict and no-intent paths.

`#reapplyLoop(message, paths, reapply, maxReapply)` — `rebaseAbort` has already
run at the call site, so the loop body is, for up to `maxReapply` rounds:

1. `fetch()` — refresh `origin/master` (the freshness source).
2. `resetSoft("origin/master")` — HEAD to tip, working tree untouched (foreign
   residue survives; the stale local commit is dropped).
3. `checkoutPaths("origin/master", paths, { allowMissing: true })` — reset only
   the registered file(s) to the tip.
4. `freshText` = read the file via `runtime.fsSync` at `path.join(wikiDir, paths[0])`,
   empty string if absent (founding claim).
5. `newText = reapply(freshText)`. If `null`, the op is already satisfied —
   HEAD equals the tip, nothing ahead — return
   `{ pushed: false, reason: "already-satisfied" }`.
6. Write `newText`; `commitPaths(message, paths)` — a fresh commit on the tip.
7. Push through a result-aware call using the same auth the fire-and-forget
   path uses — `const client = this.#authed(); try { await
   client.push("origin", "master", { cwd }) } catch (GitError) { … }` — so the
   re-apply push is authenticated and a rejection is distinguishable from an
   auth failure. On success return `{ pushed: true, reason: "reapplied" }`. On a
   rejected-push `GitError`, if a round remains loop to step 1; if the bound is
   exhausted, `throw new WikiSyncConflict(paths, "reapply-bound")`.

The loop re-derives a single registered path (`paths[0]`), matching the design's
single-file assumption (claim/release commit exactly `["MEMORY.md"]`). The Step
4 guard admits any `paths ⊆ SINGLETON_PATHS`; keep them aligned by asserting
`paths.length === 1` on the registered branch (a multi-path registered set is a
future spec's concern, not this one's).

Push-rejection — not rebase re-conflict — is the loop signal, because two
parallel tail appends rebase cleanly and the loser is caught only at push. The
early `#hasCommitsAhead` gate runs only once before the loop; the loop never
re-runs it.

Verify: `libwiki` `wiki-sync.test.js` (the mock must support per-call sequences
— see Step 2) —
- a registered op whose push is rejected once then succeeds re-applies and lands
  (asserts `resetSoft`/`checkoutPaths`/`commitPaths` in `calls`, never
  `mergeOursStrategy`); (criteria 1, 2, 5)
- a `reapply` returning null yields `{pushed:false, reason:"already-satisfied"}`
  and no `commitPaths`; (criterion 3 no-op arm)
- a no-`reapply` conflict still calls `mergeOursStrategy` (no-intent floor
  unchanged);
- bound exhaustion (push rejected every round) throws `WikiSyncConflict`.

## Step 5 — Wire the claim/release re-apply closures

- Modified: `libraries/libwiki/src/commands/claim.js`

`pushWiki(wikiSync, runtime, message)` gains a fourth `reapply` parameter,
forwarded as `commitAndPush(message, ["MEMORY.md"], { reapply })`. **All three
current call sites must pass it** (today they call `pushWiki(wikiSync, runtime,
message)` with no closure): `runClaimCommand` (claim.js:74), the `--expired`
branch (claim.js:100), and the `--target` branch (claim.js:127). Each builds the
closure from the same row op it just ran:

| Command | Closure `(fresh) =>` |
|---|---|
| claim | `const r = appendClaim(fresh, claim); return r.inserted ? r.text : null` |
| release `--target` | `const r = removeClaim(fresh, {agent, target}); return r.removed ? r.text : null` |
| release `--expired` | re-derive `filterExpired(parseClaims(fresh), today)`, fold `removeClaim` over each still-expired row tracking an `anyRemoved` flag; return the folded text if `anyRemoved`, else `null` |

The closure closes over the parsed `claim` / `agent` / `target` / `today`, never
the pre-conflict text. The `--expired` fold's `anyRemoved` is the aggregate of
each `removeClaim`'s `{removed}` — the loop's null-contract needs the aggregate,
not a per-row flag. The existing `cli-claim.test.js` stubs `commitAndPush(message,
paths)` and asserts `push.paths`; the new third `{ reapply }` argument is
non-breaking for it (the stub ignores extra args) — confirm it still passes, no
edit needed.

Verify: `libwiki` `cli-claim.integration.test.js` against a real bare origin (the
closure path is end-to-end) — a claim whose push hits a stale-base conflict
lands its row alongside a sibling's claim already on the tip (criterion 1); a
release racing a foreign claim lands both outcomes (criterion 2); idempotence
and freshness arms (criterion 3): re-apply add onto a tip already carrying the
row → no duplicate; re-apply after own release → row absent; expired-release
onto a tip carrying a renewal → renewal intact.

## Step 6 — Storm regression fixture and textual-resolution guard

- Modified: `libraries/libwiki/test/wiki-sync.integration.test.js` (real git via
  `createBareRepo`/`cloneRepo` — the mock cannot model a true origin tip; the
  call-sequence assertions stay in `wiki-sync.test.js` per Steps 4–5)

Against a real bare origin, encode the Problem-table class-1 geometry: clone
twice, land a sibling's claim row on the tip from clone A, then run a stale-base
claim from clone B whose rebase/push contends on the Active Claims tail. Assert
the bare repo's tip MEMORY.md holds **both** rows and no sibling field reverted
(criterion 4), and that the resolution is the re-applied row set — never a
side-biased or union text (criterion 5). The real origin is what makes
criterion 5's "the tip shows the re-applied row set or no landing" a genuine
end-to-end assertion rather than a call-sequence proxy.

Verify: the integration assertions above pass; the unit-level guard (Step 4) is
the absence of `mergeOursStrategy` plus presence of `commitPaths` in `calls`.

## Step 7 — Contract documentation

- Modified: `libraries/libwiki/src/wiki-sync.js` JSDoc on `commitAndPush`

State the discipline (operation re-apply on the registered-op path), name
`SINGLETON_PATHS`'s founding member, and the boundary with 1780's fail-loud
floor; reference spec 1920 (criterion 9).

Verify: review-only; the JSDoc names the registry and the re-apply/fail-loud
boundary.

## Risks

- **Push-rejection is the loop signal, not rebase re-conflict.** The re-apply
  loop's push must surface the `GitError` a rejected push throws (its own
  result-aware call), not the fire-and-forget swallow `commitAndPush` keeps for
  the other paths. Looping on rebase conflict alone misses the clean-rebase /
  stale-push table-tail race (criterion 1).
- **`resetSoft` keeps the loop from re-running the ahead gate.** The early
  `#hasCommitsAhead` clean-gate must not be re-run per round, or a successful
  re-derivation leaving one row reads as nothing-to-push. The loop re-enters at
  fetch/resetSoft/checkout, never the gate.
- **Mock parity and sequencing must land in Step 2.** `wiki-sync.test.js`
  asserts `resetSoft`/`checkoutPaths` calls and needs a push that rejects-then-
  succeeds across calls; both the new spies and the per-call sequence support
  must exist or the tests throw on an undefined spy or a static response.
- **`--expired` aggregate-removed flag.** The fold over `removeClaim` must track
  whether *any* row was removed to honor the null-contract; a per-row `{removed}`
  alone does not tell the closure whether to return text or null.

## Execution

Single engineering agent, sequential: Step 1→2 land together (primitive +
mock), then 3 (registry), then 4 (the re-apply path, the core), then 5 (wiring),
then 6 (regression fixtures), then 7 (docs). Step 7 (docs) may route to
`technical-writer` but is one JSDoc block; keeping it in sequence is simpler.

— Staff Engineer 🛠️
