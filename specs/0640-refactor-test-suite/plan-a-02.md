# Plan 0640-a Part 02 — migrate real-I/O unit tests onto the seam

Implements spec § B and design Component "Unit / integration boundary",
Decision 4, Open Q1. Independently executable; no dependency on other parts.

Libraries used: libmock (`createMockFs`, `createTestRuntime`).

## Migration shape (applies to every step)

A unit test that builds `createDefaultRuntime()` + a real `mkdtemp` and seeds it
with `writeFileSync` becomes: a `createMockFs(seed)` whose `seed` is the file
map the test previously wrote to disk, injected through
`createTestRuntime({ fs: createMockFs(seed) })` (which sets `fsSync = fs`, the
sync surface the loaders read). Drop the `mkdtempSync`/`writeFileSync`/`rmSync`
and `tmpdir` imports. Use a fixed in-memory dir path (e.g. `/prompts`) for the
loader's `promptDir`.

## Step 1 — Migrate the libprompt loader test

- Modified: `libraries/libprompt/test/loader.test.js`,
  `libraries/libprompt/package.json`

Replace the `beforeEach` tempdir with a per-test `createMockFs` seed. Each test
that did `writeFileSync(join(tempDir, "x.prompt.md"), content)` seeds
`createMockFs({ "/prompts/x.prompt.md": content })` and constructs
`new PromptLoader("/prompts", createTestRuntime({ fs }))`.
Constructor-validation tests (`promptDir is required`, etc.) need no fs at all.
Drop the `node:fs` / `node:os` / `createDefaultRuntime` imports; import
`createMockFs`, `createTestRuntime` from `@forwardimpact/libmock`. libprompt
does **not** yet declare libmock — add `"@forwardimpact/libmock"` to
`package.json` `devDependencies` (matching the version other libs pin) so
`check-workspace-imports` stays green.

Verify: `bun test libraries/libprompt` (same pass count, no `mkdtemp`);
`bun run invariants:check-workspace-imports`.

## Step 2 — Migrate the libtemplate loader test

- Modified: `libraries/libtemplate/test/loader.test.js`,
  `libraries/libtemplate/package.json`

Same shape. The override-dir tests (`dataDir` second tmpdir, lines 67–90) seed
both layers into one `createMockFs` map (`/defaults/page.html`,
`/data/templates/page.html`) and pass the data dir through the loader's existing
parameter. Drop `mkdirSync`/`mkdtempSync`/`rmSync`/`tmpdir`. libtemplate does
**not** yet declare libmock — add `"@forwardimpact/libmock"` to `package.json`
`devDependencies` so `check-workspace-imports` stays green.

Verify: `bun test libraries/libtemplate` (no `mkdtemp`);
`bun run invariants:check-workspace-imports`.

## Step 3 — Sweep the remaining non-`integration` real-I/O files

The candidate lists below are the seed enumeration as of this plan; Step 4's
`rg -l mkdtemp` gate is the authoritative closing check, so treat any
non-`integration` `mkdtemp`/subprocess file the gate surfaces — listed here or
not — as in-scope for the rule. For each candidate, apply the decision rule,
then act. The rule (Open Q1 default): **migrate** when the code under test
accepts a `runtime` (or `fs`) parameter and the assertions inspect pure
logic/returned values; **rename** to `*.integration.test.js` when the real
filesystem/subprocess behaviour is itself under test or no injection seam
exists; **allow-list** only a genuine residual (record it for SC3). When a
**migrate** disposition makes a test file the first in its package to import
`@forwardimpact/libmock`, add libmock to that package's `package.json`
`devDependencies` in the same change (per plan-a.md § Cross-cutting
"Workspace-import declarations").

- Modified / renamed: the files in the candidate list (plus any newly-importing
  `package.json`).

**Candidate list — `mkdtemp` (non-integration `*.test.js`):**

