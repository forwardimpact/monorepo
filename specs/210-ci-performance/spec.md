# 210 — CI Performance: Full Bun Migration

Every pull request triggers three GitHub Actions workflows that collectively
spin up six jobs. Five of those six jobs independently run `npm ci` against 45
workspaces, installing 225 MB of node_modules from scratch each time. Beyond CI,
another six scheduled agent workflows and three publish workflows all pay the
same cost. The package manager is the single largest time sink across the entire
GitHub Actions footprint.

This spec defines the desired outcomes: dramatically faster installs, parallel
CI checks, parallel E2E tests, and a leaner audit job — along with a unified
runtime and package manager to reduce toolchain friction.

## Problem

### npm ci dominates wall-clock time

The `make install` step (`npm ci` + codegen) runs in 12 of 16 workflow jobs:

| Workflow              | Job                    | Runs `make install`?       |
| --------------------- | ---------------------- | -------------------------- |
| check-quality.yml     | lint                   | yes                        |
| check-quality.yml     | format                 | yes                        |
| check-test.yml        | test                   | yes                        |
| check-test.yml        | e2e                    | yes                        |
| check-security.yml    | vulnerability-scanning | yes                        |
| check-security.yml    | secret-scanning        | no                         |
| publish-npm.yml       | publish                | yes                        |
| publish-macos.yml     | build                  | no (uses npm run directly) |
| publish-skills.yml    | publish                | no (no install needed)     |
| website.yaml          | build                  | yes (npm ci)               |
| security-audit.yml    | audit                  | yes                        |
| release-readiness.yml | readiness              | yes                        |
| release-review.yml    | review                 | yes                        |
| product-backlog.yml   | backlog                | yes                        |
| improvement-coach.yml | coach                  | yes                        |
| dependabot-triage.yml | triage                 | yes                        |

Each `npm ci` invocation resolves, downloads, and links 652 packages across 45
workspaces. Even with GitHub Actions npm caching enabled (`cache: npm` on
setup-node), the restore-cache + `npm ci` + codegen step costs 30-60 seconds per
job. Across all workflows, the monorepo pays this cost 12 times per trigger
cycle.

### Sequential check script compounds locally

The local `npm run check` command runs four steps sequentially:

```
npm run format && npm run lint && npm run test && npm run validate -- --json
```

Format and lint are independent. Test and validate are independent. Running them
sequentially wastes time on engineer machines and in any CI job that runs the
combined check.

### Playwright E2E runs single-threaded in CI

The Playwright configuration forces `workers: 1` in CI:

```js
workers: process.env.CI ? 1 : undefined,
```

GitHub Actions `ubuntu-latest` runners have 4 vCPUs available. Running a single
Playwright worker leaves 75% of available compute idle during E2E tests.

### Vulnerability scanning pays full install cost for a metadata-only check

The `vulnerability-scanning` job in check-security.yml runs `make install` (full
`npm ci` + codegen) only to execute `npm audit`. The audit command reads the
lockfile and package metadata — it does not need the installed node_modules tree
or generated code.

### Two runtimes add friction

The project currently requires Node.js as the runtime while npm serves as the
package manager. Basecamp already uses Deno for its macOS build. Standardizing
on Bun as the single runtime eliminates the Node.js dependency for contributors,
aligns the runtime with the package manager, and simplifies the toolchain to one
install.

## Desired Outcomes

1. **Fast installs.** Package installation in CI should take seconds, not 30-60
   seconds per job. The package manager should leverage a global cache and avoid
   re-resolving dependencies on every run.

2. **Single lockfile.** The project should have exactly one lockfile maintained
   by one package manager. No drift risk from parallel lockfiles.

3. **Unified runtime and package manager.** A single tool should serve as
   runtime, package manager, and script runner — reducing the number of tools
   contributors must install and eliminating version matrix friction.

4. **Lean vulnerability scanning.** The audit job should install only what
   `npm audit` needs (dependency metadata), not the full dependency tree and
   codegen output.

5. **Parallel E2E tests.** Playwright should use available CPU cores in CI
   instead of forcing a single worker on a 4-vCPU runner.

6. **Parallel local checks.** The `check` script should run independent steps
   concurrently rather than sequentially.

7. **Preserved test API.** Tests continue to use `node:test` imports. The test
   _API_ stays the same — only the _runner process_ changes.

