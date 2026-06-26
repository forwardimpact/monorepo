# libmock

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Shared mocks and test fixtures so every library and service tests the same way.

<!-- END:description -->

## Usage

```js
import {
  // Mock primitive (replaces node:test's mock.fn)
  spy,
  // Config / storage / logger / fs
  createMockConfig,
  createMockStorage,
  createSilentLogger,
  createMockFs,
  // gRPC / RPC
  createMockGrpcFn,
  MockMetadata,
  createMockObserverFn,
  createMockTracer,
  createMockAuthFn,
  // Clients
  createMockMemoryClient,
  createMockLlmClient,
  createMockAgentClient,
  createMockVectorClient,
  createMockGraphClient,
  createMockToolClient,
  // Infra
  createMockSupabaseClient,
  createMockS3Client,
  createTurtleHelpers,
  createMockProcess,
  withSilentConsole,
  createMockQueries,
  // Agent-aligned engineering standard fixtures (pathway data)
  createTestStandard,
  createTestLevel,
  createTestSkill,
  createTestDiscipline,
  createTestTrack,
  createTestBehaviour,
  createTestCapability,
  createTestDriver,
  createTestPerson,
  createTestRoster,
  createTestEvidenceRow,
  // libharness stream/message helpers
  createToolUseMsg,
  createTextBlockMsg,
  createTestTrace,
  collectStream,
  stripAnsi,
  writeLines,
  createMockAgentQuery,
  // Assertions
  assertThrowsMessage,
  assertRejectsMessage,
  createDeferred,
  // Caching
  memoizeAsync,
  memoizeOnSubject,
} from "@forwardimpact/libmock";
```

The full export list lives in `src/index.js`. Subpath entries
`@forwardimpact/libmock/fixture` and `@forwardimpact/libmock/mock` remain
for narrower imports.

## Collaborators

Canonical fakes for the `runtime` collaborator surfaces. Every test that needs
a fake imports it from here so production and test wire the same shape.
`createTestRuntime` assembles them into a frozen bag mirroring libutil's
`createDefaultRuntime`.

| Surface | Production shape | Factory | Example |
|---|---|---|---|
| clock | `now()` / `sleep(ms)` | `createMockClock` | `const clock = createMockClock(); clock.advance(1000);` |
| fs | `node:fs` / `node:fs/promises` | `createMockFs` | `const fs = createMockFs({ "/a.txt": "hi" });` |
| proc | the `process` global | `createMockProcess` | `const proc = createMockProcess({ cwd: "/work", env: { K: "v" } });` |
| subprocess | `node:child_process` | `createMockSubprocess` | `const sub = createMockSubprocess({ responses: { git: { stdout: "ok" } } });` |
| finder | libutil `Finder` | `createMockFinder` | `const finder = createMockFinder({ files: { "/p/package.json": true } });` |
| git-client | libutil `GitClient` | `createMockGitClient` | `const git = createMockGitClient({ responses: { revListCount: 3 } });` |
| gh-client | libutil `GhClient` | `createMockGhClient` | `const gh = createMockGhClient({ responses: { prCreate: "url" } });` |
| runtime bag | libutil `createDefaultRuntime` | `createTestRuntime` | `const rt = createTestRuntime({ clock: createMockClock() });` |
| graph-index | libgraph `GraphIndex` + n3 `Store` triple | `createGraphIndexFixture` | `const { graphIndex } = createGraphIndexFixture({ GraphIndex, Store });` |
| grpc health def | stripped `{ Check: { path, … } }` shape | `createMockGrpcHealthDefinition` | `const def = createMockGrpcHealthDefinition();` |
| repl env | readline/process/os/formatter/storage bundle | `createReplEnvironment` | `const { readline, process } = createReplEnvironment();` |

`test/runtime-completeness.test.js` asserts every field on libutil's `Runtime`
typedef has a matching fake here, so the fakes can't drift behind the bag.

## When to extend libmock

Before adding a helper locally in a test file, check `src/index.js`. If the
helper doesn't exist and would be reused across two or more files, add it to
libmock in the same PR instead of inlining. See
[CONTRIBUTING.md](../../CONTRIBUTING.md) READ-DO and DO-CONFIRM checklists for
the enforced policy and `.coaligned/invariants/libmock.rules.mjs` for the
pre-commit guard that flags inline reimplementations.

## `spy` vs `node:test`'s `mock.fn`

`spy()` matches `mock.fn`'s shape exactly:

```js
const fn = spy((x) => x * 2);
fn(5);
fn.mock.calls[0].arguments; // [5]
fn.mock.calls[0].result;    // 10
fn.mock.callCount();        // 1
fn.mock.resetCalls();
fn.mock.mockImplementation((x) => x + 1);
```

Prefer `spy` over `node:test`'s `mock.fn` — `spy` works under both `bun test`
(the default runner) and `node --test`.
