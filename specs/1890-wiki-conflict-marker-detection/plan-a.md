# Plan 1890 — Wiki conflict-marker detection and publish guards

Executes [design-a](design-a.md) for [spec 1890](spec.md).

## Approach

Build the pure detector first, then layer the audit rule and the sync guards on
top of it. The detector is a standalone module so both the audit `conflict-scan`
scope and the `commitAndPush` pre-push guard call one implementation; new
GitClient primitives (`unmergedPaths`, `isMidMerge`, `mergeAbort`,
`introducedByFile`) carry the sync guards. Steps are ordered so each layer's
tests pass before the next depends on it.

Libraries used: libwiki (conflict-markers, audit/rules, audit/scopes,
wiki-sync, index), libutil (git-client — modified), libmock
(mock/git-client — extend).

## Step 1 — Pure detector module

Intent: line-anchored structural scanner shared by both layers.

- Created: `libraries/libwiki/src/conflict-markers.js`
- Modified: `libraries/libwiki/src/index.js` (export `scanConflictMarkers`)

```js
// scanConflictMarkers(text, { fenceExempt = true }) -> [{ lineNo, kind }]
// kind ∈ "open" | "separator" | "close"
const OPEN = /^<{7}( |$)/;   // admits "<<<<<<< Updated upstream"
const CLOSE = /^>{7}( |$)/;  // admits ">>>>>>> Stashed changes" / ">>>>>>> <sha>"
const SEP = /^={7}\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
// walk lines (1-indexed): a FENCE line toggles insideFence and is never a marker.
// when fenceExempt && insideFence → skip emits.
// OPEN → emit open, openDepth++.  CLOSE → emit close, openDepth>0 && openDepth--.
// SEP && openDepth>0 → emit separator (block-conditioned only).
```

Verify: `bun test libraries/libwiki/test/conflict-markers.test.js` (created in
step 5).

## Step 2 — Audit scope `conflict-scan`

Intent: yield one normalized subject per audited file, tagging `fenceExempt`.

- Modified: `libraries/libwiki/src/audit/scopes.js`

Add a `conflict-scan` resolver to `SCOPE_RESOLVERS` returning, for every
classified summary / weekly-log-main / weekly-log-part subject, the storyboard,
MEMORY.md, and STATUS.md: `{ path, text, fenceExempt }`. Derive `text` from
`fileLines.join("\n")` for per-file subjects that carry only `fileLines`; use
`.text` directly for MEMORY/STATUS. `fenceExempt` is `true` for every surface
except STATUS.md, which is `false`. Reuse `ctx.subjects`, `ctx.memory`,
`ctx.status`, `ctx.storyboard` already built by `buildContext` — no new file
reads.

Verify: covered by step 5 engine tests (criteria 1–4, 6).

## Step 3 — Audit rule `conflict.markers`

Intent: fail-severity rule over `conflict-scan` with adjudicate-not-trim hint.

- Created: `libraries/libwiki/src/audit/conflict-markers-rule.js`
- Modified: `libraries/libwiki/src/audit/rules.js` (import + append
  `CONFLICT_MARKER_RULE` after `STATUS_ROW_RULES`)
- Modified: `libraries/libwiki/test/audit-rules.test.js` (append
  `conflict.markers` to the locked catalogue snapshot order)

```js
{
  id: "conflict.markers",
  scope: "conflict-scan",
  severity: "fail",
  check: (s) => {
    const hits = scanConflictMarkers(s.text, { fenceExempt: s.fenceExempt });
    return hits.length === 0 ? null : hits.map((h) => ({ lineNo: h.lineNo, kind: h.kind }));
  },
  message: (_s, r) => `unresolved git conflict marker (${r.kind})`,
  hint: "adjudicate the merged form: reconcile the two variants into the intended content, then delete the markers — do not trim history",
}
```

Verify: `bun test libraries/libwiki/test/audit-rules.test.js` (catalogue +
well-formed).

## Step 4 — GitClient primitives

Intent: shallow-decidable merge-state detection, abort, and per-file introduced
text.

- Modified: `libraries/libutil/src/git-client.js` (four new methods PLUS a new
  `allowFailure` param on the existing `mergeOursStrategy`, threaded to
  `#runRaw`)
- Modified: `libraries/libmock/src/mock/git-client.js` (add all four names —
  `unmergedPaths`, `isMidMerge`, `mergeAbort`, `introducedByFile` — to
  `GIT_METHODS`)

