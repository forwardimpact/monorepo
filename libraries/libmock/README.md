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
  // libeval stream/message helpers
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

## When to extend libmock

Before adding a helper locally in a test file, check `src/index.js`. If the
helper doesn't exist and would be reused across two or more files, add it to
libmock in the same PR instead of inlining. See
[CONTRIBUTING.md](../../CONTRIBUTING.md) READ-DO and DO-CONFIRM checklists for
the enforced policy and `scripts/check-libmock.mjs` for the pre-commit guard
that flags inline reimplementations.

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
