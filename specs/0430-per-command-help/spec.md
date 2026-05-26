# 430 — Per-command help in libcli

**Author:** D. Olsson **Created:** 2026-04-13 **Closes:** #335

## Problem

libcli supports only global help. Running `fit-summit --help` lists all commands
and all options in a single flat output. Running `fit-summit coverage --help`
does not show help for the `coverage` command — it dispatches to the command
handler, which fails on missing required arguments.

This is a known limitation from the original spec (360). Options are defined
globally and documented apart from the commands that use them. For CLIs with
many commands and options — Summit has 8 commands and 20+ options — the global
help becomes a wall of flags where users must mentally map which options apply
to which commands. The `what-if` command alone uses `--add`, `--remove`,
`--move`, `--to`, `--promote`, `--focus`, and `--allocation`, none of which
apply to any other command.

User testing (issue #335) confirmed this is a real discoverability problem.
Users expect `fit-summit coverage --help` to work the way `git commit --help`
does.

### Why a clean break

The current definition schema has `commands` and `options` as sibling arrays at
the top level. Retrofitting per-command options while preserving backward
compatibility would mean supporting two schemas (old flat + new per-command),
adding migration shims, and maintaining both code paths. The library has 27
consumers, all internal to the monorepo. A clean break — change the schema, then
migrate all consumers in one pass — is simpler and produces a cleaner result.

## Proposed solution

### Option scoping

Each option belongs to either a specific command or the CLI as a whole:

- **Command-specific options** apply only to the command they belong to. They
  appear in that command's per-command help and nowhere else.
- **Global options** (e.g. `--help`, `--data`, `--format`) apply to every
  command. They appear in both global and per-command help.

Commands may also carry per-command `examples` to improve discoverability.

CLIs with no commands (e.g. `fit-codegen`) have only global options.

The old flat-options schema is rejected at startup with a clear migration
message.

### Help output format

Both views — global and per-command — are designed for agent grep. The governing
rule from spec 0360 still applies: **every command and every option occupies
exactly one self-contained line.** A grep for any keyword returns a complete,
actionable line. Descriptions never wrap to a second line.

#### Global help (`fit-summit --help`)

```
fit-summit 1.0.0 — Team capability planning from skill data.

Usage: fit-summit <command> [options]

Commands:
  coverage <team>            Show capability coverage
  risks <team>               Show structural risks
  what-if <team>             Simulate roster changes
  growth <team>              Show growth opportunities aligned with team needs
  compare <team1> <team2>    Compare two teams' coverage and risks
  trajectory <team>          Show team capability over time
  roster                     Show current roster
  validate                   Validate roster file

Options:
  --data=<string>            Path to Map data directory
  --roster=<string>          Path to summit.yaml
  --format=<string>          Output format: text, json, markdown (default: text)
  --help, -h                 Show help
  --version, -v              Show version

Examples:
  fit-summit coverage platform
  fit-summit what-if platform --add 'Jane, senior, backend'

Use fit-summit <command> --help for command-specific options.
```

**Structure (in order):**

1. **Header line.** `{name} {version} — {description}`. One line.
2. **Blank line.**
3. **Usage line.** `Usage: {name} <command> [options]` (or custom `usage` if
   provided, or `Usage: {name} [options]` when no commands exist).
4. **Blank line.**
5. **Commands section** (only if commands exist). Section header `Commands:` on
   its own line. Then one line per command: two-space indent, command name +
   args left-padded to column width, two-space gap, description. No per-command
   options appear here.
6. **Blank line.**
7. **Options section** (only if `globalOptions` exist). Section header
   `Options:` on its own line. Then one line per option: two-space indent, flag
   string left-padded, two-space gap, description.
8. **Blank line.**
9. **Examples section** (only if top-level `examples` exist). Section header
   `Examples:` on its own line. One line per example, two-space indent.
10. **Blank line.**
11. **Hint line** (only if commands exist).
    `Use {name} <command> --help for command-specific options.` This is the only
    line that tells the user per-command help exists.

**What global help does NOT show:**

- Per-command options. The `--add`, `--remove`, `--move` flags from `what-if` do
  not appear. This is the entire point — global help is a scannable index, not a
  dump of every flag.
- Per-command examples. Only top-level `examples` appear.

**Grep examples — global help:**

```sh
$ fit-summit -h | grep coverage
  coverage <team>            Show capability coverage

$ fit-summit -h | grep format
  --format=<string>          Output format: text, json, markdown (default: text)

$ fit-summit -h | grep add
# (no output — --add is what-if-specific, intentionally absent)

$ fit-summit -h | grep team
  coverage <team>            Show capability coverage
  risks <team>               Show structural risks
  what-if <team>             Simulate roster changes
  growth <team>              Show growth opportunities aligned with team needs
  compare <team1> <team2>    Compare two teams' coverage and risks
  trajectory <team>          Show team capability over time
```

Every result line is self-contained: command name, argument pattern, and
description in one shot. An agent reading any single line has enough to
construct a valid invocation.

#### Per-command help (`fit-summit coverage --help`)

```
fit-summit coverage <team> — Show capability coverage

Usage: fit-summit coverage <team> [options]

Options:
  --evidenced                Include practiced capability from Map evidence data
  --lookback-months=<string>   Lookback window for practice patterns (default: 12)

Global options:
  --data=<string>            Path to Map data directory
  --roster=<string>          Path to summit.yaml
  --format=<string>          Output format: text, json, markdown (default: text)
  --help, -h                 Show help

Examples:
  fit-summit coverage platform
  fit-summit coverage platform --evidenced --lookback-months=6
```

**Structure (in order):**

1. **Header line.** `{parent} {command} {args} — {description}`. One line. Uses
   the parent CLI name, not just the command name, so the line is a valid
   invocation pattern.
2. **Blank line.**
3. **Usage line.** `Usage: {parent} {command} {args} [options]`.
4. **Blank line.**
5. **Options section** (only if the command has `options`). Section header
   `Options:` on its own line. One line per command-specific option. Same format
   as global options: two-space indent, flag string padded, two-space gap,
   description.
6. **Blank line.**
7. **Global options section** (only if `globalOptions` exist). Section header
   `Global options:` on its own line. One line per global option, same format.
   `--version` is omitted from per-command global options (it only applies at
   the root level).
8. **Blank line.**
9. **Examples section** (only if the command has `examples`). Section header
   `Examples:` on its own line. One line per example, two-space indent.

**Why two option sections, not one merged list:**

An agent grepping for an option name gets the same one-line result regardless of
which section it falls in. But the section headers let agents (and humans)
distinguish "this option is specific to this command" from "this option works on
any command." Merging them into one list loses that signal. Keeping them
separate costs one extra line (the `Global options:` header) and adds clarity.

**Why "Options" before "Global options":**

The command-specific options are the reason the user asked for per-command help.
They appear first. Global options are repeated for completeness (so the user
doesn't have to run two help commands) but are secondary.

**Grep examples — per-command help:**

```sh
$ fit-summit coverage -h | grep evidenced
  --evidenced                Include practiced capability from Map evidence data

$ fit-summit coverage -h | grep data
  --data=<string>            Path to Map data directory

$ fit-summit coverage -h | grep lookback
  --lookback-months=<string>   Lookback window for practice patterns (default: 12)

$ fit-summit what-if -h | grep add
  --add=<string>             Add a hypothetical person

$ fit-summit what-if -h | grep move
  --move=<string>            Move a member between teams
```

Every line is self-contained. An agent that runs
`fit-summit what-if -h | grep add` gets the flag name, type hint, and
description — enough to construct
`fit-summit what-if platform --add 'Jane, senior, backend'` without reading
anything else.

#### Commands with no options

If a command has no command-specific options, per-command help omits the
`Options:` section entirely and shows only global options under
`Global options:`. No empty `Options:` header appears.

```
fit-summit validate — Validate roster file

Usage: fit-summit validate [options]

Global options:
  --data=<string>            Path to Map data directory
  --roster=<string>          Path to summit.yaml
  --format=<string>          Output format: text, json, markdown (default: text)
  --help, -h                 Show help
```

#### CLIs with no commands

For CLIs like `fit-codegen` that have no commands, help renders exactly as it
does today but reading from `globalOptions` instead of `options`. No hint line.
No per-command help dispatch. `--help` always shows the single global view.

#### Alignment and wrapping

The same alignment and no-wrap contracts from spec 0360 apply to both views.
Per-command help aligns its `Options:` and `Global options:` sections
independently so that a short command-specific flag does not force wide padding
from a long global flag in a different section.

### Per-command JSON help

`fit-summit coverage --help --json` outputs structured JSON with
command-specific and global options distinguished. Global `--help --json`
continues to describe the full CLI.

### Help dispatch behavior

`fit-summit coverage --help` renders per-command help. `fit-summit --help`
renders global help. Unrecognized positionals continue to pass through to
callers for their own error messages.

## Migration

All 27 CLI consumers must migrate from the old flat-options schema to the new
scoped schema in one pass. The library has no external consumers — all are
internal to the monorepo, so a clean break is viable.

## Scope

### In scope

1. New definition schema with `globalOptions` and per-command `options`.
2. Per-command help rendering (human and JSON modes).
3. Per-command help dispatch in `cli.parse()`.
4. Error on legacy `options` field in `createCli()`.
5. Migration of all 27 CLI consumers.
6. Update `website/docs/internals/libcli/index.md` to document the new schema.
7. Update CLAUDE.md if it references the old help definition pattern.

### Out of scope

- Nested subcommands (e.g. `fit-landmark org show --help`). Multi-word commands
  like `org show` remain a single command entry. Per-command help applies to the
  full command name, not to partial prefixes.
- Interactive help or man pages.
- Changes to what any CLI does — only how it documents itself.
- Changes to SummaryRenderer, error handling, or color system.
- Changes to the npm distribution model.

## Success criteria

1. **Per-command help works.** `fit-summit coverage --help` renders help showing
   `coverage`-specific options under `Options:` and shared options under
   `Global options:`, with no `what-if`-specific flags visible.
2. **Global help is unchanged in spirit.** `fit-summit --help` renders global
   help listing all commands (one per line) and only global options under
   `Options:`. Ends with a hint line pointing to per-command help.
3. **Grep returns self-contained lines.** For both views, every command line and
   every option line is a single line containing the full name, type/args, and
   description. Specifically:
   - `fit-summit -h | grep coverage` returns one line with the command name,
     args, and description.
   - `fit-summit coverage -h | grep evidenced` returns one line with the flag
     name, type hint, and description.
   - `fit-summit -h | grep add` returns nothing (command-specific options do not
     leak into global help).
4. **Per-command JSON help works.** `fit-summit coverage --help --json` returns
   structured JSON with the command's `options` and `globalOptions` as separate
   keys.
5. **Legacy schema rejected.** `createCli({ options: { ... } })` throws an error
   mentioning `globalOptions`.
6. **All consumers migrated.** All 27 CLI consumers use the new schema with no
   top-level `options` field.
7. **No wrapping.** No help output line wraps to a second line. Descriptions are
   concise enough to fit on one line.
8. **All existing tests pass** or are updated for the new schema.
9. **Docs updated.** `website/docs/internals/libcli/index.md` documents both
   help views, the new schema, and the grep-friendliness contract.
