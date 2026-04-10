# 360 — CLI Library: Plan

## Strategy

Introduce `libraries/libcli/` as a new library providing structured help
rendering, argument parsing, error output, summary formatting, and color/TTY
utilities. Then migrate all 26 CLIs to use it, eliminating per-CLI formatting
code. Finally, add the internals documentation page.

The library follows the monorepo's OO+DI pattern: classes accept collaborators
through constructors, factory functions wire real implementations, tests inject
mocks. No external dependencies — only Node.js built-ins and existing monorepo
libraries (libtelemetry for Logger).

### API design

The core idea: **define a CLI's interface once as data, use it for both parsing
and help rendering.** A definition object describes the CLI's name, version,
description, commands, options, and examples. The `Cli` class consumes this
definition to parse arguments and render help. Command dispatch stays in the CLI
entry point — libcli is a thin library, not a framework.

#### Definition structure

```js
const definition = {
  name: "fit-pathway",
  version: "1.2.0",
  description: "Career progression for engineering frameworks",
  commands: [
    { name: "discipline", args: "<id>", description: "Show discipline details" },
    { name: "job", args: "<discipline> [options]", description: "Derive a job definition" },
  ],
  options: {
    level: { type: "string", description: "Target level (default: mid)" },
    track: { type: "string", description: "Apply track modifier" },
    json:  { type: "boolean", description: "Output as JSON" },
    help:  { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    "fit-pathway job backend --level=senior --track=lead",
    "fit-pathway interview backend --level=mid --json",
  ],
};
```

CLIs without subcommands omit `commands` and use a `usage` string instead:

```js
const definition = {
  name: "fit-query",
  version: "0.1.0",
  description: "Query the graph index with a triple pattern",
  usage: "fit-query <subject> <predicate> <object>",
  options: {
    help: { type: "boolean", short: "h", description: "Show this help" },
  },
  examples: ['fit-query "?" rdf:type schema:Person'],
};
```

#### Cli class

```js
class Cli {
  constructor(definition, { process, helpRenderer })

  parse(argv)       // Returns { values, positionals } or null if --help/--version handled
  error(message)    // Writes "name: error: message" to stderr, sets exitCode = 1
  usageError(message) // Same but exitCode = 2
}
```

`parse()` wraps `node:util parseArgs` (always `strict: true`) using the
definition's options, handles `--help` (with `--json` support) and `--version`
internally, and returns parsed results or `null` when it handled the request
itself. This eliminates the per-CLI boilerplate of checking for help/version
flags.

**Every CLI declares every flag it accepts.** There is no `strict: false` mode,
no `prescreen()`, no pass-through of unknown flags. CLIs that previously
delegated flag parsing to sub-command handlers (fit-eval) or to a Repl
(fit-guide, fit-visualize) are restructured:

- **fit-eval**: All sub-command flags (`--task-file`, `--model`,
  `--max-turns`, etc.) move into the top-level definition. Handlers receive
  parsed `values` instead of raw argv. The custom `parseFlag()` function is
  deleted. Unused flags for a given sub-command are harmlessly `undefined`.
- **fit-guide, fit-visualize**: CLI flags (`--init`, `--data`, `--streaming`)
  move out of the Repl's `commands` config and into the libcli definition. The
  CLI entry point handles them before starting the Repl. The Repl becomes
  purely interactive — no CLI flag parsing.

Typical entry point pattern after migration:

```js
const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values, positionals } = parsed;
const [command, ...args] = positionals;
const handler = COMMANDS[command];

if (!handler) {
  cli.usageError(`unknown command "${command}"`);
  process.exit(2);
}

try {
  await handler({ values, args });
} catch (error) {
  cli.error(error.message);
  process.exit(1);
}
```

#### HelpRenderer class

```js
class HelpRenderer {
  constructor({ process })

  render(definition, stream)     // Human-mode: formatted, optional color
  renderJson(definition, stream) // Machine-mode: JSON structure
}
```

Human-mode output follows the spec's format: header line
(`name version — description`), usage, commands (one per line, aligned columns),
options (one per line, aligned), examples. The one-line-per-command property
makes `fit-name -h | grep keyword` return a complete, actionable line.

Machine-mode (`--help --json`) outputs the definition as a JSON object
describing all commands, options, and descriptions.

#### SummaryRenderer class

```js
class SummaryRenderer {
  constructor({ process })

  render({ title, items }, stream)  // "title\n  label  — description\n..."
}
```

Accepts a title string and an array of `{ label, description }` items. Pads
labels for column alignment. `stream` defaults to `this.#proc.stdout` when
omitted. This standardizes the pattern already used by fit-codegen's
`printSummary()`.

#### Color and formatting (migrated from pathway)

Generic utilities move from `products/pathway/src/lib/cli-output.js` to libcli:

- `colors` object (ANSI constants)
- `supportsColor(process)` — checks `NO_COLOR`, `FORCE_COLOR`, TTY
- `colorize(text, color, process)` — conditional ANSI wrapping
- `formatTable(headers, rows, options)` — aligned columns with optional
  separator
- `formatHeader(text)`, `formatSubheader(text)` — bold/cyan text
- `formatListItem(label, value, indent)`, `formatBullet(text, indent)`
- `formatSection(title, content)`, `horizontalRule(width)`,
  `indent(text, spaces)`
- `formatError(message)`, `formatSuccess(message)`, `formatWarning(message)`

