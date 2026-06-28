# Plan 0640-a Part 01 — libmock fixtures, lint rules, consumer collapse

Implements spec § A and design Components/Decisions 1–3, 8. Independently
executable; no dependency on other parts.

Libraries used: libmock (new fixtures), libgraph (`GraphIndex`, n3 `Store` —
injected by consumers, not imported into libmock).

## Step 1 — Add the three fixtures to libmock

Add the three additive exports following the injected-collaborator pattern
(Decision 1): graph constructors arrive as parameters; libmock gains no
dependency.

- Created: `libraries/libmock/src/mock/environments.js`
- Modified: `libraries/libmock/src/mock/index.js` (export the three)

`src/index.js` already does `export * from "./mock/index.js"`, so the three
resolve from the package root transitively — no top-level `src/index.js` edit is
needed, and SC1's "exported from `src/index.js`" is satisfied.

```js
// environments.js
/**
 * Graph-index test triple: a mock storage, an n3 Store, and a GraphIndex wired
 * to both. GraphIndex and Store are injected so libmock stays dependency-free.
 * @param {object} opts
 * @param {Function} opts.GraphIndex - libgraph GraphIndex constructor.
 * @param {Function} opts.Store - n3 Store constructor.
 * @param {object} [opts.storageOverrides] - passed to createMockStorage.
 * @param {*} [opts.prefixes] - prefixes arg for GraphIndex (default {}).
 * @param {string} [opts.indexKey="test-graph.jsonl"] - jsonl key.
 * @returns {{ n3Store: object, graphIndex: object, mockStorage: object }}
 */
export function createGraphIndexFixture({
  GraphIndex,
  Store,
  storageOverrides,
  prefixes = {},
  indexKey = "test-graph.jsonl",
}) {
  const mockStorage = createMockStorage(storageOverrides);
  const n3Store = new Store();
  const graphIndex = new GraphIndex(mockStorage, n3Store, prefixes, indexKey);
  return { n3Store, graphIndex, mockStorage };
}

/**
 * The stripped gRPC health service definition guide's status check fakes — the
 * { Check: { path, requestStream, responseStream } } shape, not librpc's real
 * healthDefinition.
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

/**
 * The readline/process/os/formatter/storage bundle librepl's tests inject.
 * Reproduces libraries/librepl/test/librepl.test.js:13-58 exactly.
 * @returns {{ readline, process, os, formatter, storage }}
 */
export function createReplEnvironment() {
  const process = {
    argv: ["node", "script.js"],
    stdin: {
      isTTY: true,
      setEncoding: () => {},
      async *[Symbol.asyncIterator]() {
        yield "test input";
      },
    },
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    exit: (code) => {
      process._exitCalled = true;
      process._exitCode = code;
    },
    _exitCalled: false,
    _exitCode: null,
  };
  return {
    readline: { createInterface: () => ({ on: () => {}, prompt: () => {}, close: () => {} }) },
    process,
    os: { userInfo: () => ({ uid: 1000 }) },
    formatter: () => ({ format: (text) => `formatted: ${text}` }),
    storage: createMockStorage(),
  };
}
```

Import `createMockStorage` from `./storage.js`.

Verify: `bun test libraries/libmock`.

## Step 2 — Document the fixtures in the README

Add one row per fixture to the Collaborators section with a one-line example.

- Modified: `libraries/libmock/README.md`

| Surface | Factory | Example |
| --- | --- | --- |
| graph-index | `createGraphIndexFixture` | `const { graphIndex } = createGraphIndexFixture({ GraphIndex, Store });` |
| grpc health def | `createMockGrpcHealthDefinition` | `const def = createMockGrpcHealthDefinition();` |
| repl env | `createReplEnvironment` | `const { readline, process } = createReplEnvironment();` |

Verify: README lists all three under § Collaborators.

## Step 3 — Add inline-shape lint rules

Add one shape detector per fixture to the rules array, flagging the inline
triple/definition/bundle in a file that does not import the new fixture
(Decision 3 — shape match, not name match).

- Modified: `scripts/check-libmock-rules.mjs`
- Modified: `tests/check-libmock-rules.test.js`

