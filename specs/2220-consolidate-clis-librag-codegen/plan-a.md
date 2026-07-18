# Plan 2220-a: Consolidate the RAG and codegen CLIs

Implements design [2220-a](design-a.md) for spec [2220](spec.md).

## Approach

Land the whole consolidation as one clean-break change: two invariants couple
the surfaces and forbid a partial merge. `public-cli-set.rules.mjs` computes the
`launchers/` set from `npx`/`bunx fit-*` invocations in docs and skills, so the
launcher swap (steps 3, 5) and the doc/skill rewrites (steps 8, 9) must land
together; `enumeration-drift` sources the gear library count from
`libraries/lib*/package.json`, so creating `librag` (step 1) forces the `--seed`
refresh (step 10). Each consolidated bin keeps `createCli` for top-level
`--help`/`--version`/bare invocation and routes `positionals[0]` to a
per-subcommand handler that `await import()`s its own module; top-level flags
stay with libcli. Handlers reproduce each predecessor bin's positional parsing
and stdout byte-for-byte.

Libraries used: librag → libcli, libpreflight, libresource, libgraph, libvector,
librpc, libtype, libstorage, libtelemetry, libconfig, libutil; libcodegen →
libconfig (new direct dep), libstorage, libutil (`createBundleDownloader`,
`execLine`), plus optional `@grpc/proto-loader`, `mustache`, `protobufjs-cli`.

## Step 1: Create `librag` with `fit-process` and `fit-rag`

Introduce the aggregator library holding both bins and six delegating command
modules; no processing or query logic lives here.

Created:

- `libraries/librag/package.json` — `@forwardimpact/librag`, ESM. `bin`:
  `{ "fit-process": "./bin/fit-process.js", "fit-rag": "./bin/fit-rag.js" }`.
  `dependencies`: libcli, libpreflight, libresource, libgraph, libvector,
  librpc, libtype, libstorage, libtelemetry, libconfig, libutil — every package
  a ported handler imports, declared even though `librpc`/`libtype` are reached
  only through the `vectors`/`search` closures (the `workspace-imports`
  invariant flags an undeclared import, static or dynamic). Copy each real `^`
  pin from the current libvector/libgraph manifests; the library manifest uses
  those pins, not the launcher's `0.0.0`. `description`, `keywords` (last token
  `agent`), and a `jobs` block per [libraries/CLAUDE.md](../../libraries/CLAUDE.md).
- `libraries/librag/README.md` — purpose, the two bins, one composition example.
- `libraries/librag/src/commands/resources.js`, `graphs.js`, `vectors.js`,
  `search.js`, `query.js`, `subjects.js` — each exports `run({ positionals,
  values, runtime, cli })` and `await import()`s libresource/libgraph/libvector
  inside `run`, porting the body of the matching old bin verbatim (construct the
  same index + processor, keep each bin's own actor constant — `graphs` uses
  `"cld:common.System.root"`, `vectors` uses `"common.System.root"`; do not
  unify — and the same stdout). Preserve exact
  output: `query` prints `String(identifier)` per line; `search` prints
  `` `${String(identifier)}\t${identifier.score?.toFixed(4) ?? ""}` ``;
  `subjects` prints `` `${subject}\t${type}` ``; the three write commands
  delegate to their processor. `search`/`vectors` build the embedding client
  inside `run` (offline commands never touch it).
- `libraries/librag/bin/fit-process.js` — `createCli` with `name:
  "fit-process"`, a `commands` array (`resources` carrying the `base`/`-b`
  option, `graphs`, `vectors`) for help rendering, and `globalOptions`
  (`help`/`version`/`json`). `main()` calls `cli.parse`; on a non-null parse,
  routes `positionals[0]` through a `HANDLERS` map to the command module's
  `run`, else `cli.usageError` + exit 2.
- `libraries/librag/bin/fit-rag.js` — same shape, commands `search` (usage
  `<query>`), `query` (usage `<subject> <predicate> <object>`), `subjects`
  (usage `[type]`), plus the `documentation` array moved from the old
  `fit-search`/`fit-query` bins (`search-semantically`, `query-graph`,
  ground-agents index).
