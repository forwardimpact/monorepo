# 210 — CI Performance: Full Bun Migration

Every pull request triggers three GitHub Actions workflows that collectively
spin up six jobs. Five of those six jobs independently run `npm ci` against 50
workspaces, installing 225 MB of node_modules from scratch each time. Beyond CI,
another six scheduled agent workflows and three publish workflows all pay the
same cost. The package manager is the single largest time sink across the entire
GitHub Actions footprint.

This spec defines a full migration from Node.js + npm to Bun as the runtime,
package manager, and script runner across the entire project — CI workflows,
local development, and production.

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

Each `npm ci` invocation resolves, downloads, and links 652 packages across 50
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
sequentially wastes time on developer machines and in any CI job that runs the
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

## Proposal

### Migrate fully to Bun

Replace Node.js + npm with Bun as the runtime, package manager, and script
runner across the entire project.

The monorepo is well-suited for this migration:

- **Pure JavaScript codebase.** No native addons, no node-gyp, no compiled
  binaries. All 50 workspace packages are plain JS + JSDoc.
- **Pure JS gRPC.** Uses `@grpc/grpc-js` (pure JavaScript HTTP/2
  implementation), not the native C++ `grpc` package.
- **Compatible Node.js APIs.** The codebase uses `node:fs`, `node:path`,
  `node:crypto`, `node:child_process`, `node:async_hooks` (AsyncLocalStorage),
  `node:net`, and `node:stream` — all supported by Bun.
- **No problematic APIs.** No usage of `node:vm`, `node:worker_threads`,
  `node:inspector`, or `node:diagnostics_channel`.

Scope of Bun adoption:

- **Runtime: yes.** Bun replaces Node.js as the execution runtime. CLI entry
  points (`bin/fit-*.js`) and services run under Bun. The `engines` field in all
  38 workspace package.json files changes from Node.js to Bun.
- **Package manager: yes.** Bun's installer replaces `npm ci` and `npm install`
  everywhere. A single Bun lockfile replaces `package-lock.json`.
- **Script runner: yes.** Bun replaces `npm run` for executing package scripts
  and `npx` for bin execution (13 scripts across 9 package.json files, plus 40
  Makefile targets).
- **Test runner: no.** Keep `node:test` as the test API. Tests continue to use
  `import { test, describe } from "node:test"` and
  `import assert from "node:assert"`. The test _API_ stays the same, only the
  _runner process_ changes.

### Remove npm lockfile

Delete `package-lock.json` and use a single Bun lockfile. Maintaining two
lockfiles creates drift risk — a dependency added via one package manager won't
appear in the other's lockfile. Since the entire project standardizes on Bun,
the npm lockfile serves no purpose.

### Migrate all workflows

Every GitHub Actions workflow that currently uses `actions/setup-node` switches
to Bun's setup action. All 13 workflow files and both composite actions are
affected.

### Optimize vulnerability scanning

The vulnerability-scanning job should skip codegen and use only the lightweight
install needed for audit. The audit reads package metadata, not installed code.

### Increase Playwright parallelism

Increase the Playwright CI worker count to use available CPU cores instead of
forcing a single worker. The runner has 4 vCPUs — using partial parallelism
reduces E2E wall-clock time without risking memory pressure from concurrent
Chromium instances.

### Parallelize the local check script

Replace the sequential `&&` chain in the `check` script with parallel execution.
Format and lint have no interdependency. Test and validate have no
interdependency. Running both pairs concurrently reduces local check time.

## Scope

### In scope

**CI infrastructure:**

- All 13 GitHub Actions workflow files in `.github/workflows/`
- Both composite actions in `.github/actions/` (claude, audit)
- GitHub Actions caching strategy (`cache: npm` in setup-node → Bun equivalent)

**Package configuration (38 files):**

- Root `package.json` — scripts (5 `npx` scripts, 1 `node --test` script),
  engines field
- 25 library `package.json` files — `node --test` test scripts, engines fields
- 4 product `package.json` files — `node` start/CLI scripts, engines fields
- 8 service `package.json` files — `npx download` + `node server.js` start
  scripts, `node --watch` dev scripts, `node --test` test scripts, engines
  fields

**Build and tooling:**

- Makefile — `install` target (`npm ci`), 39 targets using `npx`, 1 using
  `npm audit`
- `playwright.config.js` — CI worker count
- `package-lock.json` → replaced by Bun lockfile

**Documentation:**

- CONTRIBUTING.md — 16 lines referencing `npm run`, `npx`, `npm audit`,
  `npm install`, `npm ls`
- `.github/dependabot.yml` — ecosystem configuration

### Out of scope

- **Merging CI jobs.** Lint, format, test, and E2E remain separate jobs.
  Separate jobs provide faster signal — a developer sees "lint failed" or
  "format failed" immediately without waiting for the full suite. The cost of
  separate jobs drops dramatically when install takes seconds instead of a
  minute.
- **Rewriting tests to `bun:test`.** Tests keep the `node:test` API. This avoids
  rewriting 104 test files and maintains portability.
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

### Dependabot ecosystem

Dependabot does not have a stable `bun` ecosystem, but it is available as a beta
ecosystem. Enabling `enable-beta-ecosystems: true` in `.github/dependabot.yml`
and changing the ecosystem from `npm` to `bun` maintains automated dependency
update coverage.

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
   faster on a developer machine compared to the sequential baseline, measured
   across 5 runs.
5. **Zero test regressions.** All 104 existing test files pass under Bun. All
   E2E specs pass. No new test flakiness introduced.
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
10. **gRPC streaming.** librpc client streaming tests pass under Bun, confirming
    PassThrough + objectMode transform compatibility.
