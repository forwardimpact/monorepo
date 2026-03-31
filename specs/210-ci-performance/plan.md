# 210 — Plan: Full Bun Migration

## Approach

The migration proceeds in four phases: local tooling first (Makefile, package
scripts, lockfile), then CI workflows, then documentation, then validation. Each
phase is independently testable. The ordering ensures that `make install` works
under Bun before any workflow references it, and that all workflows are updated
before documentation is adjusted.

Throughout, `npx` becomes `bunx`, `npm run` becomes `bun run`,
`npm ci`/`npm install` becomes `bun install`, and `node` as a script runner
becomes `bun`. The `node:test` API is preserved — only the process that executes
tests changes.

## Phase 1: Local Tooling

### 1.1 Generate bun.lock, delete package-lock.json

Run `bun install` at the repo root to generate `bun.lock`. Delete
`package-lock.json`. Add `package-lock.json` to `.gitignore` to prevent
accidental regeneration.

**Files created:** `bun.lock` **Files deleted:** `package-lock.json` **Files
modified:** `.gitignore`

### 1.2 Update root package.json

Replace all `npx` and `node` references in scripts. Change `engines` field.

```jsonc
// Before
"engines": { "node": ">=18.0.0" },
"scripts": {
  "prestart": "npx fit-pathway build",
  "start": "npx serve public",
  "dev": "npx fit-pathway dev",
  "check": "npm run format && npm run lint && npm run test && npm run validate -- --json",
  "check:fix": "npm run format:fix && npm run lint:fix",
  "test": "find ./tests ./libraries ./products ./services -name '*.test.js' -not -path '*/node_modules/*' | xargs node --test",
  "test:e2e": "npx playwright test",
  "validate": "npx fit-map validate"
}

// After
"engines": { "bun": ">=1.2.0" },
"scripts": {
  "prestart": "bunx fit-pathway build",
  "start": "bunx serve public",
  "dev": "bunx fit-pathway dev",
  "check": "bun run format && bun run lint && bun run test && bun run validate -- --json",
  "check:fix": "bun run format:fix && bun run lint:fix",
  "test": "find ./tests ./libraries ./products ./services -name '*.test.js' -not -path '*/node_modules/*' | xargs bun run node --test",
  "test:e2e": "bunx playwright test",
  "validate": "bunx fit-map validate"
}
```

**Decision:** The `check` script stays sequential in this step; parallelism is
addressed in Phase 1.6.

**Files modified:** `package.json`

### 1.3 Update workspace package.json files (45 files)

Three categories of changes across all workspace packages:

**Libraries (33 files)** — change `engines` from `"node": ">=22.0.0"` (or
`">=18.0.0"` for libdoc, libprompt, libskill, and the libsynthetic* packages) to
`"bun": ">=1.2.0"`. Change test scripts from `node --test test/*.test.js`to`bun
run node --test test/\*.test.js`.

**Products (4 files)** — change `engines`. Change `node` invocations in scripts:

- basecamp: `node src/basecamp.js` → `bun src/basecamp.js`
- map: `node ./bin/fit-map.js ...` → `bun ./bin/fit-map.js ...`
- pathway: `node ./bin/fit-pathway.js ...` → `bun ./bin/fit-pathway.js ...`
- guide: update similarly

**Services (8 files)** — change `engines`. Change scripts:

- `start`: `npx download && node server.js` → `bunx download && bun server.js`
- `dev`: `node --watch server.js` → `bun --watch server.js`
- `test`: `node --test test/*.test.js` → `bun run node --test test/*.test.js`

**Decision:** Test scripts use `bun run node --test` (not `bun --test`). The
`bun --test` command invokes Bun's built-in test runner (`bun:test`), which is a
different API from `node:test`. Since all 99 test files import from `node:test`,
the correct approach is to run Node's test runner under Bun's runtime via
`bun run node --test`. This preserves the test API while using Bun as the
execution engine.

**Files modified:** 45 workspace `package.json` files (33 libraries, 4 products,
8 services).

### 1.4 Update Makefile

Replace `npm ci` with `bun install`, all `npx` with `bunx`, and `npm audit` with
the Bun equivalent.

```makefile
# Before
install:
	@npm ci
	@npx --workspace=@forwardimpact/libcodegen fit-codegen --all

audit-vulnerabilities:
	@npm audit --audit-level=high --omit=dev --workspaces

# After
install:
	@bun install --frozen-lockfile
	@bunx --workspace=@forwardimpact/libcodegen fit-codegen --all

audit-vulnerabilities:
	@npm install --package-lock-only --ignore-scripts 2>/dev/null
	@npm audit --audit-level=high --omit=dev --workspaces
	@rm -f package-lock.json
```

