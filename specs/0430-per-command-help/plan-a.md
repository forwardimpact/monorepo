# Plan A — Per-command help in libcli

## Approach

The change has three independent dimensions: the library itself (schema, parser,
renderer), the 28 `createCli()` call sites (27 in `bin/` files + 1 in
`products/basecamp/src/basecamp.js`; the spec says "27 CLI consumers" counting
only bin entry points), and the documentation. The library changes land first;
consumer migration and docs are independent of each other and can run in
parallel once the library is merged.

**Why a big-bang migration:** All consumers are internal. The spec calls for
rejecting the legacy `options` field at startup, so a phased rollout would break
every unconverted CLI. One pass is simpler than a deprecation period.

**Key design decision — command matching in `parse()`:** Multi-word commands
like `org show` in fit-landmark mean we cannot simply take `positionals[0]` as
the command name. The parser pre-scans argv for non-flag tokens and tries the
longest match against `definition.commands` before calling `parseArgs()`. This
lets `fit-landmark org show --help` match the `org show` command entry.

**Key design decision — option merging:** When a command is identified, its
`options` are merged with `globalOptions` for the `parseArgs()` call. Options
not in the merged set throw `ERR_PARSE_ARGS_UNKNOWN_OPTION` as before. This
gives command-scoped validation for free via Node's built-in parser.

**Behavioral note:** This is a tightening. Today every option is accepted on
every command (the handler simply ignores irrelevant flags). After migration,
passing a command-specific option on the wrong command throws
`ERR_PARSE_ARGS_UNKNOWN_OPTION`. The spec intends this ("Command-specific
options apply only to the command they belong to") even though the out-of-scope
list says "Changes to what any CLI does." The distinction: command _behavior_ is
unchanged; input _validation_ is stricter.

**Key design decision — merge order and collision guard:** The merge is
`{ ...globalOpts, ...commandOpts }`. This order is safe ONLY because the
constructor throws on name collisions between command and global options (step
1d in Part 1). Without the collision guard, a command option would silently
shadow a global option. The collision check is mandatory — do not remove it
without changing the merge strategy.

## Part index

| Part                   | Scope                                                    | Depends on | Agent              |
| ---------------------- | -------------------------------------------------------- | ---------- | ------------------ |
| [Part 1](plan-a-01.md) | Core library (schema, parser, renderer, tests)           | —          | `staff-engineer`   |
| [Part 2](plan-a-02.md) | Consumer migration (28 CLI bin files + test files)       | Part 1     | `staff-engineer`   |
| [Part 3](plan-a-03.md) | Documentation (`website/docs/internals/libcli/index.md`) | Part 1     | `technical-writer` |

## Cross-cutting concerns

- **`--version` omission:** Per-command help omits `--version` from the global
  options section (spec requirement). The renderer filters it out when rendering
  per-command global options.
- **`--json` in per-command help:** `renderJson()` for a command returns a
  focused object with the command's metadata, its `options`, and `globalOptions`
  — not the entire definition.
- **Independent alignment:** Per-command `Options:` and `Global options:`
  sections compute their own column widths independently (spec requirement).
- **No consumer behavior changes:** Migration is purely structural — rename
  `options` → `globalOptions`, move command-specific options into their command
  entries, and add per-command `examples` where useful. No CLI gains or loses
  functionality.

## Risks

1. **Multi-word command edge cases.** If a CLI has both `org` and `org show` as
   commands, longest-match wins. No current CLI has this ambiguity, but the
   algorithm must be correct. Mitigated by tests.
2. **Option name collisions.** If a command option shares a name with a global
   option, the merge would silently shadow. The constructor should throw on
   collision. No current CLI has this issue.
3. **28 consumers in one commit.** A typo in one consumer breaks all tests. The
   plan calls for running `just check` after migrating each product/library
   group.

## Execution

Part 1 runs first. After Part 1 merges (or is committed on the feature branch),
Parts 2 and 3 can run concurrently:

- **Part 2** (`staff-engineer`): Migrate all consumers. This is mechanical but
  large — the agent should migrate in groups (products, then libraries) and run
  tests between groups.
- **Part 3** (`technical-writer`): Rewrite libcli internals documentation to
  cover the new schema, both help views, and grep-friendliness contract.