| Method | Implementation |
| ------ | -------------- |
| `unmergedPaths({cwd})` | `git status --porcelain`; return paths whose 2-char XY code is any U-family code (`UU`/`AA`/`DD`/`AU`/`UA`/`DU`/`UD`). |
| `isMidMerge({cwd})` | `true` when `unmergedPaths` non-empty OR `git rev-parse -q --verify MERGE_HEAD` exits 0 (`allowFailure`). Returns a boolean. |
| `mergeAbort({cwd})` | `git merge --abort` (`allowFailure: true`). |
| `introducedByFile(range, {cwd})` | `git diff --no-color <range>`; track the current path from each `+++ b/<path>` header, then for every body line beginning with a single `+` (and NOT `+++`), **strip that leading `+`** and append the remainder to that path's added text. Return `Map<path, addedText>` where `addedText` has NO `+` prefix (so the detector's column-1 anchors match). Throw `GitError` on non-zero exit (no `allowFailure`) so the guard refuses on an unresolvable ref. |
| `mergeOursStrategy({cwd, ref, autostash, allowFailure})` | add `allowFailure` (default `false`, preserving current throw-on-conflict); thread to `#runRaw` so the caller can capture a non-zero `exitCode` instead of a throw. |

Mock note: the default spy returns `{stdout:"",stderr:"",exitCode:0}` for any
method without a configured `responses` entry. That default is **truthy** (so
`isMidMerge` reads as mid-merge) and **non-iterable as a Map** (so the
`introducedByFile` `for…of` throws). Therefore every test exercising
`commitAndPush` MUST seed `responses.isMidMerge = false` and
`responses.introducedByFile = new Map()` unless the test intends the refusal —
this includes the existing snapshots updated in step 7.

Also add a unit test in `libraries/libutil/test/git-client.test.js` feeding a
synthetic `git diff` (mock subprocess `responses`) with a `+++ b/file.md` header
and `+<<<<<<<` / `+content` body lines, asserting `introducedByFile` returns
`Map { "file.md" => "<<<<<<<\ncontent" }` (header skipped, `+` stripped).

Verify: `bun test libraries/libutil/test/git-client.test.js` and
`bun test libraries/libmock/test/runtime-completeness.test.js`.

## Step 5 — Layer 1 fixtures

Intent: pin every criterion 1–6 fixture in the audit engine test.

- Modified: `libraries/libwiki/test/audit-engine.test.js`
- Created: `libraries/libwiki/test/conflict-markers.test.js` (unit tests for the
  pure detector)

Fixtures (each asserts `conflict.markers` fires / does not fire):

- **C1 branch-merge block** in a summary: fires (open + separator + close).
- **C1 stash-pop labels** (`<<<<<<< Updated upstream`,
  `>>>>>>> Stashed changes`): fires.
- **C1 split block across two sealed parts**: part-27 file with the open marker
  only → fires on that file (kind `open`); part-28 file with separator + close
  only → fires on that file via the **close** marker (kind `close`) — the
  separator does NOT emit there because no open anchored above it (block-
  conditioned), so the close is the load-bearing finding. Assert exactly one
  finding on **each** file, kinds `open` and `close` respectively. Reproduces
  `7c281c59`.
- **C2 quoted-rider** (prose surface, fenced code block quoting both label forms
  incl. a column-1 wrapped `` `>>>>>>> <sha>` `` and an in-span `=======`): does
  not fire. Anchored by content shape, not filename.
- **C2 straight-quote mid-line prose** (markers mid-line, no code span): does
  not fire.
- **C3 setext underline** (`=======` under a heading, no open above): does not
  fire.
- **C4 STATUS.md conflict block** inside the fenced row table
  (`fenceExempt:false`): fires.
- **C5**: assert the finding hint matches `/adjudicate/` and does NOT match
  `/trim/`.
- **C6 event-2 peak**: a weekly-log file over the word budget AND containing a
  conflict block → both `weekly-log.word-budget` and `conflict.markers` fire.

Detector unit tests in `conflict-markers.test.js` cover: lone separator (no
emit), open-without-close (open emit), fence suppression toggle,
`fenceExempt:false` fires inside a fence, and longer `=`/`<`/`>` runs do not
match.

Verify:
`bun test libraries/libwiki/test/audit-engine.test.js libraries/libwiki/test/conflict-markers.test.js`.

## Step 6 — Sync guards in `commitAndPush`

Intent: mid-merge refusal, failure-allowed+abort fallback, pre-push no-marker
check.

- Modified: `libraries/libwiki/src/wiki-sync.js`

1. Add `WikiSyncRefusal extends Error` with `reason` and optional `workAt`;
   export it. `commitAndPush` returns `{ pushed:false, reason, workAt? }` for
   refusals — do not throw, so callers reading the result keep working. The four
   refusal reasons (`mid-merge`, `stranded-merge`, `would-publish-markers`,
   `introduced-scan-failed`) are **additive** to the two existing results
   (`{pushed:false,reason:"clean"}`, `{pushed:true,reason:"pushed"}`), which
   stay exactly as today (criterion 10).
2. **Mid-merge refusal** at the very top of `commitAndPush`, before `isClean`:
   if `await this.#git.isMidMerge({cwd})` → return
   `{ pushed:false, reason:"mid-merge" }`. This probe runs first on every flow,
   including the clean no-op path.
3. **Fallback abort**: change the `mergeOursStrategy` call site to pass
   `allowFailure:true` and capture the result; on non-zero exit run
   `mergeAbort({cwd})`, then return
   `{ pushed:false, reason:"stranded-merge", workAt:"stash" }`.
   (`mergeOursStrategy` gains the `allowFailure` param in step 4.)
