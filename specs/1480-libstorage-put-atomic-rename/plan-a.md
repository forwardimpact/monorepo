# Plan 1480 — libstorage put: write-tmp + atomic rename

References: [spec.md](./spec.md), [design-a.md](./design-a.md).

## Approach

`LocalStorage.put` becomes a three-step sequence (`mkdir`, `writeFile(tmpPath)`,
`rename(tmpPath, targetPath)`) over the existing `fs` collaborator, with
best-effort `unlink(tmpPath)` cleanup on either step's failure. A nonce
source is added as a constructor default (sourced from libsecret's
`generateUUID`, mockable via the third constructor argument) so each `put`
gets a collision-free same-directory tmp sibling without forcing every
existing call site to thread a nonce. `#traverse` gains one literal-prefix
filter so a process-killed tmp survivor is invisible to `list`,
`findByPrefix`, and `findByExtension`. Four contract surfaces and the
`Runtime.fs` typedef update in lockstep so the documented guarantee
matches the runtime.

Libraries used: libsecret (`generateUUID`).

## Tmp sentinel shape

| Concern | Choice |
|---|---|
| Sentinel infix | `.libstorage-tmp.` — declared in libstorage README as a reserved infix; consumers must not produce keys containing this literal. |
| Per-call tmp name | `${targetBasename}.libstorage-tmp.${nonce()}` placed in `dirname(target)`. |
| Sentinel match (used by `#traverse`) | `TMP_SENTINEL = /\.libstorage-tmp\./` — substring presence is sufficient; the reserved-infix rule means false positives are not a concern. |
| Production nonce | `() => generateUUID()` from `@forwardimpact/libsecret`, applied as the constructor default. |

Substring matching (not anchored / not keyed to UUID shape) lets test stubs
return any string — the listing filter still recognises the tmp by infix.

Design Decision 2 names the runtime collaborator bag as the canonical seam
"e.g. libsecret's UUID surface." `Runtime.fs` is the only runtime field
`LocalStorage` consumes today, and adding a `secret`/`nonce` runtime field
just for this constructor would force every `_createXxxStorage` factory to
re-thread it through. The constructor-arg seam keeps libsecret as the named
production source (matching the design's "e.g."), keeps the mockable seam
the design requires, and avoids the runtime-typedef explosion.

## Step 1 — Add the nonce seam and the `rename` runtime surface

Created: none. Modified:
`libraries/libstorage/src/local.js`,
`libraries/libutil/src/runtime.js`.
Deleted: none.

- In `local.js`: add `import { generateUUID } from "@forwardimpact/libsecret";`,
  declare `#nonce;` alongside the existing `#prefix` and `#fs` fields, and
  change the constructor to
  `constructor(prefix, fs, nonce = () => generateUUID()) { this.#prefix = prefix; this.#fs = fs; this.#nonce = nonce; }`.
  The default keeps every existing two-arg call site working without edit; tests
  may pass a deterministic stub as the third argument.
- In `runtime.js`: in the `Runtime.fs` `@property` prose method list
  (currently lines 20–27, comma-separated names ending `…, symlink, utimes,
  chmod, plus the two stream factories …`), insert `rename` after `unlink`
  so the documented async-fs surface catches up with the new dependency.
  No code change — typedef only. The
  default `createDefaultRuntime` already exposes `node:fs/promises.rename`
  by reference (the fs surface is constructed as `nodeFs`), and
  `createMockFs` already provides a `rename` spy
  (`libraries/libmock/src/mock/fs.js:46`), so the documented surface catches
  up without runtime change.

Verification: `bun test libraries/libstorage/` and `bun test libraries/libutil/`
pass with no edits to either suite's existing assertions; transitive
call sites compile unchanged because the third constructor argument defaults.

## Step 2 — Refactor `LocalStorage.put` to write-tmp + rename

Created: none. Modified:
`libraries/libstorage/src/local.js`,
`libraries/libstorage/test/libstorage-local.test.js`.
Deleted: none.

Replace the body of `put(key, data)` with:

```js
async put(key, data) {
  const fullPath = this.path(key);
  const dirToCreate = dirname(fullPath);
  const tmpPath = `${fullPath}.libstorage-tmp.${this.#nonce()}`;
  const serializedData = this.#serialize(key, data);

  await this.#fs.mkdir(dirToCreate, { recursive: true });
  try {
    await this.#fs.writeFile(tmpPath, serializedData);
  } catch (error) {
    await this.#unlinkBestEffort(tmpPath);
    throw error;
  }
  try {
    await this.#fs.rename(tmpPath, fullPath);
  } catch (error) {
    await this.#unlinkBestEffort(tmpPath);
    throw error;
  }
}
```

New private methods on the same class:

```js
#serialize(key, data) {
  if (isJsonLines(key, data)) return toJsonLines(data);
  if (isJson(key, data)) return toJson(data);
  return data;
}