### Codebase suitability

The monorepo is well-suited for an alternative runtime:

- **Pure JavaScript codebase.** No native addons, no node-gyp, no compiled
  binaries. All 45 workspace packages are plain JS + JSDoc.
- **Pure JS gRPC.** Uses `@grpc/grpc-js` (pure JavaScript HTTP/2
  implementation), not the native C++ `grpc` package.
- **Compatible Node.js APIs.** The codebase uses `node:fs`, `node:path`,
  `node:crypto`, `node:child_process`, `node:async_hooks` (AsyncLocalStorage),
  `node:net`, and `node:stream`.
- **No problematic APIs.** No usage of `node:vm`, `node:worker_threads`,
  `node:inspector`, or `node:diagnostics_channel`.

## Scope

### In scope

**CI infrastructure:**

- All 13 GitHub Actions workflow files in `.github/workflows/`
- Both composite actions in `.github/actions/` (claude, audit)
- GitHub Actions caching strategy (`cache: npm` in setup-node → Bun equivalent)

**Package configuration (45 workspace files + root):**

- Root `package.json` — scripts (5 `npx` scripts, 1 `node --test` script),
  engines field
- 33 library `package.json` files — `node --test` test scripts, engines fields
- 4 product `package.json` files — `node` start/CLI scripts, engines fields
- 8 service `package.json` files — `npx download` + `node server.js` start
  scripts, `node --watch` dev scripts, `node --test` test scripts, engines
  fields

**Shebang lines (46 files):**

- 46 JS files with `#!/usr/bin/env node` shebang lines, including all CLI entry
  points (`bin/fit-*.js`) and service entry points. 24 packages define `bin`
  fields pointing to these files.

**Build and tooling:**

- Makefile — `install` target (`npm ci`), 39 targets using `npx`, 1 using
  `npm audit`
- `playwright.config.js` — CI worker count and `webServer` command
- `package-lock.json` → replaced by Bun lockfile

**Documentation:**

- CONTRIBUTING.md — 16 lines referencing `npm run`, `npx`, `npm audit`,
  `npm install`, `npm ls`
- `.github/dependabot.yml` — ecosystem configuration

### Out of scope

- **Merging CI jobs.** Lint, format, test, and E2E remain separate jobs.
  Separate jobs provide faster signal — an engineer sees "lint failed" or
  "format failed" immediately without waiting for the full suite. The cost of
  separate jobs drops dramatically when install takes seconds instead of a
  minute.
- **Rewriting tests to `bun:test`.** Tests keep the `node:test` API. This avoids
  rewriting 99 test files and maintains portability.
- **Basecamp's Deno dependency.** The macOS build uses Deno via `just pkg`.
  That's a separate toolchain concern unrelated to the npm-to-Bun migration.

## Risks

### child_process compatibility

The codebase uses `node:child_process` in 13 files, including critical
infrastructure: libsupervise (process supervision with `spawn` + stdio piping),
librc (service lifecycle with `spawn` + `execSync`), and libcodegen (`execFile`
for code generation). Bun's `spawn()` has historically had edge cases with IPC
channels, stdio handling, and signal propagation. These paths must be validated
before and after migration.

### Stream piping edge cases

librpc's gRPC client uses `PassThrough` streams in objectMode with custom
transforms. libsupervise pipes child process stdout/stderr with
`{ end: false }`. These are relatively uncommon stream patterns that need
explicit testing under Bun.

### npm publish workflow

The publish-npm workflow uses `npm publish --workspace=...` with
`NODE_AUTH_TOKEN`. Bun's publish command must support workspace-scoped
publishing and npm registry authentication.

### HTTP/2 support for gRPC

`@grpc/grpc-js` depends on `node:http2` internally for all inter-service
communication. Bun's HTTP/2 implementation has historically been incomplete.
This affects every microservice (agent, graph, llm, memory, tool, trace, vector,
web) — not just the stream patterns in librpc. Validation must cover actual
service startup and gRPC call round-trips, not only unit tests.

### process.execPath behavioral change

`process.execPath` returns the path to the `bun` binary instead of `node`. Two
files depend on this value: `libraries/libcodegen/types.js` (passes it to spawn
for protobuf compilation) and `products/basecamp/src/basecamp.js` (derives macOS
bundle directory from the executable path). Both need verification or
adjustment.

