# Plan 1370 — Part 01: Foundations

Ships the blocking work for every subsequent migration PR: libmock
fakes, libcli `ctx.deps` extension, libutil `Runtime`/`GitClient`/
`GhClient`/`Finder`, the three new invariant scripts, the golden-capture
mechanism, MONOREPO.md, the STATUS sub-row schema extension, and the
deny-list seed.

Blocking dependency: none. Every other plan-a part blocks on this PR
merging.

Sub-row: `1370/foundations\tplan\timplemented` on PR merge.

## Step 1 — Extend STATUS sub-row schema

Created: `libraries/libwiki/src/audit/status-row.js`,
`libraries/libwiki/test/audit-status-row.test.js`,
`libraries/libwiki/src/status.js`, `libraries/libwiki/test/status.test.js`.
Modified: `wiki/STATUS.md` header comment,
`libraries/libwiki/src/audit/rules.js`, `libraries/libwiki/src/audit/scopes.js`,
`.claude/skills/kata-release-merge/SKILL.md`,
`.claude/skills/kata-dispatch/SKILL.md` (or the workflows that embed the spec-id
regex — `kata-dispatch.yml` if it embeds rather than delegates).

- Extend the `Format:` line in `wiki/STATUS.md` to:
  `{id}<TAB>{phase}<TAB>{status}` where `id` matches `^\d{4}(\/[a-z0-9-]+)?$`. A
  `/<unit>` suffix denotes a sub-row of the master spec.
- Author `libraries/libwiki/src/status.js` exporting `parseStatusRowId(id)` →
  `{ specId, unit }` and `STATUS_ID_REGEX = /^\d{4}(\/[a-z0-9-]+)?$/`. Add
  `status.test.js` asserting both shapes parse correctly.
- Remove `"STATUS.md"` from the `EXCLUDED_BASES` set in
  `libraries/libwiki/src/audit/scopes.js:14`. Add an `audit/status-row.js` rule
  that validates every non-comment line in `wiki/STATUS.md` matches the
  `{id}<TAB>{phase}<TAB>{status}` shape with `id` matching the new regex.
  Register the rule in `audit/rules.js`.
- Update `.claude/skills/kata-release-merge/SKILL.md`'s grep pattern from
  `^${spec_id}\t` to `^${spec_id}(\/[a-z0-9-]+)?\t` so the master gate logic
  counts both the master row and its sub-rows. The master row advances to
  `plan implemented` only when every sub-row reads `plan implemented`.
- Update `.claude/skills/kata-dispatch/SKILL.md` (and `kata-dispatch.yml` if it
  embeds the regex) so routing predicates that check `\d{4}` accept the suffix.
- `fit-wiki claim --target plan:1370/libutil-…` already parses arbitrary
  `--target` strings — verify by adding a test in
  `libraries/libwiki/test/claim.test.js` that a suffix-shaped target round-trips
  through claim/release.

Verification:
`bun test libraries/libwiki/test/{status,audit-status-row,claim}.test.js`
passes; `bun run audit wiki` (or equivalent Stop-hook audit invocation) passes
on a `wiki/STATUS.md` containing both `1370\tplan\tapproved` and
`1370/libutil\tplan\tdraft` rows.

## Step 2 — libmock: add the missing fakes

Created: `libraries/libmock/src/mock/subprocess.js`,
`libraries/libmock/src/mock/finder.js`,
`libraries/libmock/src/mock/git-client.js`,
`libraries/libmock/src/mock/gh-client.js`,
`libraries/libmock/test/runtime-completeness.test.js`. Modified:
`libraries/libmock/src/mock/index.js`, `libraries/libmock/src/index.js`,
`libraries/libmock/README.md`.

