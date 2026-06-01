# Plan 0640 Part 01 — libmock fixtures and inline-shape collapse

Add the three named fixtures to `@forwardimpact/libmock`, add a shape
detector to `scripts/check-libmock-rules.mjs` for each, document each in
`libraries/libmock/README.md`, and collapse every named inline consumer
onto the new fixture. Verifies spec §§ Success Criteria 1 and 2.

## Step 1 — Add `createGraphIndexFixture` to libmock

Created: `libraries/libmock/src/mock/graph-index.js`.
Modified: `libraries/libmock/src/mock/index.js` (re-export),
`libraries/libmock/test/libmock.test.js` (one new case asserting the
factory returns `{ n3Store, graphIndex, mockStorage }` with each slot
populated when `GraphIndex` and `Store` are injected).

```js
// libraries/libmock/src/mock/graph-index.js
import { createMockStorage } from "./storage.js";

/**
 * Bundle of n3 Store + GraphIndex + MockStorage for libgraph tests.
 * Constructors are injected so libmock keeps zero domain dependencies.
 *
 * @param {object} opts
 * @param {Function} opts.GraphIndex - libgraph's GraphIndex class.
 * @param {Function} opts.Store - n3 Store class.
 * @param {object} [opts.storageOverrides] - Passed to createMockStorage.
 * @param {string} [opts.indexKey] - Index file name (default "test-graph.jsonl").
 * @param {object} [opts.prefixes] - Optional RDF prefix map.
 * @returns {{ n3Store, graphIndex, mockStorage }}
 */
export function createGraphIndexFixture({
  GraphIndex,
  Store,
  storageOverrides,
  indexKey = "test-graph.jsonl",
  prefixes = {},
}) {
  if (!GraphIndex) throw new Error("GraphIndex is required");
  if (!Store) throw new Error("Store is required");
  const mockStorage = createMockStorage(storageOverrides);
  const n3Store = new Store();
  const graphIndex = new GraphIndex(mockStorage, n3Store, prefixes, indexKey);
  return { n3Store, graphIndex, mockStorage };
}
```

Verification: `bun test libraries/libmock/test/libmock.test.js` passes
with the new case green; `bun test libraries/libmock` passes; the
fixture's source file contains no `import` of `libgraph` or `n3`
(reviewer-visible on the PR diff).

## Step 2 — Add `createMockGrpcHealthDefinition` to libmock

Created: `libraries/libmock/src/mock/health-definition.js`.
Modified: `libraries/libmock/src/mock/index.js` (re-export),
`libraries/libmock/test/libmock.test.js` (one new case asserting
`createMockGrpcHealthDefinition().Check` carries the canonical
`path` / `requestStream` / `responseStream` triple).

```js
// libraries/libmock/src/mock/health-definition.js
/**
 * Returns the stripped gRPC health service definition shape that callers
 * of `healthDefinition.Check.path` faked inline. This is *not* librpc's
 * real `healthDefinition` — librpc's own tests exercise the real
 * definition directly and must continue to do so.
 *
 * @returns {{ Check: { path: string, requestStream: boolean, responseStream: boolean } }}
 */
export function createMockGrpcHealthDefinition() {
  return {
    Check: {
      path: "/grpc.health.v1.Health/Check",
      requestStream: false,
      responseStream: false,
    },
  };
}
```

Verification: `bun test libraries/libmock/test/libmock.test.js` passes
with the new case green.

## Step 3 — Add `createReplEnvironment` to libmock

Created: `libraries/libmock/src/mock/repl-environment.js`.
Modified: `libraries/libmock/src/mock/index.js` (re-export),
`libraries/libmock/test/libmock.test.js` (one new case asserting the
environment exposes `readline.createInterface`, `process.argv`,
`os.userInfo`, a `formatter` factory, and a `storage` slot; and that
calling `process.exit(7)` sets `_exitCalled === true` and
`_exitCode === 7` without terminating).

The bundle mirrors the inline shape in
`libraries/librepl/test/librepl.test.js`: a `readline` whose
`createInterface()` returns a no-op interface, a `process` with `argv`,
async-iterable `stdin`, write-only `stdout`/`stderr`, and an `exit` that
records `_exitCalled` / `_exitCode` without terminating, a `formatter`
factory returning `{ format }`, an `os` exposing `userInfo()`, and a
fresh `createMockStorage()` for the `storage` slot.

