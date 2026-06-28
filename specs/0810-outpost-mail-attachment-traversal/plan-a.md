# Plan-A — Spec 0810: Outpost Mail Attachment Path-Traversal Hardening

Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

## Approach

Add `sanitiseAttachmentName` as a new pure exported helper in
`sync-helpers.mjs`, revise `copySingleAttachment` to consume `att.name` only
through that sanitiser, feed the dedup branch the sanitised name, and assert
resolved-path containment under `destDir` before the copy. Plumb an optional
`attachmentsDir = ATTACHMENTS_DIR` parameter through the already-exported
`copyThreadAttachments` to its private `copySingleAttachment` callee so the
integration test can inject a temp directory (DI pattern, matching the repo's
preference for injectable seams over module-level state). All four return
paths from `copySingleAttachment` carry the sanitised `name` — observable
contract change for the `copyFileSync`-failure branch only, which today
returns the unsanitised `att.name || "unnamed"`. Two new test files cover the
sanitiser invariants in isolation and the containment post-condition
end-to-end. The rendering call site at `sync.mjs:94` is out of scope per spec.

Libraries used: none (Node built-ins only — `node:path`, `node:fs`, `node:os`,
`node:test`, `node:assert`).

## Steps

### 1. Add `sanitiseAttachmentName` to `sync-helpers.mjs`

Files modified:

- `products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs`

Add a new exported pure function above `copySingleAttachment` (insert after
`fetchAttachments`, before the private `indexAttachmentPath` helper).
Implementation must satisfy every invariant listed in design § Interfaces:
total, closed (no `/`, `\`, or `\x00`–`\x1f`/`\x7f`), single basename under both
POSIX and win32 separator semantics, non-trivial (never `""`, `.`, `..`), and
identity on benign UTF-8.

```js
const FALLBACK_ATTACHMENT_NAME = "unnamed";
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

/**
 * Coerce an arbitrary `attachments.name` value into a single, non-empty
 * basename safe to join under a per-thread destDir. Strips path separators
 * (POSIX and win32), strips ASCII control bytes, then takes the last
 * non-empty/non-dot segment. Returns `"unnamed"` for any input that
 * collapses to empty, `.`, or `..`. Never throws.
 */
export function sanitiseAttachmentName(raw) {
  if (typeof raw !== "string") return FALLBACK_ATTACHMENT_NAME;
  // Strip control bytes first so a name like "\u0000bar" does not survive
  // segment-splitting as two empty leading segments.
  const stripped = raw.replace(CONTROL_CHARS_RE, "");
  // Split on both separators so "..\\..\\..\\foo" segments correctly under
  // POSIX too. Empty input → empty array → fallback.
  const segments = stripped.split(/[\/\\]/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && seg !== "." && seg !== "..") return seg;
  }
  return FALLBACK_ATTACHMENT_NAME;
}
```

Verify:
`node --check products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs`
exits 0; the file's existing `export function` lines are unchanged; the new
export is added once.

### 2. Revise `copySingleAttachment` to use the sanitiser, assert containment, and accept `attachmentsDir`

Files modified:

- `products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs`

Locate `copySingleAttachment` by symbol (it appears once in the file; step 1's
insertion shifts the function downward, so anchor by name not line number).
Extend the `node:path` import:

```diff
-import { basename, join } from "node:path";
+import { basename, join, resolve, sep } from "node:path";
```

Replace the function body with:

```js
function copySingleAttachment(
  att,
  mid,
  threadId,
  attachmentIndex,
  seenFilenames,
  attachmentsDir = ATTACHMENTS_DIR,
) {
  const name = sanitiseAttachmentName(att.name);
  const source = attachmentIndex.get(`${mid}:${att.attachment_id}`);

  if (!source || !existsSync(source)) {
    return { name, available: false, path: null };
  }

  let destName = name;
  if (seenFilenames.has(destName)) destName = `${mid}_${name}`;
  seenFilenames.add(destName);

  const destDir = join(attachmentsDir, String(threadId));
  mkdirSync(destDir, { recursive: true });
  const destPath = join(destDir, destName);

  const resolvedDir = resolve(destDir);
  const resolvedPath = resolve(destPath);
  const dirWithSep = resolvedDir.endsWith(sep)
    ? resolvedDir
    : resolvedDir + sep;
  if (!resolvedPath.startsWith(dirWithSep)) {
    return { name: destName, available: false, path: null };
  }

  try {
    copyFileSync(source, destPath);
    return { name: destName, available: true, path: destPath };
  } catch {
    return { name: destName, available: false, path: null };
  }
}
```

Verify: `node --check` on the modified file passes; `git diff` shows only the
import line, the new `sanitiseAttachmentName` export from step 1, and the
revised `copySingleAttachment` body — no other helpers or exports change.

### 3. Add sanitiser unit tests

Files created:

- `products/outpost/test/sync-helpers-sanitise.test.js`

`node:test` + `node:assert`, matching the repo convention
(`products/outpost/test/scheduler.test.js` line 6-7). One `describe` block per
spec § Success Criteria row 1 and row 3; each input from the spec gets one
`test`. Imports the function via the `.mjs` extension:

```js
import { test, describe } from "node:test";
import assert from "node:assert";
import { sanitiseAttachmentName } from "../templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs";
```

Cases (each is one `test`):

| Input | Expected output | Spec criterion |
|---|---|---|
| `"../../../foo"` | `"foo"` | row 1 traversal |
| `"/etc/passwd"` | `"passwd"` | row 1 absolute-path |
| `"..\\..\\..\\foo"` | `"foo"` | row 1 win32 traversal |
| `"\u0000bar"` | `"bar"` | row 1 control char |
| `"."` | `"unnamed"` | row 1 single dot |
| `".."` | `"unnamed"` | row 1 double dot |
| `""` | `"unnamed"` | row 1 empty |
| `null` | `"unnamed"` | row 1 null |
| `undefined` | `"unnamed"` | total (design invariant) |
| `42` | `"unnamed"` | total (non-string) |
| `"contract.pdf"` | `"contract.pdf"` (byte-identical) | row 3 benign |
| `"Q3 plan.xlsx"` | `"Q3 plan.xlsx"` | row 3 benign whitespace |
| `"image (2).png"` | `"image (2).png"` | row 3 benign parens |
| `"café résumé.pdf"` | `"café résumé.pdf"` | row 3 non-ASCII |

Each assertion uses `assert.strictEqual` so byte-for-byte equality on the
benign UTF-8 row holds. No filesystem touched — pure-function tests only.

Verify: `bun test products/outpost/test/sync-helpers-sanitise.test.js` reports
14 tests passing, 0 failing.

### 4. Plumb `attachmentsDir` through `copyThreadAttachments`

Files modified:

- `products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs`

Add an optional `attachmentsDir = ATTACHMENTS_DIR` parameter to
`copyThreadAttachments` and forward it to `copySingleAttachment`. The single
production caller is `sync.mjs:207` (no other importers).

```diff
 export function copyThreadAttachments(
   threadId,
   messages,
   attachmentsByMsg,
   attachmentIndex,
+  attachmentsDir = ATTACHMENTS_DIR,
 ) {
   const results = {};
   const seenFilenames = new Set();

   for (const msg of messages) {
     const mid = msg.message_id;
     const msgAttachments = attachmentsByMsg[mid] ?? [];
     if (msgAttachments.length === 0) continue;

     results[mid] = msgAttachments.map((att) =>
-      copySingleAttachment(att, mid, threadId, attachmentIndex, seenFilenames),
+      copySingleAttachment(
+        att,
+        mid,
+        threadId,
+        attachmentIndex,
+        seenFilenames,
+        attachmentsDir,
+      ),
     );
   }
   return results;
 }