- `createMockSubprocess({ responses = {} } = {})` — returns
  `{ run, runSync, spawn, calls }`. `run(cmd, args, opts)` resolves to
  `{ stdout, stderr, exitCode }`, consulting
  `responses[cmd] ?? { stdout: "", stderr: "", exitCode: 0 }`; `runSync` is the
  synchronous sibling returning the same shape from the same `responses` map.
  `spawn` returns an
  `{ stdout: AsyncIterable, stderr: AsyncIterable, exitCode: Promise, kill }`
  quad backed by an in-memory queue. (The matching production
  `createDefaultSubprocess` in `libutil/src/runtime.js` grows `runSync` over
  `node:child_process` `spawnSync`.)
- `createMockFinder({ files = {} } = {})` — returns
  `{ findUpward, findData, findProjectRoot, findPackagePath, findGeneratedPath, createSymlink, createPackageSymlinks, calls }`.
  Behavior mimics `Finder` over the `files` map.
- `createMockGitClient({ responses = {} } = {})` — returns one method per
  `GitClient` surface (clone, init, fetch, status, rebase, mergeOursStrategy,
  commitAll, push, revListCount, configGet, configSet, aheadCount, remoteGetUrl,
  withAuth) plus `calls`. Defaults are no-op success.
- `createMockGhClient({ responses = {} } = {})` — returns
  `{ prCreate, prMerge, apiGet, apiPost, calls }`.
- **`createMockProcess` extension.** The current factory at
  `libraries/libmock/src/mock/infra.js:143` ships only
  `{ env, stdout, stderr, exitCode, exit }`. Extend it to match the
  `Runtime.proc` typedef: add `cwd: () => options.cwd ?? "/work"`,
  `argv: Object.freeze([...(options.argv ?? ["/usr/bin/node", "/tmp/test-bin.js"])])`,
  and `stdin: createMockStdin(options.stdin ?? [])` returning an
  `AsyncIterable<string>` over the provided chunks. The existing `exit(code)`
  and `exitCode` shape stay — they already match the property-setter contract
  Step 4 ratifies.
- `createTestRuntime(overrides = {})` — exported from
  `libraries/libmock/src/runtime.js` (new). Returns a frozen
  `{ fs, fsSync, proc, clock, subprocess, finder }` built from
  `createMockFs`/`createMockProcess`/`createMockClock`/`createMockSubprocess`/`createMockFinder`
  defaults, with each field overridable by `overrides.<field>`. JSDoc
  `@typedef {import('../../libutil/src/runtime.js').Runtime}` — no runtime
  coupling to libutil.
- `runtime-completeness.test.js` reads `libraries/libutil/src/runtime.js` as
  plain text and asserts that every `@property` JSDoc tag inside the `Runtime`
  typedef block has a matching `createMock<Field>` export in libmock's index.
  Regex-based — no AST parser dependency. Detection regex:
  `/@property\s+\{[^}]+\}\s+(\w+)/g` scoped to the `* Runtime`-prefixed JSDoc
  block.
- `libraries/libmock/README.md` gains a `## Collaborators` section — one
  subsection per surface with production shape, factory name, three-line
  example.

Verification: `bun test libraries/libmock/test/` passes (existing + new files);
`runtime-completeness.test.js` covers every Runtime field.

## Step 3 — libcli and libui: add the `deps` slot

Created: none. Modified: `libraries/libcli/src/invocation-context.js`,
`libraries/libcli/src/cli.js`, `libraries/libcli/test/cli.test.js`,
`libraries/libui/src/invocation-context.js`,
`libraries/libui/test/invocation-context.test.js`, `libraries/CLAUDE.md`.

- `libraries/libcli/src/invocation-context.js`: add
  `@property {Readonly<Object>} deps` to the `InvocationContext` typedef with
  doc "Host-injected ambient collaborators (runtime bag, typed clients). The
  handler treats deps as immutable input. Distinct from `data` (host-loaded
  domain values).". Extend `freezeInvocationContext` to accept
  `{ data, args, options, deps }` and `Object.freeze` the `deps` slot. `deps`
  defaults to `undefined` for backwards compatibility.