async #unlinkBestEffort(path) {
  try { await this.#fs.unlink(path); } catch { /* swallow */ }
}
```

Test-file edits owned by this Step (the put suite must stay green between
Step 2 and Step 4 so the step is independently verifiable):

- `libraries/libstorage/test/libstorage-local.test.js` `beforeEach`
  (lines 11–34) — add `rename: spy(() => Promise.resolve())` to `mockFs`,
  declare `let nonceSeq = 0; const nonce = () => \`stub-${++nonceSeq}\`;`,
  and change the constructor call at line 33 to
  `localStorage = new LocalStorage("/test/base", mockFs, nonce);`.
- Existing happy-path put case at lines 36–45 — change the assertion from
  `writeFile.calls[0].arguments` equal
  `["/test/base/subdir/file.txt", "content"]` to equal
  `["/test/base/subdir/file.txt.libstorage-tmp.stub-1", "content"]`, and add an
  assertion that `rename.calls[0].arguments` equals
  `["/test/base/subdir/file.txt.libstorage-tmp.stub-1", "/test/base/subdir/file.txt"]`.
- Existing absolute-path put case (currently at lines 144–151) — apply the
  same shape change to its `writeFile`/`rename` assertions.

Verification: `bun test libraries/libstorage/test/libstorage-local.test.js`
is green after these edits; the file's other suites are untouched. Step 4
expands the put suite with the new atomicity cases.

## Step 3 — Filter tmp survivors in `#traverse`

Created: none. Modified: `libraries/libstorage/src/local.js`. Deleted: none.

Add a module-private constant near the existing `EPOCH` declaration:

```js
const TMP_SENTINEL = /\.libstorage-tmp\./;
```

and one guard inside the `entry.isFile()` branch of `processEntry`
(currently at lines 260–264), placed **before** the caller-supplied
`fileFilter`:

```js
} else if (
  entry.isFile() &&
  !TMP_SENTINEL.test(entry.name) &&
  (!fileFilter || fileFilter(relativeKey))
) {
```

The guard runs ahead of `fileFilter` so consumer filters never have to
know about the sentinel. `exists(key)` is unchanged; it already targets
the canonical path, never the tmp.

Verification: Step 4 covers `list`/`findByPrefix`/`findByExtension` against
fixtures containing tmp survivors.

## Step 4 — Tests: spy-level shape + real-fs integration

Created: `libraries/libstorage/test/libstorage-local-put.test.js`.
Modified: none.
Deleted: none.

The new put-atomicity cases land in their own file (pre-committed split per
`.claude/rules/test-file-shape.md` § Test-file shape — the existing
`libstorage-local.test.js` after Step 2's edits sits around 345 LOC and
adding ~70 LOC here would push it over 400; the new file's behaviour family
is "put atomicity," cleanly separable from the existing CRUD/listing
families). The new file imports `LocalStorage` from `../src/index.js`,
declares its own `beforeEach` (same `mockFs` + nonce shape Step 2 wires)
and contains the spy-level cases below, then a final `describe("put
atomicity — real fs", …)` block that uses `node:fs/promises` against an
`os.tmpdir()`-rooted directory created in `beforeEach` and removed in
`afterEach`.

### Spy-level cases (`describe("put atomicity — spy fs", …)`)

