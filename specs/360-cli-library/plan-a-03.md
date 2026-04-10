# 360 Part 03 — Migrate library CLIs

Migrate all 22 library CLIs to use libcli. Grouped by complexity from highest to
lowest.

**Depends on:** Part 01 (libcli library must exist).

## Overview

Library CLIs fall into four tiers of migration complexity:

| Tier          | CLIs                                                                                                          | Migration scope                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Full**      | fit-codegen, fit-eval, fit-universe, fit-storage, fit-doc                                                     | Structured definition, help rewrite, error standardization          |
| **Medium**    | fit-rc, fit-svscan, fit-logger                                                                                | Already use parseArgs + Logger; wire definition, standardize errors |
| **Light**     | fit-query, fit-subjects, fit-search, fit-completion, fit-window, fit-tiktoken, fit-unary, fit-download-bundle | Minimal CLIs; add definition + help, standardize error output       |
| **Processor** | fit-process-agents, fit-process-graphs, fit-process-resources, fit-process-tools, fit-process-vectors         | No user-facing interface; add Logger for errors, minimal help       |
| **Repl**      | fit-visualize                                                                                                 | Repl-based; add initial --help parsing only                         |

For every CLI: add `@forwardimpact/libcli` to the package's `dependencies` in
`package.json`.

## Tier 1: Full migration

### fit-codegen (`libraries/libcodegen/bin/fit-codegen.js`)

**Current:** 354 lines. `printUsage()` function (line 58), `parseFlags()` with
`node:util parseArgs` (line 75), `printSummary()` function (line 205),
`console.stderr.write` for errors (lines 345, 351).

**Changes:**

1. Create definition:

   ```js
   const definition = {
     name: "fit-codegen",
     version: VERSION,
     description: "Generate protobuf types, service clients, and definitions",
     options: {
       all:        { type: "boolean", description: "Generate all code" },
       type:       { type: "boolean", description: "Generate protobuf types only" },
       service:    { type: "boolean", description: "Generate service bases only" },
       client:     { type: "boolean", description: "Generate clients only" },
       definition: { type: "boolean", description: "Generate service definitions only" },
       help:       { type: "boolean", short: "h", description: "Show this help" },
       version:    { type: "boolean", description: "Show version" },
     },
     examples: [
       "npx fit-codegen --all",
       "npx fit-codegen --type",
       "npx fit-codegen --service",
     ],
   };
   ```

2. Replace `printUsage()` and `parseFlags()` with `cli.parse()`.

3. Replace `printSummary()` with `SummaryRenderer`:

   ```js
   import { SummaryRenderer } from "@forwardimpact/libcli";
   const summary = new SummaryRenderer({ process });
   summary.render({
     title: `Generated ${totalFiles} files in ./${relPath}/`,
     items: dirs.map(dir => ({ label: `${dir.name}/`, description: dirLabels[dir.name] })),
   }, process.stdout);
   ```

4. Replace `process.stderr.write("Error: ...")` with `cli.error()`.

5. Wire Logger: already creates `new Logger("codegen")` (line 330). Use
   `logger.exception()` in catch blocks instead of raw stderr writes.

**Delete:** `printUsage()` (lines 58–69), `parseFlags()` (lines 75–113),
`printSummary()` (lines 205–237).

### fit-eval (`libraries/libeval/bin/fit-eval.js`)

**Current:** 101 lines. `HELP_TEXT` const (lines 15–63), manual
`process.argv.slice(2)` parsing (line 66), `console.error` for errors.

**Changes:**

1. Create definition with commands for `output`, `tee`, `run`, `supervise`.

2. Replace `HELP_TEXT` and manual arg parsing with `cli.parse()`.

3. The `run` and `supervise` commands accept many flags (`--task-file`,
   `--model`, etc.) that are parsed inside the command handlers, not at
   top-level. Keep these as-is — libcli parses the top-level command, each
   handler parses its own flags internally.

4. Replace `console.error` with `cli.error()` and `cli.usageError()`.

5. Add Logger: `const logger = createLogger("eval");` and use
   `logger.exception()` in the catch block.

**Delete:** `HELP_TEXT` const (lines 15–63), manual `--help`/`--version`
handling (lines 68–83).

### fit-universe (`libraries/libuniverse/bin/fit-universe.js`)

**Current:** 400 lines. `printHelp()` function (line 359), custom `parseArgs()`
function (lines 343–357), `console.error` for errors.

**Changes:**

1. Create definition with options for `--generate`, `--no-prose`, `--strict`,
   `--dry-run`, `--load`, `--only`, `--story`, `--cache`.

2. Replace custom `parseArgs()` and `printHelp()` with `cli.parse()`.