- `libraries/libui/src/invocation-context.js`: same typedef extension and
  `freezeInvocationContext` change. The libui-side context is a sibling
  implementation
  ([libraries/libui/src/invocation-context.js:45](../../libraries/libui/src/invocation-context.js)),
  not a re-export, and design Decision 3 rejected forking the surface — both
  implementations must accept `deps` for the contract to hold. libui handlers
  don't typically consume `runtime` (web surface), but the typedef parity
  preserves single-contract reading.
- `libraries/libcli/src/cli.js`: extend `dispatch(parsed, { data, deps } = {})`.
  Pass `deps` through to `freezeInvocationContext`. The positional `data`
  argument continues to work — the five existing call sites (four in
  `libraries/libcli/test/cli.test.js:370,401,446,469` and one in
  `libraries/libcoaligned/bin/coaligned.js:109`) remain green.
- `libraries/libcli/src/cli.js`: extend
  `createCli(definition, { runtime } = {})` — when `runtime` is provided,
  `Cli.error`, `Cli.usageError`, and help rendering write through
  `runtime.proc.stderr` instead of the captured global `process.stderr`.
  Existing zero-arg `createCli(definition)` keeps reading global `process`
  (deprecated alias, one migration cycle).
- `cli.test.js`: add cases asserting (a)
  `dispatch(parsed, { data: {...}, deps: { runtime } })` exposes both slots on
  the frozen context; (b) `dispatch(parsed, { data: {...} })` works unchanged;
  (c) `createCli(definition, { runtime })` routes help to `runtime.proc.stderr`.
- `libui/test/invocation-context.test.js`: parallel assertions for the libui
  freezer.
- `libraries/CLAUDE.md`: update § Invocation context to document the `deps` slot
  — "Use `ctx.deps` for host-injected ambient collaborators (the `runtime` bag
  from spec 1370); use `ctx.data` for host-loaded domain values.".

Verification:
`bun test libraries/libcli/test/cli.test.js libraries/libui/test/invocation-context.test.js`
passes; all five pre-existing `cli.dispatch(parsed, { data: ... })` call sites
remain green.

## Step 4 — libutil: `Runtime` typedef and factory

Created: `libraries/libutil/src/runtime.js`,
`libraries/libutil/test/runtime.test.js`. Modified:
`libraries/libutil/src/index.js`, `libraries/libutil/package.json` (exports
field).

