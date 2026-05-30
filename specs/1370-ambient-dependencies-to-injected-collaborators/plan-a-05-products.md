# Plan 1370 — Part 05: Products

Migrates the six products (`landmark`, `map`, `outpost`, `summit`,
`pathway`, `guide`). Each product ships at least one bin under
`products/<name>/bin/` plus a src tree that consumes libraries.

Each section below is **one PR / one sub-row**. Sections execute in
parallel once plan-a-01 and their library dependencies (per the table
below) have merged.

Blocking dependencies per section noted explicitly. All sections block
on plan-a-01.

Sub-rows: one per section below.

## landmark (`fit-landmark`)

Sub-row: `1370/products-landmark\tplan\timplemented`.

Blocking: plan-a-01; plan-a-02 (libwiki — landmark consumes libwiki); plan-a-03 (libeval — landmark may consume eval traces).

Files (src): `products/landmark/src/commands/*.js` (the actual command implementations), `products/landmark/src/formatters/*.js`, `products/landmark/src/lib/commands-manifest.js`, `products/landmark/src/lib/*.js`, `products/landmark/src/index.js`, `products/landmark/bin/fit-landmark.js`.

- Every command + formatter accepts `{ runtime, wikiSync?, evalRunner? }`. Every `process.exit` becomes envelope return; every `process.cwd()` / `process.env` routes through `runtime.proc`; every `node:fs` routes through `runtime.fs`.
- `fit-landmark` per [design § Decision 13](design-a.md#key-decisions) is dispatched (multi-subcommand) — convert to `cli.dispatch(parsed, { deps: { runtime } })`. Capture goldens.
- The `commands-manifest.js` file maps subcommand → handler; updating it follows the libwiki bin-rewrite pattern — handlers reference each per-command file's exported function directly (`handler: runXxxCommand`), and the bin threads any landmark-specific domain collaborators via `cli.dispatch(parsed, { deps: { runtime, … } })`. No new libcli API is introduced; no per-CLI facade class is added ([design § Decision 11](design-a.md#key-decisions)).

Verification: `bun test products/landmark/test/`; `--verify` golden replay; deny-list shrink.

## map (`fit-map`, `dispatch-substrate`)

Sub-row: `1370/products-map\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libeval — map/activity consumes eval).

Files (src): `products/map/src/activity/` directory (activity fetch + ingest), `products/map/src/commands/activity.js`, `products/map/src/commands/*.js`, `products/map/src/loader.js`, `products/map/src/exporter.js`, `products/map/src/iri.js`, `products/map/src/levels.js`, `products/map/src/modifiers.js`, `products/map/src/renderer.js`, `products/map/src/schema-validation.js`, `products/map/src/contract.js`, `products/map/src/index-generator.js`, `products/map/src/validation/`, `products/map/src/lib/`, `products/map/src/view-builders/`, `products/map/src/index.js`, `products/map/bin/fit-map.js`, `products/map/bin/dispatch-substrate.js`.

- map ships two bins. `fit-map` per [CLI Inventory](design-a.md#cli-inventory) is dispatched; `dispatch-substrate` is single-flow.
- Each bin captures its own golden.
- The `activity/` directory's `runtime.subprocess` usage replaces every `spawnSync` / `execFileSync` for activity-fetch ingest.

Verification: tests pass; two `--verify` golden replays; deny-list shrink.

## outpost (`fit-outpost`)

Sub-row: `1370/products-outpost\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libsupervise — outpost's scheduler is supervisor-backed).

Files (src): `products/outpost/src/scheduler.js`, `products/outpost/src/agent-runner.js`, `products/outpost/src/kb-manager.js`, `products/outpost/src/socket-server.js`, `products/outpost/src/state-manager.js`, `products/outpost/src/outpost.js`, `products/outpost/src/index.js`, `products/outpost/bin/fit-outpost.js`. Per [CLI Inventory](design-a.md#cli-inventory), the bin's dispatch table lives in `src/outpost.js` — both `bin/fit-outpost.js` and `src/outpost.js` migrate.

- The outpost scheduler's bash watcher consumes `runtime.subprocess.spawn` (the AsyncIterable streaming contract) — exercises the same surface libsupervise validates.
- `fit-outpost` per CLI Inventory is dispatched (multi-subcommand). Convert.

Verification: tests pass; `--verify` golden replay; deny-list shrink.

## summit (`fit-summit`)

Sub-row: `1370/products-summit\tplan\timplemented`.

Blocking: plan-a-01; plan-a-03 (libgraph — summit consumes graph queries).

Files (src): `products/summit/src/*.js`, `products/summit/bin/fit-summit.js`.

- Standard `{ runtime }` injection. summit's bin per CLI Inventory is dispatched. Convert.
- summit may invoke libgraph queries that became async during plan-a-03 (libgraph) migration; propagate await.

Verification: tests pass; `--verify` golden replay; deny-list shrink.

## pathway (`fit-pathway`)

Sub-row: `1370/products-pathway\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `products/pathway/src/*.js`, `products/pathway/bin/fit-pathway.js`.

- pathway loads YAML standards from `data/pathway/` — `runtime.fs` for the loader, `runtime.proc.env` for `FORWARDIMPACT_PATHWAY_DIR`-style overrides if any.
- `fit-pathway` bin per CLI Inventory is dispatched. Convert.

Verification: tests pass; `--verify` golden replay; deny-list shrink.

## guide (`fit-guide`)

Sub-row: `1370/products-guide\tplan\timplemented`.

Blocking: plan-a-01.

Files (src): `products/guide/src/*.js`, `products/guide/bin/fit-guide.js`.

- guide consumes gRPC via `@grpc/grpc-js` — SDK boundary stays unwrapped per [spec § Out of scope](spec.md#scope).
- `fit-guide` per CLI Inventory is single-flow — thread `runtime` from `main()` as explicit parameter.
- guide's golden capture must run against a stubbed gRPC server (existing test fixture) so the capture is deterministic.

Verification: tests pass; `--verify` golden replay; deny-list shrink.

## Per-product CI gate (shared)

After every product's PR merges:

- The product's library blockers (per the per-section table above) are at `plan implemented`.
- The product's sub-row is at `plan implemented`.

The M3 milestone ([spec § SC6](spec.md#success-criteria)) gates on every products + services sub-row landing.

## Libraries used

Libraries used: libutil (Runtime, GitClient — landmark), libmock
(createTestRuntime + fakes per surface), libcli (cli.dispatch with deps),
each product's library dependencies (libwiki, libeval, libsupervise,
libgraph per section).

## Risks

- **Product PR opens before its blocking library migrates.** Release-merge enforces the blocking table in the per-section CI gate — a product PR with an unmet blocker is rejected. Mitigation: the per-section "Blocking" lines are canonical; release-merge reads them.
- **fit-guide golden capture flakes on gRPC.** Stubbed server output may not be deterministic if the stub randomizes timestamps. Mitigation: cases.json `transform` field normalizes timestamps in the captured output (foundations PR ships transform support — see [plan-a-01 Step 8](plan-a-01-foundations.md#step-8--scripts-golden-capture-mechanism)).
- **outpost's scheduler async-cascade.** The scheduler's bash watcher is a long-running async iterator. Migration must preserve cancellation semantics — `runtime.subprocess.spawn({ ... }).kill(signal)` must propagate to the underlying process. Mitigation: integration test in outpost verifies kill propagation against a sleep-bound child.
- **Product src may import bin-library internals directly.** A product reaching into `libraries/<lib>/src/internal.js` couples to a migration boundary. Mitigation: pre-PR `rg "from.*libraries/<lib>/src/[^index]"` per product; rewire to public exports before opening the PR.

— Staff Engineer 🛠️