```

`copySingleAttachment` stays private — no `export` keyword added. Public
surface unchanged: `sanitiseAttachmentName` (new from step 1) and
`copyThreadAttachments` (existing, now with one optional parameter). The
existing JSDoc on `copyThreadAttachments` (line 306 today: `/** Copy all
attachments for a thread's messages into the cache directory, deduplicating
filenames. */`) remains correct — extend it with one sentence noting the
optional `attachmentsDir` injection point for tests:

```diff
-/** Copy all attachments for a thread's messages into the cache directory, deduplicating filenames. */
+/** Copy all attachments for a thread's messages into the cache directory, deduplicating filenames. `attachmentsDir` defaults to the module-level `ATTACHMENTS_DIR`; tests inject a temp directory. */
```

Verify: `bun run jsdoc` exits 0; `node --check` on the modified file passes;
`rg "copyThreadAttachments\(" products/outpost/templates` lists the single
call at `sync.mjs:207` unchanged.

### 5. Add `copyThreadAttachments` containment integration test

Files created:

- `products/outpost/test/sync-helpers-copy.test.js`

Tests inject a temp `attachmentsDir` per step 4's parameter — no `HOME`
override, no dynamic import. (Bun's `os.homedir()` ignores `process.env.HOME`
and reads `getpwuid` directly, so an env-override approach would not work
under `bun test`; DI is the clean isolation channel.)

All harness state, helpers, and tests live inside one `describe` block so the
helpers close over the temp paths set up in `before()`:

```js
import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep, resolve } from "node:path";
import { copyThreadAttachments } from "../templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs";