4. **Pre-push no-marker check** — runs after the existing `fetch()` and after
   the rebase/merge-fallback resolves, on the post-merge HEAD, before `push`, so
   the diff is against the freshly-fetched `origin/master` tip (criterion 11).
   It runs on **every** push path, including the merge-fallback branch
   (dual-lineage, criterion 9):
   `const byFile = await this.#git.introducedByFile("origin/master..HEAD", {cwd})`;
   for each `[path, added]`,
   `scanConflictMarkers(added, { fenceExempt: isProseMarkdown(path) })` where
   `isProseMarkdown(path)` is `path.endsWith(".md") && path !== "STATUS.md"` —
   STATUS.md is data, never fence-exempt even on the push path (criterion 4 /
   design "STATUS.md fence false"); non-`.md` files (CSV) are also non-exempt.
   If any file fires → return `{ pushed:false, reason:"would-publish-markers" }`
   (commits stay local, no push). A thrown `GitError` from `introducedByFile` is
   caught and returns `{ pushed:false, reason:"introduced-scan-failed" }` —
   never a silent pass.

Verify: `bun test libraries/libwiki/test/wiki-sync.test.js`.

## Step 7 — Layer 2 fixtures (criteria 7–11)

Intent: pin the sync-guard behaviour and the shallow-clone constraint.

- Modified: `libraries/libwiki/test/wiki-sync.test.js`

**Existing-snapshot updates (do these first, in this step).** The `isMidMerge`
probe lands before `status` and `introducedByFile` lands before `push`, so every
existing exact-`methods()` assertion shifts. Update each, and add
`isMidMerge:false` + `introducedByFile: new Map()` to each test's `responses`:

- dirty-ahead happy path (commits/rebases/pushes): prepend `isMidMerge`, insert
  `introducedByFile` before `push`.
- paths-scoped commit test and its autostash assertion.
- merge-ours recovery test (rebase conflict → mergeOursStrategy → push).
- the two clean no-op tests (clean tree nothing-ahead; foreign-only-dirty):
  these gain a leading `isMidMerge` call; their early `clean` return means no
  `introducedByFile`.

New fixtures:

- **C7**: `isMidMerge → true` ⇒ result `reason:"mid-merge"`, and `methods()`
  shows no `commitAll`/`commitPaths`/`push`.
- **C8**: rebase conflict → `mergeOursStrategy` exitCode 1 ⇒ `mergeAbort`
  called, result `reason:"stranded-merge"`, `workAt:"stash"`, no `push`.
- **C9 introduced markers**: `introducedByFile` returns a map with a
  marker-bearing added side ⇒ `reason:"would-publish-markers"`, no `push`,
  commits preserved.
- **C9 dual-lineage**: two separate `commitAndPush` invocations, each with its
  own marker-bearing `introducedByFile`, each refused independently (stateless
  per push).
- **C9 unrelated-writer**: `introducedByFile` returns a clean added side (origin
  already corrupt is not in the added side) ⇒ push proceeds.
- **C10 happy path**: clean ahead tree (`isMidMerge:false`), `introducedByFile`
  returns a marker-free Map ⇒ method sequence is today's plus a leading
  `isMidMerge` and an `introducedByFile` before `push`; result
  `{pushed:true,reason:"pushed"}` unchanged.
- **C11 shallow**: `introducedByFile` succeeding against `origin/master..HEAD`
  without any deepen call (assert no clone/deepen method invoked); and an
  `introducedByFile` that throws `GitError` ⇒ `reason:"introduced-scan-failed"`,
  never `pushed:true`.

Verify: `bun test libraries/libwiki/`.

## Risks

- **Mock truthy/non-Map defaults.** The libmock default spy returns a truthy,
  non-iterable object, which silently flips `isMidMerge` to mid-merge and makes
  `introducedByFile` un-iterable. Every `commitAndPush` test (new and the
  existing ones updated in step 7) must explicitly seed `isMidMerge:false` and
  `introducedByFile: new Map()`, or the suite breaks in non-obvious ways. Step 4
  states this; the risk is forgetting it on one of the existing tests.
- **`introducedByFile` `+`-strip ordering.** The parser must skip `+++`/`---`
  header lines AND strip the leading `+` from body added lines before the text
  reaches the detector — if either is wrong, the guard either self-detects a
  marker in a `+++ b/<path>` header or (worse) never matches `+<<<<<<<` and
  silently passes every marker, defeating criterion 9. Covered by step 4's spec
  and a dedicated `introducedByFile` unit test on a synthetic diff.

## Execution

Single engineering agent, steps in order (each step's tests gate the next).
Steps 1–5 are Layer 1 (audit); steps 4,6,7 are Layer 2 (sync). Step 4 is shared
and must precede both step 6 and the Layer 2 fixtures.

— Staff Engineer 🛠️
