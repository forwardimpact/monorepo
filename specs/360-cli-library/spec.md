# 360 — CLI Library

The monorepo ships 25+ CLI programs (`fit-pathway`, `fit-map`, `fit-codegen`,
`fit-query`, `fit-universe`, `fit-eval`, `fit-rc`, `fit-guide`, and many more).
Each one formats help text, error messages, and result summaries differently.
This inconsistency degrades the product suite's perceived quality and actively
harms both human and agent users.

## Why this matters

### Every CLI looks like a different product

No two CLIs produce help text the same way. Observed patterns across the
codebase:

| CLI            | Help format                        | Error format               | Summary format               |
| -------------- | ---------------------------------- | -------------------------- | ---------------------------- |
| fit-pathway    | `HELP_TEXT` const, 150-line block  | `formatError()` from local | `formatTable()` from local   |
| fit-map        | `showHelp()` function              | `console.error()`          | custom counts table          |
| fit-codegen    | `printUsage()` with array.join     | `logger.error()`           | `printSummary()` custom      |
| fit-eval       | `HELP_TEXT` const with `.trim()`   | raw `console.error()`      | delegated per-command        |
| fit-rc         | `help()` via `logger.info()` calls | `logger.exception()`       | logger-based                 |
| fit-query      | inline `console.error()` one-liner | `console.error()`          | one value per line           |
| fit-universe   | `printHelp()` function             | `process.exit(1)`          | `printReport()` with ✓/✗    |

Formatting utilities exist only inside pathway's `src/lib/cli-output.js` —
271 lines of color handling, table formatting, and section helpers that no other
CLI can reach because they live in a product, not a library.

### Output is hostile to AI agents

AI agents are primary consumers of these CLIs (CLAUDE.md lists agents as a core
user group). Current help text is designed for leisurely human reading, not
programmatic consumption:

- **Multi-line sprawl.** `fit-pathway --help` produces 150+ lines with
  horizontal rules, section headers, and blank lines. An agent running
  `fit-pathway -h | grep interview` gets a fragment with no usage syntax.
  Ideally, each command should appear as a self-contained single line that
  includes the command name, arguments, and description — so a grep for any
  keyword returns a complete, actionable line.

- **Inconsistent flag documentation.** Some CLIs document flags as
  `--flag=VALUE`, others as `--flag VALUE`, others show only the flag name with
  no value hint. Agents that parse `--help` output to discover available flags
  encounter a different micro-format in every tool.

- **No machine-readable option.** None of the CLIs offer `--help --json` or
  equivalent structured output. Agents must regex-parse free-form text that
  varies per CLI.

### Boilerplate is duplicated everywhere

Every CLI re-implements the same setup sequence:

1. Parse arguments (11 use `node:util parseArgs`, others parse `process.argv` manually)
2. Handle `--help` and `--version` flags
3. Dispatch to a command handler
4. Format errors and write to stderr
5. Set exit codes

This boilerplate ranges from 30 lines (fit-query) to 440 lines (fit-pathway).
The repetition means inconsistencies are baked in at authoring time — there is
no shared code to keep them aligned.

### Error handling is a lottery

Errors reach the user through at least five different mechanisms:

- `console.error("Error: " + message)` then `process.exit(1)`
- `process.stderr.write()` then `process.exit(1)`
- `logger.error()` (libtelemetry) with RFC 5424 structured format
- `logger.exception()` for stack traces
- `formatError()` (pathway-local, ANSI red) then `process.exit(1)`

A user or agent encountering an error in fit-map sees a different shape than in
fit-codegen, which sees a different shape than in fit-rc. Error handling should
be invisible infrastructure, not a per-CLI design decision.

## What changes

Introduce `libcli` as a new library under `libraries/libcli/` that provides the
shared infrastructure every CLI in the monorepo needs. Then migrate existing
CLIs to use it, eliminating per-CLI formatting code and establishing a
consistent output contract.

### Help text

libcli defines a structured help format that every CLI uses. Help text is
declared as data (command name, description, arguments, flags, examples), not
authored as template strings. libcli renders it in two modes:

- **Human mode** (default when stdout is a TTY): formatted for readability with
  aligned columns, grouped sections, and optional color.
- **Machine mode** (when piped, or with `--help --json`): structured JSON that
  agents can parse without regex.

In both modes, the critical property: **every command occupies exactly one
line** containing the command name, its arguments, and its description. This
means `fit-pathway -h | grep interview` returns a complete, useful line. Section
headers and decoration are minimal — they exist to group, not to sprawl.

Example human-mode help (illustrative):

```
fit-pathway 1.2.0 — Career progression for engineering frameworks

Usage: fit-pathway <command> [options]

Commands:
  discipline <id>             Show discipline details
  capability <id>             Show capability details
  job <discipline> [options]  Derive a job definition
  agent <discipline>          Generate an agent profile
  interview <discipline>      Generate interview questions
  tool --list                 List derived tools

Options:
  --level=<id>    Target level (default: mid)
  --track=<id>    Apply track modifier
  --data=<path>   Framework data directory
  --json          Output as JSON
  --help, -h      Show this help
  --version       Show version

Examples:
  fit-pathway job backend --level=senior --track=lead
  fit-pathway interview backend --level=mid --json
```