Domain-specific formatters stay in pathway:

- `formatSkillProficiency(level)` — imports `colorize`, `colors` from libcli
- `formatBehaviourMaturity(maturity)` — same
- `formatModifier(modifier)`, `formatPercent(value)`, `formatChange(change)` —
  same

The key change to `supportsColor`: accept a `process` parameter for testability,
instead of reading `process` as a module global. Same for `colorize`.

### Dependency direction

```
libcli ← (no monorepo dependencies; only node:util built-in)
  ↑
  ├── products/pathway (imports color primitives + Cli)
  ├── products/map (imports Cli)
  ├── products/guide (imports Cli for initial parsing)
  ├── products/basecamp (imports Cli)
  └── libraries/* (import Cli or just error())
```

libtelemetry is NOT a dependency of libcli. The spec is explicit: "libcli does
not wrap, extend, or re-export Logger — CLIs import Logger from libtelemetry
directly." libcli and libtelemetry are peers — both used by CLI entry points.

## Parts

| Part               | Scope                                                | Depends on | Files               |
| ------------------ | ---------------------------------------------------- | ---------- | ------------------- |
| [01](plan-a-01.md) | Create libcli library                                | —          | ~12 new             |
| [02](plan-a-02.md) | Migrate product CLIs (pathway, map, guide)           | 01         | ~7 modified         |
| [03](plan-a-03.md) | Migrate library CLIs (22 CLIs across 17 packages)    | 01         | ~22 modified        |
| [04](plan-a-04.md) | Documentation (internals page, index update)         | 01         | ~2 new, 2 modified  |
| [05](plan-a-05.md) | Refactor Basecamp CLI to positional subcommands      | 01         | ~3 modified, 1 new  |
| [06](plan-a-06.md) | Update documentation referencing CLI output          | 02–05      | ~12 modified        |

Parts 02, 03, 04, and 05 all depend on part 01 but are independent of each
other. Part 06 depends on parts 02–05 (it updates documentation to match the
new CLI output formats, including basecamp's new positional subcommands).

## Cross-cutting concerns

### Testing

Every libcli class gets unit tests using `node:test` and libharness mocks. Key
test scenarios:

- `Cli.parse()` returns correct values for valid input
- `Cli.parse()` returns null and writes help when `--help` is passed
- `Cli.parse()` returns null and writes JSON help when `--help --json` is passed
- `Cli.parse()` returns null and writes version when `--version` is passed
- `Cli.parse()` throws on unknown flags (strict parseArgs, always)
- `Cli.error()` writes prefixed message to stderr and sets exitCode = 1
- `Cli.usageError()` sets exitCode = 2
- `HelpRenderer.render()` produces one-line-per-command output
- `HelpRenderer.renderJson()` produces valid JSON
- `SummaryRenderer.render()` aligns labels
- `supportsColor()` respects NO_COLOR, FORCE_COLOR, isTTY
- `formatTable()` aligns columns

Process is injected in constructors for testability — no reliance on global
`process`.

### Build and install

After creating `libraries/libcli/`, run `bun install` to register the workspace
package. Each migrated CLI's `package.json` gains `@forwardimpact/libcli` in
`dependencies`.

### Verification

After each part, run:

- `bun run check` — format and lint pass
- `bun run test` — all unit tests pass
- Manual smoke test: `bunx fit-<name> --help` produces new format,
  `bunx fit-<name> --help --json` produces JSON, error format matches
  `name: error: message`

## Risks

1. **pathway's 150-line HELP_TEXT** — The current help text has per-command
   sections with detailed usage blocks. The structured definition can only
   capture one-line-per-command summaries. Pathway may need per-command help
   (e.g. `fit-pathway job --help`) in a future iteration, but the spec's scope
   is the top-level help only. Per-command detailed help is out of scope.

2. **basecamp uses `#!/usr/bin/env bun`** — Unlike other CLIs that use
   `#!/usr/bin/env node`, basecamp uses bun directly. libcli's
   `node:util parseArgs` works in both runtimes, so this is not a blocker, but
   worth noting.

3. **Processor CLIs have no user-facing interface** — The `fit-process-*` CLIs
   (agents, graphs, resources, tools, vectors) have no help text, no arguments,
   and no error handling beyond a catch block. Migration is minimal: add Logger
   usage for error output and optionally wire `--help` for discoverability.
   Don't over-engineer these.

4. **Repl-based CLIs** — fit-guide and fit-visualize use librepl for interactive
   sessions. CLI flags (`--init`, `--data`, `--streaming`) move from the Repl's
   `commands` config to the libcli definition and are handled by the CLI entry
   point before starting the Repl. The Repl becomes purely interactive. The
   Repl's `commands` object loses its CLI flag entries but retains any truly
   interactive commands.

5. **Basecamp flag-to-subcommand refactor** — Part 05 converts basecamp from
   flag-based commands (`--daemon`, `--wake`, `--init`) to positional
   subcommands (`daemon`, `wake`, `init`). This is a breaking change with no
   backwards compatibility. All documentation and skill files referencing the
   old flag syntax must be updated in part 06.

6. **Documentation drift** — Part 06 updates all docs that show CLI output
   samples or reference CLI syntax. If any file is missed, external users see
   stale examples. The file list in part 06 was compiled by searching the full
   repo; the implementer should re-verify with a grep before committing.