- `runtime.js` exports:
  - `Runtime` typedef: `{ fs, fsSync, proc, clock, subprocess, finder }` (JSDoc
    `@typedef`). Every field is documented with one `@property` per leaf —
    runtime-completeness.test.js (Step 2) reads these tags.
  - `createDefaultRuntime({ env = process.env } = {})` — two-phase factory: (1)
    build `fs` from `node:fs/promises`, `fsSync` from `node:fs`, `proc` (see
    below), `clock` (from `Date.now` + `setTimeout`/`setImmediate`-based
    `sleep`), `subprocess` (see below); (2) build
    `finder = new Finder({ fs, proc })` from phase-1 fields; (3) `Object.freeze`
    and return.
  - `createDefaultProc({ source = process } = {})` — returns a non-frozen object
    with these own properties: `cwd: () => source.cwd()`; `env` (see env
    contract below); `argv: Object.freeze([...source.argv])`; `stdin` returning
    an `AsyncIterable<string>` adapter over `source.stdin` (line-buffered
    iterator); `stdout: { write: (s) => source.stdout.write(s) }`;
    `stderr: { write: (s) => source.stderr.write(s) }`;
    `exit: (code) => source.exit(code)`; and an `exitCode` accessor defined via
    `Object.defineProperty(proc, "exitCode", { get: () => source.exitCode, set: (v) => { source.exitCode = v; } })`.
    The plain-property accessor matches libcli's existing pattern
    `this.#proc.exitCode = 1`
    ([cli.js:171,177](../../libraries/libcli/src/cli.js)). The default-proc
    object itself is not frozen — `exitCode` would lose its setter under
    `Object.freeze`.
  - **`env` contract.** The `env` field is a `Proxy` over `source.env` with
    traps `get`, `has`, `set`, `deleteProperty`, `ownKeys`,
    `getOwnPropertyDescriptor`. The trap set must support both
    `{ ...runtime.proc.env }` spread (required by `GitClient.#run` in Step 5)
    and `for (const k in runtime.proc.env)` iteration. Concrete shape:

    ```js
    env: new Proxy(source.env, {
      get: (t, k) => t[k],
      has: (t, k) => k in t,
      set: (t, k, v) => { t[k] = v; return true; },
      deleteProperty: (t, k) => { delete t[k]; return true; },
      ownKeys: (t) => Reflect.ownKeys(t),
      getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k) ?? { configurable: true, enumerable: true, value: t[k], writable: true },
    })
    ```

    Token rotation works because the Proxy reads through to `source.env` on
    every access; tests can mutate the source map between calls.
  - `createDefaultSubprocess()` —
    `{ run: async (cmd, args, opts) => { … execFile-Promise wrapper … }, spawn: (cmd, args, opts) => { … child_process.spawn wrapper exposing stdout/stderr AsyncIterable and exitCode Promise … } }`.
    Implementation uses `node:child_process` — this file is one of the
    allow-listed default-collaborator factories.
  - `createDefaultClock()` —
    `{ now: () => Date.now(), sleep: (ms) => new Promise(r => setTimeout(r, ms)), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) }`.
- `runtime.test.js` uses `createTestRuntime` from libmock; asserts
  `createDefaultRuntime()` returns a frozen object with every typedef field
  present and non-null; asserts `proc.env` Proxy reads pass through to the
  source on every access; asserts `{ ...runtime.proc.env, NEW_KEY: "x" }` spread
  produces a non-empty object inheriting source env; asserts
  `runtime.proc.exitCode = 1` propagates to `source.exitCode`.
- `libraries/libutil/src/index.js` exports `createDefaultRuntime`,
  `createDefaultProc`, `createDefaultSubprocess`, `createDefaultClock`.
- `libraries/libutil/package.json` `exports` field gains
  `"./runtime": "./src/runtime.js"`, `"./git-client": "./src/git-client.js"`
  (Step 5), `"./gh-client": "./src/gh-client.js"` (Step 5). libmock's
  `package.json` gains `"./runtime": "./src/runtime.js"` in the same PR.

Verification: `bun test libraries/libutil/test/runtime.test.js` passes;
resolution of `@forwardimpact/libutil/runtime` succeeds from a sibling library's
import; `bun run scripts/check-libmock.mjs` (the existing guard, extended in
Step 7) covers the new fakes.

## Step 5 — libutil: `GitClient` and `GhClient`

Created: `libraries/libutil/src/git-client.js`,
`libraries/libutil/src/gh-client.js`,
`libraries/libutil/test/git-client.test.js`,
`libraries/libutil/test/git-client.integration.test.js`,
`libraries/libutil/test/gh-client.test.js`. Modified:
`libraries/libutil/src/index.js`.