```js
// libraries/libmock/src/mock/repl-environment.js
import { createMockStorage } from "./storage.js";

/**
 * Bundle of readline / process / formatter / os / storage fakes for
 * librepl tests. Returns mutable handles so a test can inspect exit
 * state and override slots before construction.
 *
 * @param {object} [opts]
 * @param {object} [opts.storageOverrides]
 * @param {AsyncIterable<string>|null} [opts.stdin] - Override stdin async iterator.
 * @returns {{ readline, process, os, formatter, storage }}
 */
export function createReplEnvironment({ storageOverrides, stdin } = {}) {
  const rlInterface = { on: () => {}, prompt: () => {}, close: () => {} };
  const readline = { createInterface: () => rlInterface };
  const proc = {
    argv: ["node", "script.js"],
    stdin: stdin ?? {
      isTTY: true,
      setEncoding: () => {},
      async *[Symbol.asyncIterator]() {
        yield "test input";
      },
    },
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    exit: (code) => {
      proc._exitCalled = true;
      proc._exitCode = code;
    },
    _exitCalled: false,
    _exitCode: null,
  };
  const formatter = () => ({ format: (text) => `formatted: ${text}` });
  const os = { userInfo: () => ({ uid: 1000 }) };
  const storage = createMockStorage(storageOverrides);
  return { readline, process: proc, os, formatter, storage };
}
```

Verification: `bun test libraries/libmock/test/libmock.test.js` passes
with the new case green.

## Step 4 — Add shape detectors to `check-libmock-rules.mjs`

Modified: `scripts/check-libmock-rules.mjs`,
`tests/check-libmock-rules.test.js`.

Extend the `RULES` array and the rule-engine's `ctx` with a per-fixture
import detector so a rule can be suppressed by importing the specific
fixture the rule covers (not just any libmock surface). Concretely, the
new `ctx` shape and the rule wiring are:

```js
// scripts/check-libmock-rules.mjs — top of file
const LIBMOCK_IMPORT_RE = /from\s+["']@forwardimpact\/libmock["']/;

// Matches an ES import like:
//   import { …, createGraphIndexFixture, … } from "@forwardimpact/libmock";
// (multi-line tolerant; matches a named-binding occurrence inside an
// import …from "@forwardimpact/libmock" statement)
function importsLibmockName(text, name) {
  const re = new RegExp(
    `import\\s*\\{[^}]*?\\b${name}\\b[^}]*?\\}\\s*from\\s*["']@forwardimpact/libmock["']`,
    "s",
  );
  return re.test(text);
}

// …existing RULES array unchanged…

