# 210 — CI Performance: Full Bun Migration

Every pull request triggers three GitHub Actions workflows that collectively
spin up six jobs. Five of those six jobs independently run `npm ci` against 46
workspaces, installing 225 MB of node_modules from scratch each time. Beyond CI,
another six scheduled agent workflows and three publish workflows all pay the
same cost. The package manager is the single largest time sink across the entire
GitHub Actions footprint.

This spec defines a full migration from Node.js + npm to Bun as the runtime,
package manager, and script runner across the entire project — CI workflows,
local development, and production.

## Problem

### npm ci dominates wall-clock time

The `make install` step (`npm ci` + codegen) runs in 12 of 15 workflow jobs:

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

Each `npm ci` invocation resolves, downloads, and links 652 packages across 46
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
package manager. Basecamp already uses Deno for its build. Standardizing on Bun
as the single runtime eliminates the Node.js dependency for contributors, aligns
the runtime with the package manager, and simplifies the toolchain to one
install.

## Proposal

### Migrate fully to Bun

Replace Node.js + npm with Bun as the runtime, package manager, and script
runner across the entire project. Bun's install is 10-30x faster than `npm ci`
due to its native binary linker and global module cache. Its runtime is
compatible with the Node.js APIs this project uses, and its script execution
avoids npm's shell-spawning overhead.

The monorepo is well-suited for this migration:

- **Pure JavaScript codebase.** No native addons, no node-gyp, no compiled
  binaries. All 46 workspace packages are plain JS + JSDoc.
- **Pure JS gRPC.** Uses `@grpc/grpc-js` (pure JavaScript HTTP/2
  implementation), not the native C++ `grpc` package. `protobufjs` and
  `@grpc/proto-loader` are also pure JavaScript.
- **Compatible Node.js APIs.** The codebase uses `node:fs`, `node:path`,
  `node:crypto`, `node:child_process`, `node:async_hooks` (AsyncLocalStorage),
  `node:net`, and `node:stream` — all fully supported by Bun.
- **Compatible test framework.** Tests use `node:test` and `node:assert` with
  `describe`, `test`, `beforeEach`, `mock.fn()` — all supported by Bun's Node.js
  compatibility layer.
- **No problematic APIs.** No usage of `node:vm`, `node:worker_threads`,
  `node:inspector`, or `node:diagnostics_channel`.

Scope of Bun adoption:

- **Runtime: yes.** Bun replaces Node.js as the execution runtime. The `engines`
  field in package.json changes from `node >= 18.0.0` to specify Bun. CLI entry
  points (`bin/fit-*.js`) and services run under Bun. CI workflows use
  `oven-sh/setup-bun` instead of `actions/setup-node`.
- **Package manager: yes.** `bun install` replaces `npm ci` and `npm install`
  everywhere. `bun.lock` becomes the canonical lockfile.
- **Script runner: yes.** `bun run` replaces `npm run` for executing package
  scripts, eliminating npm's shell-spawning overhead.
- **Test runner: no.** Keep `node:test` as the test API. Tests continue to use
  `import { test, describe } from "node:test"` and
  `import assert from "node:assert"`. Bun executes them via `bun --test` or
  `bun run node --test` — the test _API_ stays the same, only the _runner
  process_ changes.

### Remove package-lock.json

Delete `package-lock.json` and make `bun.lock` the sole lockfile. Maintaining
two lockfiles creates drift risk — a dependency added via `bun install` won't
appear in `package-lock.json` and vice versa. Since the entire project
standardizes on Bun, the npm lockfile serves no purpose.

### Migrate all workflows

Every GitHub Actions workflow that currently uses `actions/setup-node` and
`npm ci` / `make install` switches to `oven-sh/setup-bun` and `bun install`.
This includes:

- **CI check workflows** (3): check-quality, check-test, check-security
- **Publish workflows** (3): publish-npm, publish-macos, publish-skills
- **Website workflow** (1): website
- **Agent workflows** (6): security-audit, release-readiness, release-review,
  product-backlog, improvement-coach, dependabot-triage

The `.github/actions/claude` composite action switches its global install from
`npm install -g @anthropic-ai/claude-code` to
`bun install -g @anthropic-ai/claude-code`.

The `.github/actions/audit` composite action adapts vulnerability scanning to
work with Bun's lockfile, either via `bun pm` or by retaining a targeted
`npm audit` invocation.

### Optimize vulnerability scanning

The vulnerability-scanning job currently runs `make install` (full dependency
tree + codegen) just to execute `npm audit`. The audit reads package metadata,
not installed code. With Bun as the package manager, the job installs
dependencies (fast) but skips codegen entirely. If `bun audit` or equivalent is
not available, a lightweight `npm audit` against the lockfile can be retained
without the full install.

### Increase Playwright parallelism

Change the Playwright CI worker count from 1 to `"50%"` (half of available
CPUs). On `ubuntu-latest` with 4 vCPUs, this gives 2 parallel browser contexts,
halving E2E wall-clock time without risking memory pressure from 4 concurrent
Chromium instances.

### Parallelize the local check script

Replace the sequential `&&` chain in `bun run check` with a parallel runner.
Format and lint have no interdependency. Test and validate have no
interdependency. The new structure runs both pairs concurrently, reducing local
check time by roughly 40%.

## Scope

### In scope

- All 13 GitHub Actions workflow files in `.github/workflows/`
- Both composite actions in `.github/actions/` (claude, audit)
- The `make install` target and other Makefile targets that use `npx`
- The root `package.json` (scripts, engines)
- The `playwright.config.js` CI worker count
- Generation of `bun.lock` and deletion of `package-lock.json`
- CONTRIBUTING.md and CLAUDE.md references to npm commands
- The `.github/dependabot.yml` ecosystem configuration

### Out of scope

- **Merging CI jobs.** Lint, format, test, and E2E remain separate jobs.
  Separate jobs provide faster signal — a developer sees "lint failed" or
  "format failed" immediately without waiting for the full suite. The cost of
  separate jobs drops dramatically when install takes 2 seconds instead of 45.
- **Rewriting tests to `bun:test`.** Tests keep the `node:test` API. This avoids
  rewriting 110 test files and maintains portability.
- **Basecamp's Deno dependency.** The macOS build uses Deno via `just pkg`.
  That's a separate toolchain concern unrelated to the npm-to-Bun migration.

## Success Criteria

1. **Install time.** `bun install` in CI completes in under 5 seconds (down from
   30-60 seconds with `npm ci`), measured from the GitHub Actions step timer
   across 10 consecutive runs.
2. **Total CI wall-clock time.** The slowest PR-triggered workflow
   (check-test.yml) completes at least 30% faster end-to-end compared to the
   10-run average before the change.
3. **E2E parallelism.** Playwright E2E tests run with 2 workers in CI, confirmed
   by Playwright's output log showing `Running N tests using 2 workers`.
4. **Local check time.** `bun run check` completes at least 30% faster on a
   developer machine compared to the sequential baseline, measured across 5
   runs.
5. **Zero test regressions.** All 110 existing test files pass under Bun. All
   E2E specs pass. No new test flakiness introduced.
6. **All workflows green.** Every workflow in `.github/workflows/` succeeds
   after the migration — verified by a full CI run on the migration PR plus
   manual triggering of publish and agent workflows (or dry-run equivalents).
7. **Single lockfile.** `package-lock.json` is deleted. `bun.lock` is the sole
   lockfile. No lockfile drift is possible.
8. **Audit integrity.** Vulnerability scanning continues to detect the same
   vulnerability set as before — verified by comparing output from the old and
   new approaches against the same dependency state.