3. Replace `console.error` in the catch block with `cli.error()`.

4. Logger already created: `createLogger("universe")` (line 310). Use
   `logger.exception()` in the catch block.

**Delete:** `parseArgs()` (lines 343–357), `printHelp()` (lines 359–395).

### fit-storage (`libraries/libstorage/bin/fit-storage.js`)

**Current:** 191 lines. `help()` function as a command (line 154), `parseArgs`
from `node:util` (line 43), `console.error` for unknown commands.

**Changes:**

1. Create definition with commands: `create-bucket`, `wait`, `upload`,
   `download`, `list`.

2. Replace the `help` command and `values.help` check with `cli.parse()`.

3. Replace `console.error("Unknown command: ...")` with `cli.usageError()`.

4. Add Logger for errors.

**Delete:** `help()` command function (lines 154–179).

### fit-doc (`libraries/libdoc/bin/fit-doc.js`)

**Current:** 143 lines. `USAGE` const (lines 14–34), `parseArgs` from
`node:util` (line 4), `error()` function (line 39).

**Changes:**

1. Create definition with commands: `build` (implied default), `serve`.

2. Replace `USAGE` and `error()` with `cli.parse()` and `cli.error()`.

3. Add Logger for errors.

**Delete:** `USAGE` const (lines 14–34), `error()` function (lines 39–43).

## Tier 2: Medium migration

### fit-rc (`libraries/librc/bin/fit-rc.js`)

**Current:** 74 lines. `help()` function using `logger.info` (line 33),
`parseArgs` (line 6), Logger with silent wrapper (lines 21–28).

**Changes:**

1. Create definition with commands: `start`, `stop`, `status`, `restart`.

2. Replace `help()` function with `cli.parse()`.

3. Replace `logger.error("main", "Unknown command", ...)` (line 69) with
   `cli.usageError()`.

4. Keep the silent Logger wrapper pattern — fit-rc's `--silent` flag suppresses
   info/debug output. This aligns with the spec's `--silent`/`--quiet`
   convention.

**Delete:** `help()` function (lines 33–41), manual help check (lines 43–46).

### fit-svscan (`libraries/libsupervise/bin/fit-svscan.js`)

**Current:** 187 lines. No help text. `parseArgs` (line 10) for `--socket`,
`--pid`, `--logdir`, `--timeout`. Logger for errors.

**Changes:**

1. Create definition with options for `socket`, `pid`, `logdir`, `timeout`.

2. Replace the manual arg check (line 40) with `cli.parse()` + validation.

3. Replace `logger.error("main", "Missing required arguments...")` (line 41)
   with `cli.usageError()`.

4. Logger already wired correctly.

### fit-logger (`libraries/libsupervise/bin/fit-logger.js`)

**Current:** 61 lines. Minimal. `parseArgs` (line 2) for `--dir`,
`--maxFileSize`, `--maxFiles`. `console.error` for missing `--dir`.

**Changes:**

1. Create definition with required `--dir` option and optional size/count
   limits.

2. Replace manual error with `cli.usageError()`.

3. Add Logger for errors.

## Tier 3: Light migration

These CLIs are 25–35 lines each. The migration is mechanical: add a definition,
use `cli.parse()`, standardize error output.

### fit-query (`libraries/libgraph/bin/fit-query.js`)

**Current:** 31 lines. Inline usage string (line 12), manual `process.argv`
parsing, `console.error`.

**Changes:**

```js
const definition = {
  name: "fit-query",
  version: VERSION,
  description: "Query the graph index with a triple pattern",
  usage: "fit-query <subject> <predicate> <object>",
  options: { help: { type: "boolean", short: "h", description: "Show this help" } },
  examples: ['fit-query "?" rdf:type schema:Person'],
};

const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

if (parsed.positionals.length !== 3) {
  cli.usageError("expected 3 arguments: <subject> <predicate> <object>");
  process.exit(2);
}
```

Add Logger: `const logger = createLogger("query");` and use `logger.exception()`
in the catch block.

### fit-subjects (`libraries/libgraph/bin/fit-subjects.js`)

Same pattern as fit-query. Add definition, use `cli.parse()`, standardize
errors.

### fit-search (`libraries/libvector/bin/fit-search.js`)

Add definition, use `cli.parse()`, standardize errors.

### fit-completion (`libraries/libllm/bin/fit-completion.js`)

Add definition, use `cli.parse()`, standardize errors.

### fit-window (`libraries/libmemory/bin/fit-window.js`)

Add definition, use `cli.parse()`, standardize errors.

### fit-tiktoken (`libraries/libutil/bin/fit-tiktoken.js`)