```js
// new RULES entries
{
  // inline mock triple: createMockStorage + new GraphIndex co-occurring
  // without the fixture import. Keyed on createMockStorage (the *mock* triple),
  // NOT a bare `new GraphIndex` — products/map/test/pipeline.test.js builds a
  // *real* GraphIndex over LocalStorage (integration) and must not trip.
  test: (t) =>
    /createMockStorage\s*\(/.test(t) &&
    /new\s+GraphIndex\s*\(/.test(t) &&
    !t.includes("createGraphIndexFixture"),
  message: "inline GraphIndex mock triple — use createGraphIndexFixture",
},
{
  // inline mock object literal `{ Check: { path: "…", requestStream: … } }`.
  // Keyed on the requestStream/responseStream literal keys inside a Check
  // object, NOT the bare path string — librpc/health.test.js asserts on the
  // real definition's `check.path` (no `Check: {` mock literal) and must not
  // trip this rule.
  test: (t) =>
    /Check\s*:\s*\{[\s\S]{0,160}?requestStream\s*:[\s\S]{0,80}?responseStream\s*:/.test(
      t,
    ) && !t.includes("createMockGrpcHealthDefinition"),
  message:
    "inline gRPC health definition — use createMockGrpcHealthDefinition",
},
{
  // inline readline.createInterface bundle paired with a mock process exit flag
  test: (t) =>
    /createInterface\s*:/.test(t) &&
    /_exitCalled/.test(t) &&
    !t.includes("createReplEnvironment"),
  message: "inline repl environment bundle — use createReplEnvironment",
},
```

Add a `has(...)` assertion per rule to `check-libmock-rules.test.js` (positive
detection + a negative when the file imports the fixture), mirroring the
existing `createMockSubprocess` cases. For the gRPC rule, add a second negative
asserting that a real-definition assertion (`assert.strictEqual(check.path,
"/grpc.health.v1.Health/Check")` with no `Check: {` mock literal) does **not**
trip — pinning the librpc/health.test.js exemption. For the GraphIndex rule, add
a second negative asserting that a `new GraphIndex(new LocalStorage(…), …)`
construction with no `createMockStorage` does **not** trip — pinning the
products/map/test/pipeline.test.js (real-GraphIndex integration) exemption.

Verify: `bun test tests/check-libmock-rules.test.js`.

## Step 4 — Collapse the five libgraph consumers

Replace the inline `{ mockStorage, n3Store, graphIndex }` setup with
`createGraphIndexFixture`, passing `GraphIndex` and `Store` by direct injection
(Open Q3 default).

- Modified:
  `libraries/libgraph/test/{index-items,prefixes,index-loading,libgraph-filters,libgraph-query}.test.js`

Each `beforeEach` becomes
`({ mockStorage, n3Store, graphIndex } = createGraphIndexFixture({ GraphIndex, Store, … }))`,
carrying that file's existing `storageOverrides` (e.g. prefixes.test.js's
`ontology.ttl` getter), `prefixes` (e.g. `RDF_PREFIXES`), and `indexKey`. Tests
that construct extra `new GraphIndex(...)` for ctor-validation
(`index-loading.test.js`, `libgraph-query.test.js`) keep those direct
constructions — the rule fires only on the rebuilt triple, and these files now
import the fixture so the rule is satisfied. Add `createGraphIndexFixture` to
the existing libmock import.

Verify: `bun test libraries/libgraph` and `bun run invariants:check-libmock`.

## Step 5 — Collapse the two grpc-health consumers

Replace the inline health definition with `createMockGrpcHealthDefinition`.

- Modified: `products/guide/test/status.test.js` (drop local
  `createMockHealthDefinition`, import the fixture, call it in `createMockDeps`)
- Modified: `libraries/librpc/test/health.test.js` — **audit first**: this file
  exercises librpc's **real** `healthDefinition` (serialization round-trips),
  which the design leaves untouched. If it contains no inline *mock* definition,
  it is not a consumer; leave it unchanged and note so. Only collapse a genuine
  inline mock shape if present.

Verify: `bun test products/guide libraries/librpc` and
`bun run invariants:check-libmock`.

## Step 6 — Collapse the librepl consumer

Replace the inline readline/process/os/formatter/storage bundle with
`createReplEnvironment`.

- Modified: `libraries/librepl/test/librepl.test.js`

The `beforeEach` becomes
`({ readline: mockReadline, process: mockProcess, os: mockOs, formatter: mockFormatter, storage: mockStorage } = createReplEnvironment())`,
or destructure to the names the tests already use. Tests that mutate
`mockProcess.argv` (line 108+) keep doing so on the returned object.

Verify: `bun test libraries/librepl` and `bun run invariants:check-libmock`.

## Step 7 — Part verification

Run `bun run check`, `bun run invariants:check-libmock` (SC2's own command), and
`bun test libraries/libmock libraries/libgraph libraries/librpc products/guide libraries/librepl tests/check-libmock-rules.test.js`.
Confirms SC1 (exports resolve + README), SC2 (each new rule flags its inline
shape; `check-libmock` stays green across the repo).
