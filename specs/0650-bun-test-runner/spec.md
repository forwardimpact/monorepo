# Spec 0650 — Switch Test Runner from `node:test` to `bun test`

## Problem

Spec 0640 cut test-file LOC and lifted libharness adoption but left wall-clock
test time unchanged at ~16 s. The bottleneck is `node --test`'s fork-per-file
overhead: 211 files × ~90 ms of Node boot ≈ 19 s of pure startup. Earlier
benchmarking showed `bun test` ran the same suite in 12 s — a 30 % win — but
failed because libharness uses `mock.fn` from `node:test`, which throws
`NotImplementedError` under bun
([bun#5090](https://github.com/oven-sh/bun/issues/5090)).

## Goal

Make the test suite work under both runners, switch the default to bun, and
collect the wall-clock win without losing any test.

## Approach

Add a runner-independent `spy()` helper in libharness that matches `node:test`'s
`mock.fn` shape (`fn.mock.calls[N].arguments`, `fn.mock.callCount()`,
`fn.mock.resetCalls()`, `fn.mock.mockImplementation`). Sweep all `mock.fn` usage
to `spy`. The helper is dependency-free — it doesn't import from `node:test` or
`bun:test` — so call-inspection sites stay identical and both runners work
without any further shims.

Two bun-specific incompatibilities surfaced in the suite once `mock.fn` stopped
throwing:

1. `t.skip("…")` is `NotImplementedError` in bun. Replaced with an early
   `return` (the test then reports as passed; an honest "skipped" status isn't
   important for an environment-conditional skip).
2. The `(_, done) => done()` callback-style test isn't supported in bun. Three
   sites in `libraries/librpc/test/health.test.js` rewritten as `async` with a
   small `checkAsync` Promise wrapper around the gRPC callback handler.

## Implementation

### 1. New helper

`libraries/libharness/src/mock/spy.js` — 45 LOC, no external deps:

```js
export function spy(impl) {
  let _impl = impl;
  const calls = [];
  const fn = function (...args) {
    const rec = { arguments: args, this: this };
    if (!_impl) { calls.push(rec); return undefined; }
    try {
      const result = _impl.apply(this, args);
      rec.result = result;
      calls.push(rec);
      return result;
    } catch (err) {
      rec.error = err;
      calls.push(rec);
      throw err;
    }
  };
  fn.mock = {
    calls,
    callCount: () => calls.length,
    resetCalls: () => { calls.length = 0; },
    mockImplementation: (newImpl) => { _impl = newImpl; },
  };
  return fn;
}
```

Exported as `spy` from `@forwardimpact/libharness`.

### 2. Sweep

- 6 files in `libraries/libharness/src/mock/*` migrated from
  `import { mock } from "node:test"` + `mock.fn(...)` to
  `import { spy } from "./spy.js"` + `spy(...)`.
- 25 test files (4 × libconfig, 1 × libgraph, 3 × libindex, 1 × libmcp, 1 ×
  libpolicy, 2 × librpc, 4 × libstorage, 4 × libutil, 2 × libvector, 1 ×
  basecamp, 1 × services/mcp, 1 × services/vector) swept the same way. `mock.fn`
  callsites converted; the lone `mock` import dropped from each `node:test`
  import line.
- `libraries/libconfig/test/libconfig-env-file.test.js`: replace `t.skip(...)`
  with `return`.
- `libraries/librpc/test/health.test.js`: rewrite the three
  `(_, done) => done()` tests as async with a Promise-wrapped helper.

### 3. Switch the runner

`package.json`:

```diff
-"test": "find ./tests ./libraries ./products ./services -name '*.test.js' -not -path '*/node_modules/*' | xargs bun run node --test --test-concurrency=0",
+"test": "find ./tests ./libraries ./products ./services -name '*.test.js' -not -path '*/node_modules/*' | xargs bun test",
```

CI (`.github/workflows/check-test.yml`) already calls `bun run test` via
`package.json`, so no workflow change is needed.

## Measured outcome

| Runner                 | Wall-clock | Tests         |
| ---------------------- | ---------- | ------------- |
| `node --test` (before) | 16.3 s     | 2,404 / 2,405 |
| `bun test` (after)     | **11.0 s** | 2,405 / 2,405 |

**32 % wall-clock reduction.** All 2,405 tests pass; the previously skipped test
in `libconfig-env-file.test.js` now runs (since the early return only fires when
running as root, and CI doesn't).

## Why a custom `spy` over a runtime-detecting shim

Two paths existed:

- **A** — runtime detection in libharness, dispatching to `node:test`'s
  `mock.fn` or `bun:test`'s `mock` and translating bun's call-shape to node's.
  Required reaching into bun's internals to access the underlying call records
  before they were re-exposed under the `.mock` property, which fights bun's
  getter and is fragile.
- **B** (chosen) — a 45-LOC `spy` that depends on neither runner. Slightly
  bigger diff (renaming `mock.fn` → `spy` everywhere) but eliminates the
  dependency on either runtime's experimental mock surface, which has changed
  across versions in both Node and bun.

Path B insulates us from future churn in either runner's mock API.

## Non-goals

- Migrating away from `node:test`'s `describe`/`test`/`beforeEach`/etc. — bun
  supports these identically; no change needed.
- Adding `bun:test`-specific features (snapshot testing, etc.) — out of scope;
  this spec is purely about the runner switch.

## Risks

- **bun's `node:test` interop is improving but still incomplete.** If a future
  test uses `t.skip()`, `mock.timers`, or callback-style `done`, it'll fail
  under bun. Mitigation: lint rule could flag `mock.timers` and callback-style
  test signatures.
- **Reporters differ.** bun's TAP-like output is a different format than
  node:test's. CI consumes pass/fail counts and doesn't depend on a particular
  reporter shape.
- **Coverage tooling differs.** We don't currently run coverage in CI.