- `git-client.js`:

  ```js
  export class GitClient {
    constructor({ runtime }) { this.#runtime = runtime; }
    async clone(url, dir, opts = {}) { return this.#run("clone", [url, dir, ...this.#flagOpts(opts)]); }
    async init(dir) { return this.#run("init", [dir]); }
    async fetch(remote = "origin", refspec, opts = {}) { … }
    async status({ cwd }) { … }
    async rebase(upstream, { cwd, strategy } = {}) { … }
    async mergeOursStrategy({ cwd, ref }) { … }
    async commitAll(message, { cwd, author } = {}) { … }
    async push(remote = "origin", branch, { cwd, force = false } = {}) { … }
    async revListCount(range, { cwd }) { … }
    async configGet(key, { cwd } = {}) { … }
    async configSet(key, value, { cwd } = {}) { … }
    async aheadCount({ cwd, upstream } = {}) { … }
    async remoteGetUrl(remote = "origin", { cwd }) { … }
    withAuth(token) { return new GitClient({ runtime: this.#runtime, token }); }
    #run(subcmd, args, { cwd } = {}) {
      const env = this.#token ? { ...this.#runtime.proc.env, GIT_ASKPASS_TOKEN: this.#token } : this.#runtime.proc.env;
      return this.#runtime.subprocess.run("git", [subcmd, ...args], { cwd, env });
    }
  }
  ```

  Every method returns `{ stdout, stderr, exitCode }` or throws on
  `exitCode !== 0` per the surface contract documented in JSDoc.
- `gh-client.js`: same shape over `gh` for `prCreate`, `prMerge`, `apiGet`,
  `apiPost`.
- `git-client.test.js` (unit) — uses
  `createTestRuntime({ subprocess: createMockSubprocess({ responses: { git: { stdout: "...", exitCode: 0 } } }) })`;
  asserts each method invokes `subprocess.run("git", [...])` with the expected
  args.
- `git-client.integration.test.js` — uses `createDefaultRuntime()`; runs real
  `git init` + `git config` in a tmpdir; tests rebase + `-X ours` recovery +
  `withAuth(token)`. This is the SC5 "one explicit smoke test per binary" for
  GitClient.
- `gh-client.test.js` — unit only; gh integration is covered transitively by
  callers.

Verification:
`bun test libraries/libutil/test/git-client.test.js gh-client.test.js` passes;
`bun test libraries/libutil/test/git-client.integration.test.js` passes against
a tmpdir.

## Step 6 — libutil: `Finder` refactor

Created: none. Modified: `libraries/libutil/src/finder.js`,
`libraries/libutil/test/finder.test.js`.

- Constructor changes from `(fs, logger, process = global.process)` to
  `({ fs, proc })` — `logger` removed from constructor. Field `#proc` replaces
  `#process`.
- `findUpward(root, relativePath, maxDepth = 3, { logger } = {})` — accepts a
  per-call `logger` override. Internal `fs.existsSync(...)` calls route through
  `this.#fs.existsSync` (the spec-flagged dead-`fs` bug). The top-of-file
  `import fs from "fs"` is deleted.
- `findData(baseName, homeDir, { logger } = {})` — same logger pass-through;
  routes through `this.#fs` + `this.#proc.cwd()`.
- `findProjectRoot(startPath, { logger } = {})`,
  `findPackagePath(projectRoot, packageName, { logger } = {})`,
  `findGeneratedPath(projectRoot, packageName, { logger } = {})` — same shape.
  `createRequire` stays — it's a node-builtin, not an ambient FS access.
- `createSymlink(sourcePath, targetPath, { logger } = {})`,
  `createPackageSymlinks(generatedPath, { logger } = {})` — same shape; the
  `import fsAsync from "fs/promises"` at the top of the file is deleted in favor
  of `this.#fs` (which is `fs/promises`).
- `finder.test.js` migrates from `new Finder(fsAsync, logger, process)` to
  `new Finder({ fs: createMockFs({ paths }), proc: createMockProcess({ cwd: "/work" }) })`.
  A new case asserts `findUpward` uses the injected `fs` (verifies the dead-`fs`
  bug fix).

Verification: `bun test libraries/libutil/test/finder.test.js` passes;
`rg "new Finder\(" libraries/ products/ services/` returns matches only under
`libraries/libutil/` (SC9 — the foundations PR establishes the rule; downstream
PRs delete the remaining call sites in their migration units).

## Step 7 — scripts: invariant checks

