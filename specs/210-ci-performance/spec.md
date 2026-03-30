# 210 — CI Performance: Bun Migration and Workflow Optimization

Every pull request triggers three GitHub Actions workflows that collectively spin
up six jobs. Five of those six jobs independently run `npm ci` against 46
workspaces, installing 225 MB of node_modules from scratch each time. The
package manager is the single largest time cost in CI, and it runs five times in
parallel for every push.

This spec defines a migration from npm to Bun as the package manager and script
runner across all CI workflows, plus targeted workflow optimizations that
compound with the faster runtime.

## Problem

### npm ci dominates wall-clock time

The `make install` step (`npm ci` + codegen) runs in five of six CI jobs:

| Workflow | Job | Runs `make install`? |
|---|---|---|
| check-quality.yml | lint | yes |
| check-quality.yml | format | yes |
| check-test.yml | test | yes |
| check-test.yml | e2e | yes |
| check-security.yml | vulnerability-scanning | yes |
| check-security.yml | secret-scanning | no |

Each `npm ci` invocation resolves, downloads, and links 652 packages across 46
workspaces. Even with GitHub Actions npm caching enabled (`cache: npm` on
setup-node), the restore-cache + `npm ci` + codegen step costs 30-60 seconds per
job. Multiplied across five jobs, the monorepo pays 2.5-5 minutes of aggregate
compute time on package installation alone — and that's the _cached_ case.

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

## Proposal

### Migrate CI to Bun

Replace npm with Bun as the package manager and script runner in all CI
workflows. Bun's install is 10-30x faster than npm ci in benchmarks due to its
native binary linker and global module cache. On a cold install of a comparable
monorepo (hundreds of packages, 200+ MB node_modules), Bun typically completes
in under 3 seconds versus npm ci's 30-60 seconds.

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
  `describe`, `test`, `beforeEach`, `mock.fn()` — all supported by Bun's
  Node.js compatibility layer.
- **No problematic APIs.** No usage of `node:vm`, `node:worker_threads`,
  `node:inspector`, or `node:diagnostics_channel`.

Scope of Bun adoption:

- **Package manager: yes.** `bun install` replaces `npm ci` in CI. Generates
  `bun.lock` alongside the existing `package-lock.json`.
- **Script runner: yes.** `bun run` replaces `npm run` for executing package
  scripts in CI workflows, eliminating npm's shell-spawning overhead.
- **Test runner: no.** Keep `node --test` as the test runner. The project
  standardizes on the Node.js test runner per CONTRIBUTING.md and CLAUDE.md.
  Bun's test runner uses a different API (`bun:test`) that would require
  rewriting all 110 test files. Using `bun run node --test` still gets the
  faster process spawning benefit.
- **Runtime: no.** Application code continues to run on Node.js. Bun is adopted
  as a development and CI tool, not as the production runtime. The `engines`
  field in package.json remains `node >= 18.0.0`.

### Optimize vulnerability scanning

Replace the full `make install` in the vulnerability-scanning job with `bun
install --frozen-lockfile` (or simply rely on the lockfile). `npm audit`
(or its equivalent) reads package metadata, not installed code. If Bun is
the package manager, use `bun pm` or continue to use `npm audit` with a
minimal install.

Alternatively, since `npm audit` parses the lockfile: install only npm (not the
full dependency tree) and run `npm audit` against the lockfile directly. The
codegen step is unnecessary for auditing.

### Increase Playwright parallelism

Change the Playwright CI worker count from 1 to `"50%"` (half of available
CPUs). On `ubuntu-latest` with 4 vCPUs, this gives 2 parallel browser contexts,
halving E2E wall-clock time without risking memory pressure from 4 concurrent
Chromium instances.

### Parallelize the local check script

Replace the sequential `&&` chain in `npm run check` with a parallel runner.
Format and lint have no interdependency. Test and validate have no
interdependency. The new structure runs both pairs concurrently, reducing local
check time by roughly 40%.

## Scope

### In scope

- All three CI check workflows: `check-quality.yml`, `check-test.yml`,
  `check-security.yml`
- The `make install` target in `Makefile`
- The `check` script in root `package.json`
- The `playwright.config.js` CI worker count
- Generation of `bun.lock`
- The `publish-npm.yml` workflow (uses `make install`)
- The `publish-skills.yml` workflow (uses `make install`)
- The `website.yaml` workflow (uses `npm ci`)

### Out of scope

- **Merging CI jobs.** Lint, format, test, and E2E remain separate jobs. Separate
  jobs provide faster signal — a developer sees "lint failed" or "format failed"
  immediately without waiting for the full suite. The cost of separate jobs drops
  dramatically when install takes 2 seconds instead of 45.
- **Agent workflows.** The Claude agent workflows (`security-audit.yml`,
  `release-readiness.yml`, etc.) use the custom `.github/actions/claude`
  composite action, which installs Claude Code via npm. These workflows are
  scheduled, not on the PR critical path, and have different optimization
  characteristics.
- **Removing package-lock.json.** Keep both lockfiles during the transition.
  Developers who prefer npm locally can continue using it. CI uses Bun.
- **Bun as production runtime.** Node.js remains the runtime for all services
  and CLIs. The `engines` field is unchanged.
- **Local developer workflow mandate.** Developers may use npm or Bun locally.
  CI standardizes on Bun. The `make install` target switches to Bun, but `npm
  install` continues to work from `package-lock.json`.

## Success Criteria

1. **Install time.** The `make install` step in CI completes in under 5 seconds
   (down from 30-60 seconds), measured from the GitHub Actions step timer across
   10 consecutive runs.
2. **Total CI wall-clock time.** The slowest CI workflow (check-test.yml)
   completes at least 30% faster end-to-end compared to the 10-run average
   before the change.
3. **E2E parallelism.** Playwright E2E tests run with 2 workers in CI, confirmed
   by Playwright's output log showing `Running N tests using 2 workers`.
4. **Local check time.** `npm run check` completes at least 30% faster on a
   developer machine compared to the sequential baseline, measured across 5 runs.
5. **Zero test regressions.** All 110 existing test files pass. All E2E specs
   pass. No new test flakiness introduced.
6. **Audit integrity.** `npm audit` (or equivalent) continues to detect the same
   vulnerability set as before — verified by running both old and new approaches
   against the current lockfile and comparing output.
7. **Publish workflows.** `publish-npm.yml` and `publish-skills.yml` succeed
   with the updated install step, verified by a dry-run or tag-triggered
   execution.