`libraries/libcoaligned/test/{instructions,jtbd}.test.js`,
`libraries/libconfig/test/{bootstrap,credential-env-override}.test.js`,
`libraries/libeval/test/{assert,benchmark-apm-installer,benchmark-env-loader,benchmark-judge,benchmark-npm-installer,benchmark-report,benchmark-task-family,by-discussion,callback,lead-flags,task-input,trace-split}.test.js`,
`libraries/libsyntheticgen/test/synthea.test.js`,
`libraries/libsyntheticprose/test/build-prompt.test.js`,
`libraries/libterrain/test/{fhir-microdata-rdf,pipeline,sinks}.test.js`,
`libraries/libwiki/test/{agent-roster,audit-cli,audit-engine,audit-status-row,block-renderer,boot,cli-boot,cli-claim,cli-fix,cli-init,cli-log,cli-memo,cli-refresh,marker-migrator,skill-roster,weekly-log}.test.js`,
`libraries/libxmr/test/summarize.test.js`,
`products/landmark/test/{dispatcher,lib/commands-verb}.test.js`,
`products/map/test/{activity/substrate-stage,exporter,pipeline}.test.js`,
`products/outpost/test/sync-helpers-copy.test.js`,
`tests/{capture-cli-golden,env-setup}.test.js`.

**Candidate list — subprocess (`execFileSync`/`spawnSync`/`execSync`,
non-integration):**

`libraries/librc/test/{manager-logs,manager-start,manager-stop}.test.js`,
`libraries/libwiki/test/cli-refresh.test.js`,
`products/landmark/test/{dispatcher,lib/commands-verb}.test.js`,
`services/oauth/test/no-github.test.js`,
`tests/{check-ambient-deps,check-subprocess-in-tests,env-setup}.test.js`.

**Classification hints from sampling (confirm per file, do not assume):**

| Cluster | Likely disposition | Why |
| --- | --- | --- |
| Files passing `createDefaultRuntime()` into a runtime-accepting fn (`benchmark-report`, `jtbd`, `boot`, `exporter`) | migrate | seam exists; swap to `createTestRuntime({ fs })` |
| `libwiki/test/cli-*.test.js` exercising a CLI command end-to-end against a real wiki dir | likely rename | the on-disk wiki round-trip is the behaviour under test |
| `librc/test/manager-*.test.js`, `check-ambient-deps`/`check-subprocess-in-tests` self-tests | likely rename or already-exempt | spawn real processes / scan the real tree |
| Guard self-tests (`tests/check-*.test.js`) | leave / allow-list | they intentionally exercise real I/O against the repo |

**Skip:** files already named `*.integration.test.js` (e.g.
`products/pathway/test/build-packs.integration.test.js`) and any entry already
in `scripts/check-subprocess-in-tests.allow.json`.

**Owned end-to-end here (also > 400 LOC, excluded from Part 03):** after
applying the migrate/rename rule to `libraries/libterrain/test/pipeline.test.js`
(411) and `libraries/libwiki/test/audit-engine.test.js` (421), bring each result
under the 400-LOC ceiling — split by behaviour family (Part 03's rule) or
allow-list if cohesive. `products/map/test/pipeline.test.js` is a **rename** to
`*.integration.test.js` (real `GraphIndex` over `LocalStorage`); the Part 01
GraphIndex rule is scoped to the `createMockStorage` triple, so it does not trip
here.

Verify per file: `bun test <file>`;
`bun run invariants:check-subprocess-in-tests`; for the two dual-concern files,
also confirm ≤400 LOC (or allow-listed).

## Step 4 — Establish the SC3 allow-list and verify

- Verify only: no source file change beyond Step 3.

After the sweep, `rg -l mkdtemp` over non-`integration` `*.test.js` under
`libraries/`, `products/`, `services/`, `tests/` must return only the
deliberately-allow-listed residual (the guard self-tests). Record that residual
set in the PR description so the reviewer can confirm it against SC3.

Verify: `bun run invariants:check-ambient-deps`,
`bun run invariants:check-subprocess-in-tests`, and
`bun test libraries products services tests` for the touched directories green.
Confirms SC3.