- `libraries/librag/test/librag.test.js` — per-subcommand stdout snapshots
  asserting byte-parity with fixtures captured from the old bins (criterion 2).

Verification: `cd libraries/librag && bun test` passes; `node bin/fit-rag.js
--help` and `node bin/fit-process.js --help` list their subcommands.

## Step 2: Remove the six old RAG bins from their host libraries

Delete the wrappers and their `bin`/`exports` map entries; the library `src/`
APIs `librag` delegates to are untouched.

Deleted:

- `libraries/libresource/bin/fit-process-resources.js`
- `libraries/libgraph/bin/{fit-process-graphs,fit-query,fit-subjects}.js`
- `libraries/libvector/bin/{fit-process-vectors,fit-search}.js`

Modified:

- `libraries/libresource/package.json` — drop the `fit-process-resources` `bin`
  key.
- `libraries/libgraph/package.json` — drop the three `bin` keys.
- `libraries/libvector/package.json` — drop the two `bin` keys and the two
  `./bin/*.js` `exports` entries (keep `./index/vector.js`,
  `./processor/vector.js`).

Verification: `rg -l 'fit-(process-\w+|search|query|subjects)' libraries/*/package.json`
returns nothing.

## Step 3: Swap the RAG launchers

Replace six launcher packages with two, matching the `public-cli-set` two-line
shape and `0.0.0` pins.

Deleted: `launchers/fit-process-resources`, `launchers/fit-process-graphs`,
`launchers/fit-process-vectors`, `launchers/fit-search`, `launchers/fit-query`,
`launchers/fit-subjects`.

Created:

- `launchers/fit-process/` — `package.json` (name `fit-process`, `bin` →
  `./bin/fit-process.js`, dep `@forwardimpact/librag: 0.0.0`, allowed-keys
  schema per the current `launchers/fit-search/package.json`) and
  `bin/fit-process.js` = `#!/usr/bin/env node` + `import
  "@forwardimpact/librag/bin/fit-process.js";`.
- `launchers/fit-rag/` — same, `bin/fit-rag.js` importing
  `@forwardimpact/librag/bin/fit-rag.js`.

Add both `./bin/*.js` subpaths to `libraries/librag/package.json` `exports` so
the launcher imports resolve.

Verification: `node launchers/fit-process/bin/fit-process.js --help` and the
`fit-rag` launcher resolve their `@forwardimpact/librag` import and print help
(the `public-cli-set` invariant clears in step 10, after the doc/skill rewrites).

## Step 4: Give `fit-codegen` `generate` and `download` subcommands

Split the bin into a thin dispatcher plus two command modules; gate the
proto-compiler toolchain behind `optionalDependencies`.

Created:

- `libraries/libcodegen/src/commands/generate.js` — exports `run({ values,
  runtime, cli })`; holds today's generation body (`parseFlags`,
  `discoverProtoDirs`, `createBundle`, the Codegen* orchestration). Its first
  statement is `await import("../long-init.js")`, then guarded `await import()`
  of `@grpc/proto-loader`/`mustache`/`protobufjs-cli`; on
  `ERR_MODULE_NOT_FOUND` print a reinstall hint (`npm install
  @forwardimpact/libcodegen` with optional deps) and exit non-zero.
- `libraries/libcodegen/src/commands/download.js` — exports `run(...)`; ports
  `fit-download-bundle`'s body — `createScriptConfig("download-bundle")`,
  `createBundleDownloader(createStorage, logger, runtime)`, `downloader.download()`,
  `execLine(0, { spawn, process })`.

Modified:

- `libraries/libcodegen/bin/fit-codegen.js` — drop the static `long-init`,
  `@grpc/proto-loader`, `mustache`, and Codegen* imports. `createCli` with a
  `commands` array: `generate` (carrying the existing `--all/--type/--service/
  --client/--definition/--metadata` options and examples) and `download`.
  `main()` routes `positionals[0]` to the module's `run` via `await import()`;
  no subcommand → `cli.showHelp()`. This changes bare `fit-codegen` from the old
  `usageError` + exit 2 to help + exit 0 — an intended shift to the subcommand
  surface, not a regression.