Created: `scripts/check-ambient-deps.mjs`,
`scripts/check-ambient-deps.allow.json`, `scripts/check-ambient-deps.deny.json`,
`scripts/check-subprocess-in-tests.mjs`,
`scripts/check-subprocess-in-tests.allow.json`,
`scripts/check-subprocess-in-tests.deny.json`,
`scripts/test/check-ambient-deps.test.js`,
`scripts/test/check-subprocess-in-tests.test.js`. Modified: `package.json` (the
`invariants` task), `scripts/check-libmock.mjs` (extend with new collaborator
surfaces).

- `check-ambient-deps.mjs`:
  - AST-walks every `*.js` under `libraries/*/src/`, `products/*/src/`,
    `services/*/src/`.
  - Detects: `import` of `node:fs` / `node:fs/promises` / `node:child_process`;
    member access `Date.now()`, `new Date()`, `setTimeout(...)`;
    `process.exit(...)`, `process.cwd()`, `process.stdout.write`,
    `process.stderr.write`, `process.env.X`.
  - For each match, consults the allow-list (path globs) and the deny-list
    (per-unit grandfathered files with explicit smells).
  - Detects constructor parameter destructuring of `runtime` naming both `fs`
    and `fsSync` ([design § Decision 7](design-a.md#key-decisions)) — flags as
    violation.
  - Exits non-zero on any unallow-listed, non-deny-listed match.
- `check-ambient-deps.allow.json`: globs for `**/bin/*.js`,
  `**/services/*/server.js`, `libraries/libutil/src/runtime.js`,
  `libraries/libutil/src/git-client.js`, `libraries/libutil/src/gh-client.js`,
  `libraries/libcli/src/**`, `libraries/libmock/src/mock/**`, `scripts/**`.
- `check-ambient-deps.deny.json`: seeded with every current src violation across
  the monorepo, grouped by `{ pattern, library, smells }`. Seeding procedure:
  (a) ship a one-shot `scripts/_seed-ambient-deps-deny.mjs` in this PR that
  AST-walks the monorepo and prints a candidate deny-list; (b) commit the
  script's output as `check-ambient-deps.deny.json` in the same PR; (c) delete
  `_seed-ambient-deps-deny.mjs` in the next commit — it's a single-use seeder,
  not an ongoing tool. Subsequent migration PRs shrink the deny-list manually
  per the recipe.
- `check-subprocess-in-tests.mjs`:
  - AST-walks every `*.test.js` under `libraries/*/test/`, `products/*/test/`,
    `services/*/test/`.
  - Detects `execFileSync` / `spawnSync` / `spawn` / `execFile` / `exec` call
    sites whose first argument is `"node"` or matches a project bin path.
  - Exempts files named `*.integration.test.js` (whole-file granularity).
  - Consults the per-binary one-entry allow-list (one smoke test per bin).
- `check-subprocess-in-tests.allow.json`:
  `[{ test: "libraries/libwiki/test/fit-wiki-smoke.integration.test.js", bin: "fit-wiki" }, …]`
  — one entry per CLI binary.
- `check-subprocess-in-tests.deny.json`: seeded with every current spawning
  test, shrinking per migration PR.
- Tests: positive cases exercise each detector against a fixture file with a
  known violation and assert the exit code + the offender list.
- `check-libmock.mjs` extension: add the same kinds of inline-fake patterns the
  existing guard catches for tracer/logger/storage, applied to subprocess,
  finder, git-client, gh-client (one positive case per surface in the regression
  test).
- `package.json` `invariants` task runs both new scripts.

Verification: `bun run invariants` exits 0 on a clean checkout;
`bun test scripts/test/check-ambient-deps.test.js check-subprocess-in-tests.test.js`
passes.

## Step 8 — scripts: golden-capture mechanism

Created: `scripts/capture-cli-golden.mjs`,
`scripts/test/capture-cli-golden.test.js`. Modified: `package.json` (capture
script entry — invoked manually per migration PR, not in `invariants`).

- `capture-cli-golden.mjs --bin <name> [--verify]`:
  - Default mode: discovers `test/golden/<bin>/cases.json` (per-bin cases —
    `{ args: string[], env: Record<string,string>, exitCode: number, stdoutFile: string, stderrFile: string, transform?: { pattern: string, replacement: string }[] }[]`),
    spawns the bin against each case, applies any per-case `transform` regexes
    to captured stdout/stderr (`new RegExp(pattern, "g")` → `replacement`),
    writes the normalized output to `test/golden/<bin>/`.
  - `--verify` mode: re-spawns the bin against each case, applies the same
    transforms, asserts byte equality against the committed snapshots; exits
    non-zero on any diff.
- The cases.json schema and one example case per published CLI
  (`fit-wiki claim --target test`) ship as starter content. The `transform`
  field is the documented normalization path for bins that emit timestamps, ids,
  or other non-deterministic content — bin-level cases.json files use it to keep
  golden capture stable.
- `scripts/test/capture-cli-golden.test.js`: exercises capture + verify against
  a stub bin that prints deterministic output; includes one case using
  `transform` to normalize a stub timestamp.

Verification: `bun run scripts/test/capture-cli-golden.test.js` passes.

## Step 9 — MONOREPO.md and CONTRIBUTING.md cross-link

Created: none. Modified: `MONOREPO.md`, `CONTRIBUTING.md`.

- `MONOREPO.md` gains a top-level
  `## Ambient Dependencies and Collaborator Injection` section per
  [Success Criterion 10](spec.md#success-criteria): names the four collaborator
  surfaces (clock, fs, proc, subprocess) plus finder/git-client/gh-client; links
  to `libraries/libmock/README.md#collaborators` for the fakes; lists the
  invariant scripts (`scripts/check-ambient-deps.mjs`,
  `scripts/check-subprocess-in-tests.mjs`, `scripts/check-libmock.mjs`); links
  to spec 1370 + design + plan.
- `CONTRIBUTING.md § READ-DO` gains a line:
  `- New src under libraries/products/services destructures the runtime bag — read MONOREPO.md § Ambient Dependencies before adding a new module.`

Verification: `bun run invariants` (which includes `check-temporal` and existing
context checks) passes; manual review of MONOREPO.md against SC10.

## Step 10 — Update STATUS

Modified: `wiki/STATUS.md`.

- Add `1370/foundations\tplan\timplemented` (this sub-row, advanced in the same
  PR since the PR implements it).
- The master `1370\tplan\tapproved` row is written by `staff-engineer` when the
  **plan PR** (this plan file) merges, not by the foundations implementation PR.
  Foundations implementation does not touch the master row.

Verification: `wiki/STATUS.md` parses against the new STATUS_ID_REGEX from
`libraries/libwiki/src/status.js`; `audit` Stop-hook passes against the new
shape.

## Risks

- **Deny-list seed wrong-sized.** If the AST pre-scan under-counts, foundations
  PR ships invariants that pass today but fail downstream when downstream PRs
  discover overlooked smells. Mitigation: the pre-scan is a documented Step 7
  substep — implementer runs it before drafting the deny-list and commits both
  the script and the resulting JSON in the same PR.
- **libcli's `runtime` parameter to `createCli` not wired by foundations
  callers.** The deprecated-alias path leaves existing zero-arg
  `createCli(definition)` callers reading global `process`. Mitigation:
  per-library migration PRs (plan-a-02 onward) extend their `createCli` calls to
  pass `runtime`; foundations PR ships the seam plus a deny-list seed flag so
  downstream migrations are required to update.
- **Golden capture flakes on time-stamped output.** Bins that print dates /
  random ids produce non-deterministic snapshots. Mitigation: `cases.json`
  supports a `transform: [{ pattern, replacement }]` field — per-case regex
  normalization. Bins with intrinsically non-deterministic stdout document this
  in their `cases.json` header and use transforms.

— Staff Engineer 🛠️