All 40 `npx` targets follow the same `npx` → `bunx` pattern. The `--workspace`
flag syntax is the same in Bun.

**Decision:** `audit-vulnerabilities` generates a temporary `package-lock.json`
on the fly since `npm audit` requires it and the migration deletes the permanent
lockfile. The target runs `npm install --package-lock-only` (metadata only, no
`node_modules`), then `npm audit`, then cleans up. This requires `npm` to be
available on the system (ensured by `setup-node` in CI workflows that run
audit).

**Files modified:** `Makefile`

### 1.5 Update Playwright config

Change the CI worker count from 1 to `"50%"` and update the webServer command:

```js
// Before
workers: process.env.CI ? 1 : undefined,
// ...
webServer: {
  command: "npm start",

// After
workers: process.env.CI ? "50%" : undefined,
// ...
webServer: {
  command: "bun start",
```

On `ubuntu-latest` (4 vCPUs), this gives 2 parallel workers.

**Files modified:** `playwright.config.js`

### 1.6 Parallelize the check script

Replace the sequential `&&` chain with parallel execution using
`bun run --parallel` or a shell-level parallel construct:

```jsonc
// Option A: bun run --parallel (if supported for ad-hoc grouping)
"check": "bun run --parallel format lint test validate:json",

// Option B: shell-level concurrency
"check": "bun run format & bun run lint & wait && bun run test & bun run validate -- --json & wait",
```

**Decision:** Option B is more portable and gives explicit control over the two
dependency groups (format+lint, then test+validate). The first pair runs
concurrently; both must pass before the second pair starts concurrently.

Actually, format and lint are independent of test and validate — all four can
run concurrently:

```jsonc
"check": "bun run format & bun run lint & bun run test & bun run validate -- --json & wait"
```

If any background job fails, `wait` returns non-zero and the script fails.

**Files modified:** `package.json` (already listed in 1.2, but the check script
change happens here)

### 1.7 Update shebang lines (46 files)

Replace `#!/usr/bin/env node` with `#!/usr/bin/env bun` in all 46 files that
have shebang lines. This includes all CLI entry points (`bin/fit-*.js`), service
entry points (`server.js`), and utility scripts.

```sh
# Find and replace all shebangs
grep -rl '#!/usr/bin/env node' --include='*.js' . | grep -v node_modules | \
  xargs sed -i 's|#!/usr/bin/env node|#!/usr/bin/env bun|'
```

**Files modified:** 46 JS files with shebang lines (see `grep -rl` output for
full list).

### 1.8 Verify process.execPath usage

Two files use `process.execPath` and may break when it returns the Bun binary
path instead of Node:

- `libraries/libcodegen/types.js:92` — passes `process.execPath` to
  `this.#base.run()` for protobuf compilation. Verify that protobuf tools
  execute correctly when invoked via the Bun binary.
- `products/basecamp/src/basecamp.js:108` — derives macOS bundle directory from
  the executable path. This path is only used in the macOS `.app` bundle context
  where the executable is the Deno-compiled binary, not Bun, so no change is
  needed. Add a comment clarifying this assumption.

**Files modified:** `products/basecamp/src/basecamp.js` (comment only),
`libraries/libcodegen/types.js` (verify, potentially no change needed)

## Phase 2: CI Workflows

### 2.1 PR-triggered workflows (3 files)

Replace `actions/setup-node` with `oven-sh/setup-bun`, remove `cache: npm`,
replace `npm run` / `npm test` with `bun run` / `bun test`, replace `npx` with
`bunx`.

**check-quality.yml** (2 jobs: lint, format):

```yaml
# Before (each job)
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
  with:
    node-version: 22
    cache: npm
- run: make install
- run: npm run lint  # or npm run format

# After (each job)
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
- run: make install
- run: bun run lint  # or bun run format
```

**check-test.yml** (2 jobs: test, e2e):

```yaml
# Before (test job)
- uses: actions/setup-node@...
  with:
    node-version: 22
    cache: npm
- run: make install
- run: npx fit-universe
- run: npm test
- run: npm run validate -- --shacl

# After (test job)
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
- run: make install
- run: bunx fit-universe
- run: bun run test
- run: bun run validate -- --shacl

# Before (e2e job)
- run: npx playwright install --with-deps chromium

# After (e2e job)
- run: bunx playwright install --with-deps chromium
```

**check-security.yml** (vulnerability-scanning job):

```yaml
# Before
- uses: actions/setup-node@...
  with:
    node-version: 22
    cache: npm
- run: make install

# After
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
  with:
    node-version: 22
- run: bun install --frozen-lockfile
```