### Shebang lines in bin entries

46 files use `#!/usr/bin/env node` shebang lines. When invoked via `bunx` or
`bun run`, Bun ignores the shebang and runs the file under its own runtime.
However, direct execution (`./bin/fit-pathway.js`) would still invoke Node.js.
Shebangs must be updated to `#!/usr/bin/env bun` for consistency, or the project
must document that direct execution requires Bun.

### Test runner semantics (bun --test vs node --test)

`bun --test` invokes Bun's built-in test runner (`bun:test`), not Node's
`node:test`. Since all 99 test files import from `node:test`, the correct
invocation to run them under Bun's runtime while preserving the `node:test` API
is `bun run node --test` (or `bun node --test`), not `bun --test`. Using the
wrong invocation would either fail or silently use a different test API.

### Audit without package-lock.json

`npm audit` reads `package-lock.json` to resolve the dependency graph. After
deleting the npm lockfile and switching to `bun.lock`, `bunx npm audit` may not
function correctly without a `package-lock.json` present. The plan must validate
this approach or generate a temporary lockfile for the audit step.

### AsyncLocalStorage context propagation

libtelemetry uses `AsyncLocalStorage` for distributed trace context propagation
across gRPC calls. Bun has historically had edge cases with `AsyncLocalStorage`
in concurrent async scenarios. This is critical infrastructure — broken context
propagation would silently corrupt traces.

### createRequire and WASM resolution

Four files use `createRequire(import.meta.url)` for dynamic module resolution
(librc, libutil/finder, libsupervise, libsyntheticrender). Additionally,
libsyntheticrender resolves a `parquet-wasm` `.wasm` file via `require.resolve`.
Bun's module resolution may differ in edge cases, particularly for WASM assets.

### Dependabot ecosystem

Dependabot does not have a stable `bun` ecosystem, but it is available as a beta
ecosystem. Enabling `enable-beta-ecosystems: true` in `.github/dependabot.yml`
and changing the ecosystem from `npm` to `bun` maintains automated dependency
update coverage. Beta features can be removed or changed without notice — if
Dependabot drops Bun support, the fallback is to maintain a `package-lock.json`
solely for Dependabot by running `npm install --package-lock-only` in CI.

### First-run cache performance

Bun install times depend on whether the global module cache is warm. First CI
runs after cache eviction may be slower than steady-state. The success criteria
for install time should reflect cached performance, which is the common case.

## Success Criteria

1. **Install time.** Bun install in CI completes in under 5 seconds (down from
   30-60 seconds with `npm ci`), measured from the GitHub Actions step timer
   across 10 consecutive runs with warm cache.
2. **Total CI wall-clock time.** The slowest PR-triggered workflow
   (check-test.yml) completes at least 30% faster end-to-end compared to the
   10-run average before the change.
3. **E2E parallelism.** Playwright E2E tests run with multiple workers in CI,
   confirmed by Playwright's output log showing more than 1 worker.
4. **Local check time.** The parallelized check script completes at least 30%
   faster on an engineer machine compared to the sequential baseline, measured
   across 5 runs.
5. **Zero test regressions.** All 99 existing test files pass under Bun. All E2E
   specs pass. No new test flakiness introduced.
6. **All workflows green.** Every workflow in `.github/workflows/` succeeds
   after the migration — verified by a full CI run on the migration PR plus
   manual triggering of publish and agent workflows (or dry-run equivalents).
7. **Single lockfile.** `package-lock.json` is deleted. Bun's lockfile is the
   sole lockfile. No lockfile drift is possible.
8. **Audit integrity.** Vulnerability scanning continues to detect the same
   vulnerability set as before — verified by comparing output from the old and
   new approaches against the same dependency state.
9. **Subprocess compatibility.** All libsupervise, librc, and libcodegen tests
   pass under Bun. Process supervision start/stop/restart cycles work correctly.
10. **gRPC round-trip.** At least one gRPC service starts under Bun and
    completes a request-response cycle and a streaming call. librpc unit tests
    alone are insufficient — a live service validates HTTP/2, stream piping, and
    AsyncLocalStorage trace propagation together.
11. **Shebang consistency.** All 46 bin entry points use `#!/usr/bin/env bun`
    and execute correctly when invoked directly.