| Case | Shape | Assertion |
|---|---|---|
| Happy path writes tmp then renames | Both `writeFile` and `rename` resolve. | `writeFile.calls[0].arguments` equals `["/test/base/subdir/file.txt.libstorage-tmp.stub-1", "content"]`; `rename.calls[0].arguments` equals `["/test/base/subdir/file.txt.libstorage-tmp.stub-1", "/test/base/subdir/file.txt"]`; each called once. |
| `writeFile` failure unlinks tmp and rejects | Per-case re-stub: `mockFs.writeFile = spy(() => Promise.reject(errA))`. | `put` rejects with `errA`; `unlink` called once with the tmp path; `rename` not called. |
| `rename` failure unlinks tmp and rejects | Per-case re-stub: `mockFs.rename = spy(() => Promise.reject(errB))`. | `put` rejects with `errB`; `unlink` called once with the tmp path. |
| Cleanup error is swallowed | Per-case re-stub: both `writeFile` and `unlink` reject (`errA`, `errB`). | `put` rejects with `errA` (not `errB`). |
| `list` skips tmp survivors | `readdir` returns `["real.json", "real.json.libstorage-tmp.deadbeef"]` as files. | `list()` returns `["real.json"]` only. |
| `findByPrefix` skips tmp survivors | Same readdir shape, query prefix `"real"`. | `findByPrefix("real")` returns `["real.json"]`. |
| `findByExtension` skips tmp survivors | Tmp-suffixed sibling shares the canonical's extension. | Only the canonical file appears. |
| Concurrent `put` on same key uses unique tmps | Two `put(key, …)` calls; nonce stub yields two ids; `Promise.all` awaited together. | Two distinct tmp paths recorded in the two `writeFile` calls; two `rename` calls onto the same target; both `put`s resolve. |

### Real-fs integration cases (`describe("put atomicity — real fs", …)`)

These cases satisfy spec § Success Criteria where the spy-level cases only
validate call shape. Each case uses `node:fs/promises` against an
`os.tmpdir()` sandbox.

| Case | Shape | Assertion |
|---|---|---|
| Crash-window analogue: orphan tmp survivor is invisible to listings | `put(key, "A")`; manually `fsp.writeFile(<key>.libstorage-tmp.orphan, "garbage")`; then `list()` / `findByPrefix("")` / `findByExtension(".json")`. | Listings return only `[key]`. The orphan file remains on disk (operator-owned reclamation per spec § Out of scope) but never surfaces through the API. |
| Failed `put` leaves target byte-equal to prior content | Construct `LocalStorage` with a wrapper `fs` that throws on `rename` after the underlying `writeFile` has succeeded; call `put(key, "A")` then `put(key, "B")` (the second `put` rejects). | `get(key)` returns `"A"` byte-equal; `list()` returns `[key]` only (the failed-put tmp does not appear). |
| `compact()`-shape round-trip survives a tmp survivor | Build a `LocalStorage` over real fs; `put(indexKey, [{id:1}])`; manually drop a `.libstorage-tmp.x` sibling; call `put(indexKey, [{id:1},{id:2}])`; then `get(indexKey)`. | `get` returns the new two-element array byte-equal to the second serialization; `list()` returns `[indexKey]` only. |

Verification: `bun test libraries/libstorage/test/libstorage-local-put.test.js`
passes every case; `bun test libraries/libstorage/` stays green.

The unit-test rationale for not driving an OS-level mid-`put` kill: the
spec invariant ("interrupted `put` leaves target at prior or new content")
is met by construction when (a) `writeFile` targets only the tmp path,
(b) `rename` is called only after `writeFile` resolves, and (c) the target
is never directly written. The spy-level cases verify (a)–(c). POSIX
`rename(2)` is a kernel guarantee outside this library's responsibility;
the spec excludes `fsync` for the same reason. The real-fs cases above
exercise the observable shape (target byte-content, listing visibility)
end-to-end without forking child processes.

## Step 5 — Update the four documented contract surfaces

Created: none. Modified:
`libraries/libindex/src/base.js`,
`libraries/libstorage/src/index.js`,
`libraries/libstorage/README.md`,
`services/bridge/index.js`.
Deleted: none.

