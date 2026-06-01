# Plan 0640 Part 02 — libprompt and libtemplate loader migration

Migrate the two loader test files the spec names by surface — both
already accept an injected `runtime` parameter on the production class
(reading from `runtime.fsSync`) but their tests still build real
tmpdirs through `mkdtempSync`. Verifies spec § Success Criterion 3 for
the two named files.

## Runtime field the loaders read

`libraries/libprompt/src/loader.js:21` and
`libraries/libtemplate/src/loader.js` both read from `runtime.fsSync`
(the synchronous fs surface), not `runtime.fs`. `createTestRuntime`
from libmock defaults `fsSync` to `fs` if only one is given
(`libraries/libmock/src/runtime.js:23`), so passing
`createTestRuntime({ fs: createMockFs(...) })` produces a runtime whose
`fsSync` is the same `createMockFs` instance — the loaders see the
mock. The migration uses this idiom consistently to keep test code one
field shorter; tests that need to assert against the sync surface
directly may pass `fsSync: createMockFs(...)` explicitly.

## Step 1 — Declare libmock in libprompt and libtemplate

Modified: `libraries/libprompt/package.json`,
`libraries/libtemplate/package.json`.

Neither manifest has a `devDependencies` block today (both list only
`dependencies` carrying `@forwardimpact/libutil` and `mustache`). Add
a new top-level `devDependencies` block alongside `dependencies`
declaring `"@forwardimpact/libmock": "^0.1.0"`. The version range
matches the existing devDependency declarations in libraries that
consume libmock (`libraries/libgraph/package.json`,
`libraries/librepl/package.json`). Without this declaration the
imports added in Steps 2 and 3 fail
`bun run invariants:check-workspace-imports`.

Verification: `bun run invariants:check-workspace-imports` exits zero
on the branch HEAD; `bun install` reports no warnings on either library.

## Step 2 — Migrate libprompt loader test

Modified: `libraries/libprompt/test/loader.test.js`.

Drop these from the file's imports and call sites:

- `import { mkdtempSync, writeFileSync, rmSync } from "node:fs"`
- `import { join } from "node:path"` (only if no remaining `join`
  consumers in the file)
- `import { tmpdir } from "node:os"`
- `import { createDefaultRuntime } from "@forwardimpact/libutil/runtime"`
- Every `mkdtempSync(...)` / `writeFileSync(...)` / `rmSync(...)` call
- Every `createDefaultRuntime()` call site in `new PromptLoader(promptDir, …)`
  and `createPromptLoader(promptDir, …)` — replace with the per-test
  `runtime` built from `createTestRuntime({ fs: createMockFs(…) })`.

Replace each `tempDir` reference with a deterministic in-memory path
(`/prompts`) and construct a `createMockFs`-backed runtime per test:

```js
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { PromptLoader, createPromptLoader } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

describe("PromptLoader", () => {
  let runtime;
  const promptDir = "/prompts";

  beforeEach(() => {
    runtime = createTestRuntime({
      fs: createMockFs({
        [`${promptDir}/example.prompt.md`]: "Hello {{name}}",
      }),
    });
  });
  // existing test bodies use `new PromptLoader(promptDir, runtime)` —
  // this is the existing constructor signature, no API change.
});
```

The runner imports stay as `node:test` because the suite's other test
files still mix `node:test` and `bun test` patterns; the canonical
choice is settled by future cleanup, not this migration. `spy()` is not
needed for this file — the loader has no callbacks to spy on.

Per-test data: tests that need a specific prompt file present override
the per-test `runtime` by calling
`runtime = createTestRuntime({ fs: createMockFs({ ... }) })` at the top
of that test or in a sub-`beforeEach`. The "throws when prompt file
does not exist" case starts with an empty `createMockFs({})`. The
factory case at line 144 (`libprompt-factory-`) uses
`createPromptLoader(promptDir, runtime)` with the same idiom.

The loader's file-not-found assertions use the deterministic path
`/prompts/example.prompt.md` (libprompt's documented suffix per
`PromptLoader.load`), so assertion text changes only where the assertion
previously embedded a tmpdir-shaped path; those become the deterministic
`/prompts/…` shape.

Verification: `bun test libraries/libprompt` reports the same `pass`
count as before; `rg -l "mkdtemp|tmpdir" libraries/libprompt/test`
returns no matches.

## Step 3 — Migrate libtemplate loader test

Modified: `libraries/libtemplate/test/loader.test.js`.

Same import / call-site removals as Step 2 (`mkdtempSync` /
`mkdirSync` / `writeFileSync` / `rmSync` / `tmpdir` / `createDefaultRuntime`). `libraries/libtemplate/test/loader.test.js` has
six `mkdtempSync` call sites on `main` at plan time (lines 14, 67, 81,
133, 166, 222 — `libtemplate-test-` ×1, `libtemplate-data-` ×4,
`libtemplate-factory-` ×1; the implementer re-greps at implementation
time to confirm). Each becomes a deterministic path under `/defaults` or
`/data` with a `createMockFs` map. The existing tests use `.html`
templates (`page.html`, `static.html`, `greeting.html`); the mock fs
map keys preserve those filenames. The nested-directory case at line 67
keys the mock with `/data/sub/foo.html` rather than calling
`mkdirSync`. The factory case at line 222 mirrors Step 2's factory case.

Verification: `bun test libraries/libtemplate` reports the same `pass`
count as before; `rg -l "mkdtemp|tmpdir" libraries/libtemplate/test`
returns no matches.

## Step 4 — Run guard chain

`bun run check` against the two changed files:

- `bun test libraries/libprompt libraries/libtemplate` reports `0 fail`.
- `bun run invariants:check-workspace-imports` exits zero (the new
  devDependencies from Step 1 cover the new imports).
- `bun run invariants:check-libmock` exits zero (the migration
  introduces no new inline shapes).

## Verification — spec § Success Criteria covered

| # | Criterion | This part |
|---|---|---|
| 3 | The two named loader files do no real I/O for pure-logic assertions | Steps 2–3 |
| 6 | Full suite green | Step 4 |

— Staff Engineer 🛠️