**Decision:** The vulnerability-scanning job replaces `make install` with bare
`bun install --frozen-lockfile` — it skips codegen entirely since `npm audit`
only needs the dependency tree metadata. `setup-node` is retained alongside
`setup-bun` because `npm audit` requires the `npm` CLI and reads
`package-lock.json`. The audit composite action generates a temporary lockfile
on the fly (see § 2.5).

**Files modified:** `check-quality.yml`, `check-test.yml`, `check-security.yml`

### 2.2 Publish workflows (3 files)

**publish-npm.yml:**

```yaml
# Before
- uses: actions/setup-node@... # v4
  with:
    node-version: "22"
    registry-url: "https://registry.npmjs.org"
    cache: "npm"
- run: make install
- run: npm run test
- name: Extract package name from tag
  run: |
    PKG_JSON=$(npm query "[name]" --json | ...)
- name: Publish to npm
  run: npm publish --workspace=... --access=public

# After
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
  with:
    node-version: "22"
    registry-url: "https://registry.npmjs.org"
- run: make install
- run: bun run test
- name: Extract package name from tag
  run: |
    # Use bun-compatible package resolution instead of npm query
    PKG_JSON=$(node -e "
      const { workspaces } = require('./package.json');
      const tag = '${GITHUB_REF_NAME%%@v*}';
      for (const ws of workspaces) {
        const pkg = require('./' + ws + '/package.json');
        if (pkg.name.endsWith('/' + tag)) {
          console.log(JSON.stringify({ name: pkg.name, path: ws }));
          break;
        }
      }
    ")
    echo "npm_name=$(echo "$PKG_JSON" | jq -r '.name')" >> $GITHUB_OUTPUT
    echo "dir_name=$(echo "$PKG_JSON" | jq -r '.path')" >> $GITHUB_OUTPUT
- name: Publish to npm
  run: npm publish --workspace=... --access=public
```

**Decision:** Keep `actions/setup-node` alongside `oven-sh/setup-bun` in the
publish workflow only. The `setup-node` action with `registry-url` configures
the `.npmrc` for authenticated publishing. `npm publish` is retained for
registry publishing since it is battle-tested. Bun handles install and test; npm
handles the final publish step. The `npm query` command is replaced with a
Node.js script that reads workspace package.json files directly.

**publish-macos.yml:**

```yaml
# Before
- run: npm run test

# After
- run: bun run test
```

This workflow already uses `denoland/setup-deno` for Basecamp's build. No
setup-node to replace (it was never present). Add `oven-sh/setup-bun` for the
test step.

**publish-skills.yml:** No install step — likely no changes needed. Review for
any `npm` references.

**Files modified:** `publish-npm.yml`, `publish-macos.yml`, `publish-skills.yml`

### 2.3 Website workflow (1 file)

**website.yaml:**

```yaml
# Before
- uses: actions/setup-node@... # v4
  with:
    node-version: "20"
    cache: "npm"
- run: npm ci
- run: npx fit-doc build --src=website --out=dist

# After
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
- run: bun install --frozen-lockfile
- run: bunx fit-doc build --src=website --out=dist
```

**Files modified:** `website.yaml`

### 2.4 Agent workflows (6 files)

All six follow the same pattern — replace setup-node with setup-bun, keep
`make install` (already updated in Phase 1.4):

- `security-audit.yml`
- `release-readiness.yml`
- `release-review.yml`
- `product-backlog.yml`
- `improvement-coach.yml`
- `dependabot-triage.yml`

```yaml
# Before (each)
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
  with:
    node-version: 22
    cache: npm

# After (each)
- uses: oven-sh/setup-bun@735343cf11a0fad2539a9800e109ac7e0bafc0e6 # v2
  with:
    bun-version: latest
```

**Files modified:** 6 agent workflow files

### 2.5 Composite actions (2 files)

**`.github/actions/claude/action.yml`:**

```yaml
# Before
- run: npm install -g @anthropic-ai/claude-code@2.1.87
# and
  | npx fit-eval tee "$TRACE_DIR/trace.ndjson"

# After
- run: bun install -g @anthropic-ai/claude-code@2.1.87
# and
  | bunx fit-eval tee "$TRACE_DIR/trace.ndjson"
```

Also replace the `node -e` inline script (line 81-86) for settings.json
manipulation with `bun -e` (same V8 API, Bun supports `-e`).

**`.github/actions/audit/action.yml`:**