describe("copyThreadAttachments containment", () => {
  const MID = 42;
  const THREAD_ID = "999";
  let tmpRoot;        // mkdtemp root, removed in after()
  let attachmentsDir; // <tmpRoot>/attachments
  let sourcePath;     // <tmpRoot>/source.bin (real file the index points at)
  let attachmentIndex;

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "outpost-copy-"));
    attachmentsDir = join(tmpRoot, "attachments");
    sourcePath = join(tmpRoot, "source.bin");
    writeFileSync(sourcePath, "payload");
    attachmentIndex = new Map([[`${MID}:att1`, sourcePath]]);
  });

  after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function listFiles(dir) {
    const out = [];
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const p = join(current, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile()) out.push(p);
      }
    }
    return out;
  }

  function runOne(att) {
    const messages = [{ message_id: MID }];
    const attachmentsByMsg = { [MID]: [att] };
    const results = copyThreadAttachments(
      THREAD_ID,
      messages,
      attachmentsByMsg,
      attachmentIndex,
      attachmentsDir,
    );
    return results[MID][0];
  }

  function assertNoEscape() {
    const threadDir = resolve(join(attachmentsDir, THREAD_ID)) + sep;
    for (const p of listFiles(tmpRoot)) {
      if (p === sourcePath) continue;
      assert.ok(
        resolve(p).startsWith(threadDir),
        `file escaped containment: ${p}`,
      );
    }
  }

  function assertContained(result, expectedName) {
    const threadDir = resolve(join(attachmentsDir, THREAD_ID)) + sep;
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.name, expectedName);
    assert.ok(resolve(result.path).startsWith(threadDir));
    assert.ok(result.path.endsWith(sep + expectedName));
  }

  test("benign name copies inside thread dir", () => {
    const r = runOne({ name: "report.pdf", attachment_id: "att1" });
    assertContained(r, "report.pdf");
    assertNoEscape();
  });

  test("traversal payload reduces to safe basename", () => {
    const r = runOne({ name: "../../../escape.txt", attachment_id: "att1" });
    assertContained(r, "escape.txt");
    assertNoEscape();
  });

  test("absolute path payload reduces to safe basename", () => {
    const r = runOne({ name: "/etc/passwd", attachment_id: "att1" });
    assertContained(r, "passwd");
    assertNoEscape();
  });

  test("null name falls back to 'unnamed'", () => {
    const r = runOne({ name: null, attachment_id: "att1" });
    assertContained(r, "unnamed");
    assertNoEscape();
  });

  test("missing source returns available:false", () => {
    const r = runOne({ name: "foo.pdf", attachment_id: "missing" });
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.path, null);
    assertNoEscape();
  });
});
```

`assertNoEscape` walks the temp tree after every test and asserts that every
file is either the seed `source.bin` or lives under
`<attachmentsDir>/<THREAD_ID>/`.

Verify: `bun test products/outpost/test/sync-helpers-copy.test.js` reports
5 tests passing, 0 failing. After the run, `tmpRoot` is removed; the user's
real Outpost cache is never touched (the `attachmentsDir` argument never
defaults to `ATTACHMENTS_DIR` in this test file).

### 6. Run repository quality gates

Files modified: none directly (`format:fix` may rewrite touched files).

```sh
bun run format:fix    # writes formatter changes; root package.json runs `biome format --write .`
bun run check         # = format && lint && jsdoc && harness && context
bun test products/outpost/test/sync-helpers-sanitise.test.js \
        products/outpost/test/sync-helpers-copy.test.js
```

All exit 0. `format:fix` is required (not `format`) per the kata-plan
DO-CONFIRM — the read-only `format` command flags drift but does not write,
which would push unformatted code. After `format:fix`, re-run the two test
files to confirm they still pass.

## Risks

| Risk | Mitigation |
|---|---|
| Layer 2 (containment check) is verified by inspection only. The recursive `assertNoEscape` walk catches **joint** regression (both layers fail and a write lands outside the thread dir), but a single-layer regression where Layer 1 returns e.g. `"../foo"` and Layer 2 still rejects it produces `available: false` and no out-of-tree write — the walk passes vacuously. | The Layer 2 code is small (eight lines: resolve, separator-boundary prefix, startsWith) and reviewable in one read. Injecting a regressed sanitiser to drive Layer 2 in isolation would require module-stub infrastructure not present in the repo, and the spec's success criteria (row 2) accept either branch of the disjunction. |
| Bun's `os.homedir()` does not honour `process.env.HOME` (verified: `bun -e 'process.env.HOME="/x"; console.log(require("os").homedir())'` prints the real home). A future contributor unfamiliar with this divergence may propose env-override isolation. | DI through `attachmentsDir` is documented in the Approach paragraph and step 5 — the only correct isolation channel under `bun test`. |

## Execution

Single agent: **`staff-engineer`**. The plan is one logical unit (one helper
file + two test files) with no parallelism worth coordinating. Sequence:

1. Step 1 — add `sanitiseAttachmentName` export.
2. Step 2 — revise `copySingleAttachment` body and add `attachmentsDir` param
   (depends on step 1).
3. Step 3 — sanitiser unit tests (depends on step 1's export, independent of
   step 2).
4. Step 4 — plumb `attachmentsDir` through `copyThreadAttachments` (depends on
   step 2).
5. Step 5 — copy integration tests via `copyThreadAttachments` (depends on
   step 4).
6. Step 6 — quality gates (depends on all of the above).

Open the implementation PR as
`impl(0810): outpost mail attachment path-traversal hardening` once steps 1-5
land in the working tree and step 6 passes locally.