- `libraries/libcodegen/package.json` — move `@grpc/proto-loader`, `mustache`,
  `protobufjs-cli` from `dependencies` to `optionalDependencies`; add
  `@forwardimpact/libconfig` (download needs `createScriptConfig`); keep
  `protobufjs` in `dependencies`.

Verification: `node bin/fit-codegen.js generate --all` regenerates code; `node
bin/fit-codegen.js download --help` prints usage (criterion 4). For criterion 6,
`npm install @forwardimpact/libcodegen --omit=optional` into a scratch dir yields
a `node_modules` with no `@grpc/proto-loader`, `mustache`, or `protobufjs-cli`,
`download` still runs, and `generate` prints the reinstall hint.

## Step 5: Remove `fit-download-bundle` from `libutil`

Drop only the bin; the reusable helpers stay exported for libcodegen.

Deleted: `libraries/libutil/bin/fit-download-bundle.js`.

Modified: `libraries/libutil/package.json` — remove the `fit-download-bundle`
`bin` key and the `./bin/fit-download-bundle.js` `exports` entry (keep
`fit-tiktoken`). Confirm `createBundleDownloader` and `execLine` remain exported
from `src/index.js`.

Verification: `rg fit-download-bundle libraries/libutil` returns nothing;
`libcodegen/src/commands/download.js` still imports the two helpers.

## Step 6: Update the binary manifest

Swap the CLI inventory that drives the build matrix and cask binaries.

Modified: `build/cli-manifest.json` — remove the `fit-process-resources`,
`fit-process-graphs`, `fit-process-vectors`, `fit-search`, `fit-query`,
`fit-subjects`, and `fit-download-bundle` entries; add `fit-process` and
`fit-rag` (targets `["bun-linux-x64","bun-linux-arm64","bun-darwin-arm64"]`,
`bundle: "gear"`). Leave the `fit-codegen` entry (still one bin).

Verification: `jq '.clis[].name' build/cli-manifest.json` shows `fit-process`
and `fit-rag`, none of the seven removed names.

## Step 7: Migrate internal call sites

Point every live invocation at the new commands.

Modified:

| File | Change |
| --- | --- |
| `justfile` | RAG recipes → `fit-process resources\|graphs\|vectors` and `fit-rag search\|query\|subjects` (workspace `@forwardimpact/librag`); codegen recipes → `fit-codegen generate [--flag]`; line 267 `fit-download-bundle` → `fit-codegen download` (workspace `@forwardimpact/libcodegen`) |
| `.github/workflows/build-binaries.yml` | The `fit-codegen` smoke gate (lines 82–92) invokes `"$BIN" generate --service --client --definition` |
| `Dockerfile` | Entrypoint `fit-download-bundle` → `fit-codegen download`, preserving the existing `../../node_modules/.bin/` invocation form: `CMD ["bun","run","../../node_modules/.bin/fit-codegen","download","--","bun","server.js"]` |
| `CLAUDE.md` | `npx fit-codegen --all` → `npx fit-codegen generate --all`; the `just codegen … runs fit-codegen` line unchanged in meaning |

Verification: criterion 7 — `rg -n 'fit-(process-\w+|search|query|subjects|download-bundle)|fit-codegen --' justfile Dockerfile .github CLAUDE.md`
finds no removed form.

## Step 8: Update skills

Delete the three read skills, add the two consolidated skills, and teach
`fit-codegen` its subcommands. Skill `## Documentation` mirrors the CLI
`documentation` array (per [.claude/skills/CLAUDE.md](../../.claude/skills/CLAUDE.md)),
bare CLI names, no `npx`.

Deleted: `.claude/skills/fit-search`, `.claude/skills/fit-query`,
`.claude/skills/fit-subjects`.

Created:

- `.claude/skills/fit-rag/SKILL.md` — `name: fit-rag`; documents `fit-rag
  search`, `fit-rag query`, `fit-rag subjects` with per-subcommand usage; `##
  Documentation` = the `search-semantically`, `query-graph`, and ground-agents
  index links (matching the `fit-rag` CLI `documentation` array from step 1).
- `.claude/skills/fit-process/SKILL.md` — `name: fit-process`; documents
  `resources`/`graphs`/`vectors`; no `## Documentation` (the CLI carries no
  `documentation` array).