### Summary output

After a command runs, CLIs produce a summary. libcli provides a standard
summary renderer that accepts structured data (counts, labels, status
indicators) and produces consistent output. Summaries are compact — a few lines,
not a screenful.

Example:

```
Generated 38 files in ./generated/
  definitions/  — Service definitions
  proto/        — Proto source files
  services/     — Service bases and clients
  types/        — Protocol Buffer types
```

This is already what fit-codegen produces today. libcli makes this the standard
pattern, not a one-off.

### Error output

All errors go to stderr with a consistent format:

```
fit-map: error: unknown command "valiate" (did you mean "validate"?)
fit-map: error: missing required argument <path>
```

The CLI name is always prefixed so errors are identifiable in pipelines and
logs. No ANSI color on stderr (it's frequently redirected). Exit code 1 for
runtime errors, 2 for usage errors (wrong arguments, unknown flags).

### Argument parsing

libcli wraps `node:util parseArgs` (already used by 17 CLIs) with a declarative
option definition that doubles as the source of truth for help text generation.
Flags, their types, defaults, and descriptions are defined once and used for
both parsing and help rendering. No separate `HELP_TEXT` string to maintain.

### When to use libtelemetry Logger

Every CLI creates a Logger via `createLogger(domain)` at startup and passes it
through the dependency chain. This is already the pattern in processor CLIs —
libcli makes it universal. Logger produces RFC 5424-structured output with typed
`[key="value"]` attributes that agents can parse without guessing — making it
the preferred output mechanism for most CLI output.

Today, Logger usage is inconsistent. fit-svscan and fit-rc use it well; fit-map,
fit-pathway, and fit-query don't use it at all; others use it only for exception
handling. The rule going forward is simple: **use Logger unless the output is
pure data that a caller will pipe or parse as the primary result.**

Decision matrix:

| Output type                        | Use Logger? | Why                                                     |
| ---------------------------------- | ----------- | ------------------------------------------------------- |
| Progress updates                   | Yes         | Structured attributes (`items="3/10"`) beat free text   |
| Processing status                  | Yes         | Agents can filter by level and parse attributes          |
| Errors and exceptions              | Yes         | Preserves trace context (`trace_id`, `span_id`)         |
| Warnings                           | Yes         | Consistent level filtering                              |
| Completion summaries               | Yes         | `logger.info` with structured counts                    |
| Startup/shutdown events            | Yes         | Operational context for debugging                       |
| Validation results                 | Yes         | Structured pass/fail with attributes                    |
| Help text                          | No          | Rendered by libcli, not operational output               |
| Pure data output (`--json`, query) | No          | Primary result for piping — `console.log` / stdout      |
| Version string                     | No          | Single value, rendered by libcli                         |

When in doubt, use Logger. Over-logging with structured attributes is better
than under-logging with raw `console.log` — an agent can always ignore Logger
output it doesn't need, but it can't extract structure from unstructured text.

Example of good Logger usage from the existing ProcessorBase pattern:

```
DEBUG 2026-04-10T12:00:00Z codegen generate 8821 MSG003 [step="types" files="12"] Generated protobuf types
INFO  2026-04-10T12:00:01Z codegen generate 8821 MSG007 [total="38"] Code generation complete
```

`--silent` / `--quiet` suppresses info/debug Logger output, following the
pattern fit-rc already uses. Error and exception output is never suppressed.

### Color and TTY handling

Pathway's `supportsColor()` logic (check `NO_COLOR`, `FORCE_COLOR`, TTY) moves
to libcli as the single implementation. The domain-specific formatters in
pathway's `cli-output.js` (skill proficiency colors, behaviour maturity colors)
stay in the pathway product — libcli provides the color primitives and TTY
detection, products provide domain-specific formatting.

### What happens to existing code

- **pathway's `cli-output.js`**: Generic utilities (color primitives,
  `formatTable`, `formatError`, `formatSection`, `supportsColor`) migrate to
  libcli. Domain-specific formatters (`formatSkillProficiency`,
  `formatBehaviourMaturity`, `formatModifier`) stay in pathway and import color
  primitives from libcli.
- **Each CLI's `bin/` entry point**: Shrinks to command registration and
  dispatch. Help text, argument parsing, error handling, and version display are
  handled by libcli.
- **Custom `parseArgs` implementations** (fit-pathway, fit-universe, fit-eval):
  Replaced by libcli's declarative option definitions.

### Internal documentation

A new internals page at `website/docs/internals/libcli/index.md` documents how
to build a CLI in this monorepo. This is the single reference for CLI
development conventions — not scattered across individual CLI source files or
tribal knowledge.

The page covers:

- **Logger conventions.** The decision matrix for when to use Logger vs
  `console.log`. How to create a Logger, what domain name to use, when to use
  `info` vs `debug` vs `error` vs `exception`, how to structure attributes for
  agent parseability, and the `--silent`/`--quiet` suppression pattern. Includes
  the RFC 5424 output format reference so contributors understand what agents
  see.

- **Help text.** How to declare commands and options as structured data, how
  libcli renders them, and the one-line-per-command property that makes grep
  work.

- **Error handling.** The standard error format (`cli-name: error: message`),
  exit codes (1 runtime, 2 usage), and why `logger.exception()` should be used
  in catch blocks instead of `console.error`.

- **Summary output.** How to use libcli's summary renderer for post-command
  output (counts, labels, status indicators).

- **Argument parsing.** How to define options declaratively so they serve both
  parsing and help generation.

- **Composition with other libraries.** When to use libformat (markdown content
  rendering), librepl (interactive sessions), and libtelemetry (operational
  diagnostics) alongside libcli.

- **Minimal CLI example.** A complete, runnable example showing the standard
  pattern from shebang to exit code — the template every new CLI should follow.

The internals index page (`website/docs/internals/index.md`) gains a card
linking to this new page.

## What this is not

- **A CLI framework like commander or yargs.** libcli is a thin library that
  wraps Node.js built-ins (`parseArgs`) and provides output formatting. It does
  not introduce subcommand routing trees, middleware chains, plugin systems, or
  lifecycle hooks. It follows the monorepo's dependency policy: prefer built-ins,
  keep it small.

- **A replacement for libformat.** libformat converts markdown to HTML or
  terminal output. libcli formats CLI-specific structures (help text, summaries,
  error messages). They are complementary — a CLI that renders markdown content
  (like fit-guide) would use libformat for content and libcli for chrome.

- **A replacement for librepl.** librepl provides interactive REPL sessions with
  command loops and state. libcli handles one-shot CLI invocations. A REPL-based
  CLI (fit-guide, fit-visualize) could use libcli for help formatting and
  argument parsing of the initial invocation, and librepl for the interactive
  session.

- **A replacement for libtelemetry.** libtelemetry provides the Logger class
  and will continue to own it. libcli _uses_ Logger for operational output and
  establishes conventions for when and how CLIs should log. libcli does not
  wrap, extend, or re-export Logger — CLIs import Logger from libtelemetry
  directly.

- **An architecture change.** libcli follows the existing OO+DI pattern: classes
  accept collaborators through constructors, factory functions wire
  implementations, tests inject mocks. This is the same pattern every other
  library in the monorepo uses.

## Success criteria

1. **One-line grep works.** For any CLI, `fit-<name> -h | grep <keyword>`
   returns a complete line with command name, arguments, and description
   whenever the keyword matches a command or option.

2. **Structured help available.** `fit-<name> -h --json` outputs a JSON object
   describing all commands, options, and their descriptions for every CLI.

3. **Consistent error format.** Every CLI prefixes errors with its name,
   writes to stderr, and uses exit code 1 (runtime) or 2 (usage).

4. **Help text defined as data.** No CLI contains a hand-authored `HELP_TEXT`
   template string. Commands, options, and descriptions are declared as
   structured objects that libcli renders.

5. **pathway's generic formatting in libcli.** `supportsColor`, `formatTable`,
   `formatError`, `formatSection`, `horizontalRule`, `indent`, `colorize`,
   and ANSI constants are importable from `@forwardimpact/libcli`, not from
   pathway's local `cli-output.js`.

6. **Boilerplate eliminated.** `--help`, `--version`, argument parsing, and
   error handling are no longer re-implemented per CLI. Each CLI's `bin/` entry
   point is shorter than it is today.

7. **No new dependencies.** libcli uses only Node.js built-ins and existing
   monorepo libraries. No external CLI framework is introduced.

8. **Every CLI creates a Logger.** Each CLI creates a Logger via
   `createLogger(domain)` at startup and uses it according to the decision
   matrix. CLIs that are predominantly pure-data output (e.g. fit-query,
   fit-subjects) still create a Logger for errors and exceptions — only their
   primary result uses `console.log`. Raw `console.error()` is not used in
   any CLI entry point.

9. **CLI development internals page exists.**
   `website/docs/internals/libcli/index.md` documents the standard CLI
   patterns: Logger decision matrix, help text declaration, error handling,
   summary rendering, argument parsing, and a complete minimal example. The
   internals index links to it.

## Out of scope

- Migrating librepl-based CLIs (fit-guide, fit-visualize) to a different
  interactive model. They would adopt libcli for initial argument parsing and
  help, but the REPL session itself is unchanged.
- Changing what any CLI _does_. This spec standardizes how CLIs present
  themselves, not their functionality.
- Adding new CLI commands or removing existing ones.
- TypeScript migration or type generation for libcli.
- Changing the npm distribution model or how external users install products.