```yaml
# Before
- run: npm audit --audit-level=high --omit=dev --workspaces

# After
- run: npm install --package-lock-only --ignore-scripts 2>/dev/null
- run: npm audit --audit-level=high --omit=dev --workspaces
- run: rm -f package-lock.json
```

**Decision:** Since `npm audit` requires `package-lock.json` and the migration
deletes it, the audit action generates a temporary lockfile on the fly. This
avoids depending on a native `bun audit` command that doesn't exist, and avoids
maintaining a permanent npm lockfile. The `setup-node` action is required in any
workflow that runs this composite action to ensure `npm` is available.

**Files modified:** `.github/actions/claude/action.yml`,
`.github/actions/audit/action.yml`

### 2.6 Dependabot configuration

```yaml
# Before
- package-ecosystem: npm

# After
- package-ecosystem: bun

# Add at top level
enable-beta-ecosystems: true
```

**Decision:** Dependabot's `bun` ecosystem is available via the
`enable-beta-ecosystems` flag. This maintains automated dependency update
coverage after migration.

**Files modified:** `.github/dependabot.yml`

## Phase 3: Documentation

### 3.1 CONTRIBUTING.md

Update 16 lines referencing npm commands:

| Section                    | Before                         | After                               |
| -------------------------- | ------------------------------ | ----------------------------------- |
| Getting Started            | `npm install`                  | `bun install`                       |
| PR Workflow                | `npm run check:fix`            | `bun run check:fix`                 |
| PR Workflow                | `npm run check`                | `bun run check`                     |
| Quality Commands (8 lines) | `npm run ...` / `npx ...`      | `bun run ...` / `bunx ...`          |
| Security                   | `npm audit --audit-level=high` | `bunx npm audit --audit-level=high` |
| Dependency Policy          | `npm ls <package>`             | `bun pm ls`                         |
| Dependency Policy          | `npm audit --audit-level=high` | `bunx npm audit --audit-level=high` |

**Files modified:** `CONTRIBUTING.md`

### 3.2 Operations docs

Search `website/docs/internals/operations/` for npm references and update
accordingly.

**Files modified:** TBD — depends on content found

## Phase 4: Validation

### 4.1 Subprocess compatibility smoke test

Before committing, manually verify:

1. `make install` completes without errors
2. `make codegen` generates code correctly
3. `make rc-start` / `make rc-stop` work (libsupervise + librc paths)
4. `bun run test` — all 99 test files pass
5. `bun run test:e2e` — Playwright shows 2 workers in output
6. `bun run check` — format, lint, test, validate all pass
7. Direct execution of a bin entry: `./bin/fit-pathway.js --help` confirms the
   updated shebang invokes Bun

### 4.2 gRPC service round-trip verification

Unit tests alone are insufficient — `@grpc/grpc-js` depends on `node:http2`
internally, and Bun's HTTP/2 support must be validated with a live service.

1. Run librpc unit tests:
   ```sh
   cd libraries/librpc && bun run node --test test/*.test.js
   ```
2. Start a gRPC service and confirm a round-trip call:
   ```sh
   make rc-start
   # Run a health check or simple RPC against one of the services
   make rc-stop
   ```
3. Run libtelemetry tests to confirm AsyncLocalStorage trace context
   propagation:
   ```sh
   cd libraries/libtelemetry && bun run node --test test/*.test.js
   ```

### 4.3 Audit validation

Verify the temporary-lockfile audit approach produces correct results:

```sh
# Compare audit output before and after migration
# (run once with npm ci + npm audit, once with bun install + make audit-vulnerabilities)
```

### 4.4 CI workflow dry run

Push to a feature branch and verify all 13 workflows pass. For publish and agent
workflows that don't trigger on PRs, use `workflow_dispatch` where available.

## File Change Summary

| Category          | Files                            | Action |
| ----------------- | -------------------------------- | ------ |
| Lockfile          | `bun.lock`                       | Create |
| Lockfile          | `package-lock.json`              | Delete |
| Gitignore         | `.gitignore`                     | Modify |
| Package config    | `package.json` (root)            | Modify |
| Package config    | 45 workspace `package.json`      | Modify |
| Shebang lines     | 46 JS files with `bin` entries   | Modify |
| Build             | `Makefile`                       | Modify |
| Test config       | `playwright.config.js`           | Modify |
| CI workflows      | 13 files in `.github/workflows/` | Modify |
| Composite actions | 2 files in `.github/actions/`    | Modify |
| Dependabot        | `.github/dependabot.yml`         | Modify |
| Documentation     | `CONTRIBUTING.md`                | Modify |
| Documentation     | Operations docs (TBD)            | Modify |
| **Total**         | **~115 files**                   |        |