Modified: `.claude/skills/fit-codegen/SKILL.md` — usage becomes `fit-codegen
generate …` and `fit-codegen download`; `## Documentation` unchanged.

Verification: `bunx coaligned instructions` and `bunx coaligned` are clean;
`.claude/skills/fit-{search,query,subjects}` absent, `fit-rag`/`fit-process`
present (criterion 8).

## Step 9: Update docs, catalogs, and the Gear page

Rewrite every invocation to the consolidated surface; keep all published slugs.

Modified:

| File(s) | Change |
| --- | --- |
| `websites/fit/docs/libraries/ground-agents/index.md` | `fit-process-*` → `fit-process <stage>`; `fit-search`/`fit-query`/`fit-subjects` → `fit-rag <sub>`; slugs unchanged |
| `.../ground-agents/query-graph/index.md`, `.../search-semantically/index.md`, `.../resolve-resource/index.md` | Same invocation rewrites; page titles/slugs kept |
| `websites/fit/docs/internals/vectors/index.md` | Table + invocations → `fit-process vectors`, `fit-rag search`; bin paths → `libraries/librag/src/commands/` |
| `websites/fit/docs/internals/release/index.md` | Cask listing: drop the seven removed names, add `fit-process`, `fit-rag`, and update the hand-maintained CLI count cell (29 → 24) |
| Every `fit-codegen --*` invocation under `websites/` | → `fit-codegen generate --*`. Beyond typed-contracts and the engineer guide, this covers `websites/fit/docs/services/{integrate-standard,prove-changes,ground-agents,embed-text,typed-contracts/add-service}/index.md`, `websites/fit/docs/libraries/service-lifecycle/index.md` (including its `"up": "npx fit-codegen --all"` config block), and `websites/fit/guide/index.md` |
| `libraries/README.md` catalog + jobs | Regenerated to include `librag`, drop the RAG bin rows (via `context:fix`) |

- `websites/fit/gear/index.md` — the `enum:libraries-list:count` span and the
  "Ground Agents in Context" card copy: leave the card wording (it already
  describes the unified retrieval surface); the count refreshes in step 10.

Verification: `rg` across `websites/`, `libraries/README.md` for the seven
removed names, plus `rg -n 'fit-codegen --[a-z]' websites/`, finds no live hit
(criteria 7, 9).

## Step 10: Regenerate and verify

Run the generators, then the full gate.

- `bun install` (new/removed workspace members resolve).
- `bun run context:fix` — regenerates `libraries/README.md` catalog/jobs.
- `bunx coaligned invariants --seed enumeration-drift` — refreshes the
  `libraries-list` count in `websites/fit/gear/index.md` (increments by one for
  `librag`).
- `bun run check` and `bunx coaligned` — green (criterion 10).

Verification: `bun run check` and `bunx coaligned` exit 0; spot-run
`fit-process resources --base=… && fit-process graphs && fit-process vectors`
then `fit-rag query`/`search`/`subjects` reproduce the old stdout (criteria 1, 2).

## Execution

Single implementer, one PR — the `public-cli-set` and `enumeration-drift`
invariants keep the repo red until launchers, docs, skills, and `librag` all
land together, so the steps are not independently mergeable. Route the whole
plan to an engineering agent; steps 1–7 are code, 8–9 are docs/skills the same
agent carries since the invariants bind them to the launcher swap. Execute in
order: 1→2→3 (RAG), 4→5 (codegen), 6→7 (call sites), 8→9 (skills/docs), 10
(regenerate + gate).

## Risks

- **Command-scoped options.** `--base` (resources) and the generation flags
  (generate) must parse when their subcommand is present. `cli.parse` accepts a
  leading positional, but confirm libcli surfaces command-level `options`
  (declared on the `commands` entry) rather than only `globalOptions`; if it
  does not, `--base` moves to `globalOptions` and the handler reads it there.
- **Embedding-service coupling in tests.** The `search`/`vectors` snapshot
  fixtures must be captured offline or stubbed; a live embedding call in
  `librag.test.js` makes criterion 2 flaky.
- **Three checks read the CLI names from different files.**
  `build/cli-manifest.json` (step 6), `launchers/` (step 3), and doc invocations
  (step 9) each feed a separate gate; a name missed in one turns a different
  check red than where the omission lives.