// New rules use ctx.has(fixtureName); the ctx is built in libmockFindings:
//   const ctx = {
//     imports: LIBMOCK_IMPORT_RE.test(text),
//     has: (name) => importsLibmockName(text, name),
//   };
```

Append three rules. Each rule's `test` callback consults
`ctx.has("<fixtureName>")` for suppression (not `ctx.imports`):

Append three rules:

| Rule | Detector (in `test(t, c)`) | Suppressed when | Message |
|---|---|---|---|
| graph-index triple | `/new\s+GraphIndex\s*\(/.test(t) && /new\s+Store\s*\(/.test(t) && !c.has("createGraphIndexFixture")` | `c.has("createGraphIndexFixture")` is true | `inline { n3Store, graphIndex, mockStorage } — use createGraphIndexFixture` |
| grpc health definition shape | `/Check\s*:\s*\{[\s\S]{0,160}?path\s*:\s*["']\/grpc\.health\.v1\.Health\/Check["']/.test(t) && !c.has("createMockGrpcHealthDefinition")` | `c.has("createMockGrpcHealthDefinition")` is true | `inline grpc healthDefinition.Check — use createMockGrpcHealthDefinition` |
| repl environment bundle | `/_exitCalled/.test(t) && /createInterface\s*:/.test(t) && /userInfo\s*:/.test(t) && !c.has("createReplEnvironment")` | `c.has("createReplEnvironment")` is true | `inline readline+process+formatter+os bundle — use createReplEnvironment` |

The grpc rule matches only the literal *definition* shape `Check: { …
path: "/grpc…" … }`, which is what consumers fake inline. It does not
match assertion comparisons like `check.path === "/grpc…"`, so librpc's
own real-definition tests stay clean without a path-allow-list.

Per [design Decision 3], each rule is a shape detector. The per-fixture
import suppression keeps the new rules from over-firing on files that
use other libmock surfaces (the existing `!c.imports` clause is too
broad — a libgraph test importing `createMockStorage` would otherwise
suppress an unrelated graph-index inline shape). libmock's own source
files are out of scope: `check-libmock.mjs` already skips files
starting with `./libraries/libmock/` (line 27).

Files that legitimately need a bare `new GraphIndex(null, ...)` for
constructor-validation tests (the error-path block in
`libraries/libgraph/test/libgraph-query.test.js`; the "throws when
storage missing" cases in `index-loading.test.js`) keep doing so as
long as the file also imports `createGraphIndexFixture` for its
mainline `beforeEach` — the post-Step-5 state of every libgraph test
file in scope satisfies this condition.

Each rule lands a corresponding corpus case in
`tests/check-libmock-rules.test.js`: one minimal inline shape asserting
the message fires when the matching fixture is absent, and one with the
fixture import asserting the message stays silent.

Verification: `bun test tests/check-libmock-rules.test.js` passes;
`bun run invariants:check-libmock` exits zero on `main` (the rules
become tripwires the moment Steps 5–7 leave any inline shape behind).

## Step 5 — Collapse the libgraph inline triples

Modified: `libraries/libgraph/test/index-items.test.js`,
`libraries/libgraph/test/index-loading.test.js`,
`libraries/libgraph/test/libgraph-filters.test.js`,
`libraries/libgraph/test/libgraph-query.test.js`,
`libraries/libgraph/test/prefixes.test.js`.

Each file's `beforeEach` block that constructs `mockStorage`, `n3Store`,
and `graphIndex` is replaced by a call to the fixture. The
`indexKey` argument carries the literal value the original
file used (each file is different — `libgraph-query.test.js` uses
`"test.jsonl"`, `index-items.test.js` uses `"test-graph.jsonl"`, the
others use values the implementer reads from each file). The implementer
does not normalise these keys to a single value — that would change
the assertions that touch the index filename.

Pattern:

```js
import { Store } from "n3";
import { createGraphIndexFixture } from "@forwardimpact/libmock";
import { GraphIndex } from "../src/index/graph.js";

// inside beforeEach:
({ n3Store, graphIndex, mockStorage } = createGraphIndexFixture({
  GraphIndex,
  Store,
  indexKey: "<value-from-original-file>",
  // prefixes: <value-from-original-file>, // only if file passes one
}));
```

Where a test constructs a bare `new GraphIndex(null, ...)` or
`new GraphIndex(storage, null, ...)` for constructor argument-validation
(the error-path block in `libgraph-query.test.js`; the "throws when
storage missing" cases in `index-loading.test.js`), those lines stay
as-is — the rule from Step 4 is suppressed because the file also
imports `createGraphIndexFixture` for its mainline `beforeEach`. No
assertion text changes.

`libraries/libgraph/package.json` already declares
`@forwardimpact/libmock` in `devDependencies` so no manifest change is
required.

Verification: `bun test libraries/libgraph` passes with no test
disabled; `bun run invariants:check-libmock` exits zero.

## Step 6 — Collapse the guide status inline definition

Modified: `products/guide/test/status.test.js`,
`products/guide/package.json` (add `@forwardimpact/libmock` to
`devDependencies` if not already present — check
`scripts/check-workspace-imports.mjs` would fail otherwise).

Delete the local `createMockHealthDefinition()` function. Add
`import { createMockGrpcHealthDefinition } from "@forwardimpact/libmock"`,
then rename every call site from `createMockHealthDefinition()` to
`createMockGrpcHealthDefinition()` (the canonical name is the spec's SC1
target; preserving the old alias undercuts adoption).

Verification: `bun test products/guide/test/status.test.js` passes;
`bun run invariants:check-workspace-imports` exits zero.

## Step 7 — Collapse the librepl inline environment

Modified: `libraries/librepl/test/librepl.test.js`.
`libraries/librepl/package.json` already declares
`@forwardimpact/libmock` in `devDependencies`.

Replace the per-`beforeEach` block that builds `mockReadline`,
`mockProcess`, `mockFormatter`, `mockOs`, `mockStorage` with one call:

```js
import { createReplEnvironment } from "@forwardimpact/libmock";

beforeEach(() => {
  ({ readline: mockReadline, process: mockProcess, os: mockOs,
     formatter: mockFormatter, storage: mockStorage } =
    createReplEnvironment());
});
```

Tests that override `stdin` or `storage` pass the override through
`createReplEnvironment({ stdin })` / `createReplEnvironment({ storageOverrides })`.

Verification: `bun test libraries/librepl` passes.

## Step 8 — Document the three fixtures in libmock README

Modified: `libraries/libmock/README.md`.

Add three rows to the existing Collaborators table or, if they do not
fit the Collaborators framing (they bundle multiple surfaces rather
than fake one surface), open a new `### Shared fixtures` subsection
beneath Collaborators with a one-line table:

| Fixture | Returns | Example |
|---|---|---|
| `createGraphIndexFixture` | `{ n3Store, graphIndex, mockStorage }` | `const { graphIndex } = createGraphIndexFixture({ GraphIndex, Store });` |
| `createMockGrpcHealthDefinition` | mock gRPC health service definition | `const def = createMockGrpcHealthDefinition();` |
| `createReplEnvironment` | `{ readline, process, os, formatter, storage }` | `const env = createReplEnvironment();` |

Update the `## Usage` import example to include the three names.
Verification: `bun run invariants` passes (no markdown lint issue).

## Step 9 — Run the full guard chain

`bun run check` is the final gate. Specifically:

- `bun run invariants:check-libmock` exits zero (no inline shape
  remains in scope after Steps 5–7).
- `bun test libraries/libmock libraries/libgraph libraries/librepl products/guide` reports `0 fail`.
- `bun test` whole-suite reports `0 fail` (no consumer broken by the
  rename in Step 6).

## Verification — spec § Success Criteria covered

| # | Criterion | This part |
|---|---|---|
| 1 | Three fixtures exist, exported, documented | Steps 1–3 + Step 8 |
| 2 | Inline consumers import the fixtures; `check-libmock` flags reintroduction | Steps 4–7 |
| 6 | Full suite green | Step 9 |

— Staff Engineer 🛠️