**Current:** 33 lines. Reads from argv or stdin. Minimal inline error.

Add definition with usage string. Use `cli.parse()`. Standardize error.

### fit-unary (`libraries/librpc/bin/fit-unary.js`)

**Current:** 33 lines. Manual argv parsing, `console.error` for errors.

Add definition with usage `fit-unary <service> <method> [json]`. Use
`cli.parse()`. Standardize errors.

### fit-download-bundle (`libraries/libutil/bin/fit-download-bundle.js`)

**Current:** 27 lines. No help, no args. `console.error` in catch.

Add minimal definition. Use `cli.error()` in catch block. Logger already
created.

## Tier 4: Processor CLIs

These CLIs have no user-facing help and take no arguments. They are batch
processors run as part of internal pipelines.

### Shared pattern

For each processor CLI, the migration is:

1. Add a minimal definition (name, version, description).
2. Use `cli.parse()` to handle `--help` (adds discoverability).
3. Ensure Logger is created and used for error output.
4. Replace `console.error` in catch blocks with `logger.exception()`.

### fit-process-agents (`libraries/libagent/bin/fit-process-agents.js`)

**Current:** 28 lines. No error handling, no help. Logger created.

Add `cli.parse()` for `--help` support. Add catch block with
`logger.exception()`.

### fit-process-graphs (`libraries/libgraph/bin/fit-process-graphs.js`)

**Current:** 31 lines. Logger created. `logger.exception()` already in catch.

Add `cli.parse()` for `--help`. Error handling already correct.

### fit-process-resources (`libraries/libresource/bin/fit-process-resources.js`)

Same pattern. Add `cli.parse()`. Ensure Logger and error handling.

### fit-process-tools (`libraries/libtool/bin/fit-process-tools.js`)

Same pattern.

### fit-process-vectors (`libraries/libvector/bin/fit-process-vectors.js`)

Same pattern.

## Tier 5: Repl-based

### fit-visualize (`libraries/libtelemetry/bin/fit-visualize.js`)

**Current:** 90 lines. Repl-based interactive CLI with usage string in Repl
config.

Same approach as fit-guide: add definition, use `cli.parse()` for initial
`--help`/`--version`, then enter Repl session unchanged.

## Package.json updates

Every library package that has a CLI needs `@forwardimpact/libcli` added to
`dependencies`. The affected packages:

| Package                               | CLIs                                        |
| ------------------------------------- | ------------------------------------------- |
| `libraries/libcodegen/package.json`   | fit-codegen                                 |
| `libraries/libeval/package.json`      | fit-eval                                    |
| `libraries/libuniverse/package.json`  | fit-universe                                |
| `libraries/libstorage/package.json`   | fit-storage                                 |
| `libraries/libdoc/package.json`       | fit-doc                                     |
| `libraries/librc/package.json`        | fit-rc                                      |
| `libraries/libsupervise/package.json` | fit-svscan, fit-logger                      |
| `libraries/libgraph/package.json`     | fit-query, fit-subjects, fit-process-graphs |
| `libraries/libvector/package.json`    | fit-search, fit-process-vectors             |
| `libraries/libllm/package.json`       | fit-completion                              |
| `libraries/libmemory/package.json`    | fit-window                                  |
| `libraries/librpc/package.json`       | fit-unary                                   |
| `libraries/libutil/package.json`      | fit-tiktoken, fit-download-bundle           |
| `libraries/libagent/package.json`     | fit-process-agents                          |
| `libraries/libresource/package.json`  | fit-process-resources                       |
| `libraries/libtool/package.json`      | fit-process-tools                           |
| `libraries/libtelemetry/package.json` | fit-visualize                               |

All add: `"@forwardimpact/libcli": "workspace:*"` to `dependencies`.

## Execution order

No strict order between tiers — they are independent. Recommended:

1. Tier 1 CLIs first (most impactful, validates the API)
2. Tier 2 and 3 in any order
3. Tier 4 and 5 last (least impactful)

Within each tier, any order works.

## Verification

After all migrations:

```sh
bun install
bun run check
bun run test
```

Spot-check at least one CLI from each tier:

```sh
# Tier 1
bunx fit-codegen --help
bunx fit-codegen --help --json
bunx fit-eval --help

# Tier 2
bunx fit-rc --help

# Tier 3
bunx fit-query --help

# Tier 4
bunx fit-process-agents --help

# Tier 5
bunx fit-visualize --help
```

Verify error format for at least one CLI:

```sh
bunx fit-codegen 2>&1  # Should show "fit-codegen: error: ..." or help
bunx fit-rc badcmd     # Should show "fit-rc: error: unknown command..."
```