| Surface (anchored by symbol, not line) | Edit |
|---|---|
| `libraries/libindex/src/base.js` — `compact()` JSDoc (the block beginning `Replaces the persisted index file …`) | Drop the "atomic file-replace" hand-wave; rewrite the tail to: "`storage.put` is a write-tmp + atomic rename (spec 1480) — a restart during `compact()` observes either the prior or post-compact index, never a half-written file." |
| `libraries/libstorage/src/index.js` — `StorageInterface.put` JSDoc (the line beginning `* @property {function(string, string\|Buffer\|object): Promise<void>} put`) | Extend the inline description to: "Store data with the given key. On the local backend this is a same-target atomic file-replace (write-tmp + rename) — a process termination at any point during the call leaves the target at either its prior content or the new content, never an intermediate prefix. The `S3Storage` and `SupabaseStorage` backends inherit the same shape from their service `PutObject` semantics. See spec 1480." |
| `libraries/libstorage/README.md` | Append a `## Atomicity` section (~10 lines): one paragraph stating the invariant, a `Reserved infix: \`.libstorage-tmp.\`` callout, a bullet list of what is and is not covered (no fsync; cross-process last-writer-wins preserved; orphan-tmp disk reclamation operator-owned), and a link to spec 1480. |
| `services/bridge/index.js` — the compaction-safety comment immediately above `await this.#pendingDispatches.compact();` inside `ResolvePendingDispatch` | Replace with: "`compact()` writes the new index via `storage.put`, which is a write-tmp + atomic rename inside `libstorage` (spec 1480). A process kill mid-compact leaves the index at either its prior or new state. Concurrent-writer correctness for a multi-instance future remains out of scope — bridge runs single-instance per tenant." |
| `services/bridge/index.js` — the second `compact()` call site at the periodic sweep (currently right after `if (evicted_pending > 0)`) | Add a one-line comment above the call: "Same atomic-rename guarantee as `ResolvePendingDispatch`; see spec 1480." The original comment's "the sweep also calls compact() under the same invariant" line is replaced by this site-local note so the sweep keeps its documented rationale. |

Verification: per-surface —
`rg -nU 'atomic file-replace' libraries/libindex/src/base.js` returns zero hits
(libindex JSDoc stale phrase gone);
`rg -nU 'tmp-file \+\s+atomic rename inside libstorage' services/bridge/index.js`
returns zero hits (bridge deferred-workaround comment gone);
`rg -nc 'spec 1480' libraries/libindex/src/base.js libraries/libstorage/src/index.js libraries/libstorage/README.md services/bridge/index.js`
returns `base.js:1`, `index.js:1`, `README.md:1`, `services/bridge/index.js:2`
(the bridge has both the `ResolvePendingDispatch` reference and the sweep
reference).

## Step 6 — Run quality end-to-end

Created: none. Modified: none. Deleted: none.

Verification: `bun run check && bun run test` from the monorepo root
passes. `check` covers format (biome), lint (biome unsafe-fix surfaces),
jsdoc (libjsdoc), invariants (the workspace-import, libmock, temporal,
collaborator-construction scripts), context (markdown ceilings), and
wiki audit. `test` is the monorepo's `bun test` collector. Adjacent
integration suites that construct `LocalStorage` directly with two
arguments (`libraries/libindex/test/base-compact.integration.test.js:27`,
`services/bridge/test/pending-compact.integration.test.js:56`,
`products/map/test/pipeline.integration.test.js:98,129`) compile
unchanged because the constructor's third argument defaults — `bun run
test` exercises the new `rename` path through them end-to-end.

## Risks

| Risk | What an implementer cannot see from the plan above |
|---|---|
| Cross-filesystem rename | The spec assumes tmp + target share a directory. If a future caller passes an absolute path resolving across a mount boundary, `rename` returns `EXDEV` and `put` rejects. That matches the spec's "absolute-path callers inherit today's constraint" carve-out — no plan change needed, but the implementer must not catch `EXDEV` and silently fall back to copy+unlink (that would re-introduce the partial-write window). No call site in the current monorepo crosses a mount boundary; this is future-proofing, not a present hazard. |
| Pre-existing spy mocks elsewhere in the tree | Only the libstorage-local test file builds an `fs` object out of fresh spies (everywhere else `createMockFs()` or real `fs/promises` is used — both already expose `rename`). Step 2 covers the libstorage-local fixture; no other spy-style mock surfaces a `LocalStorage.put` call path. |
| `tests/check-libmock-rules.test.js:64` literal | The file carries a literal source string `new LocalStorage("/tmp/x")` as input to a libmock-rule check. The string is fixture data, not executed code — leave it as-is. The libmock rule parses arity-and-shape, not constructor compatibility, and the string remains a valid example of the two-arg form because the third argument defaults. |

## Execution recommendation

Single sequential run by `staff-engineer` (kata-implement). The runtime
edits (Steps 1–4) and doc-surface + typedef edits (Step 5 + Step 1's
typedef update) ship in one PR per design decision 7. Steps 1–3 are
tightly coupled (constructor seam + put body + filter all touch
`local.js`); Step 4 closes the verification loop; Step 5 is the
contract-matches-runtime success criterion and must land in the same
change. No parallelisation gain available.

— Staff Engineer 🛠️
