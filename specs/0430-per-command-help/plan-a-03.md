# Part 3 — Documentation update

Updates `website/docs/internals/libcli/index.md` to document the new schema,
both help views, and the grep-friendliness contract. Depends on Part 1 (core
library changes).

## Scope

One file: `website/docs/internals/libcli/index.md`.

This is the canonical internals reference for libcli. It must reflect the new
schema introduced by spec 0430. The page should be rewritten rather than patched
— the structural change (per-command help) affects every section.

## Content outline

The current page covers: help text & argument parsing, logger conventions, error
handling, summary output, argument parsing integration, and composition with
other libraries. The new page should retain the same sections but update the
help/parsing content:

### Sections to rewrite

1. **Definition schema.** Replace the old flat schema example with the new
   shape: `globalOptions` at the top level, per-command `options` and `examples`
   inside command entries. Show a realistic example (fit-summit or similar).

2. **Help rendering — global view.** Document the global help structure (header,
   usage, commands, global options, examples, hint line). Show the exact output
   format. Emphasize that per-command options do NOT appear in global help.

3. **Help rendering — per-command view.** Document the per-command help
   structure (header with parent name, usage, command options, global options
   without `--version`, examples). Show the exact output format.

4. **Grep-friendliness contract.** Explain the one-line-per-entry rule and show
   grep examples for both views. This is the core design invariant from spec 0360
   that carries forward.

5. **JSON help.** Document `--help --json` for both global and per-command
   views. Show the per-command JSON shape (`parent`, `name`, `options`,
   `globalOptions`).

6. **Argument parsing.** Update to explain that `parse()` identifies the
   command, merges `globalOptions` + command `options`, and passes the merged
   set to `parseArgs()`. Explain that command-specific options throw on wrong
   commands.

7. **Legacy schema rejection.** Note that passing `options` (without
   `globalOptions`) throws with a migration message. Point to this spec for
   context.

### Sections to keep as-is

- Logger conventions (unchanged)
- Error handling (unchanged)
- Summary output (unchanged)
- Composition with other libraries (unchanged)

## What NOT to add

- Migration guide or changelog — this is a reference page, not a release note.
- Spec rationale — link to `specs/0430-per-command-help/spec.md` for background.

## Verification

- All code examples must match the actual library behavior after Part 1.
- Output examples should match what
  `bun run products/summit/bin/fit-summit.js --help` and
  `bun run products/summit/bin/fit-summit.js coverage --help` actually produce
  after Part 2.
- No line in any help output example should wrap at 80 columns.

## File change summary

| File                                     | Action                        |
| ---------------------------------------- | ----------------------------- |
| `website/docs/internals/libcli/index.md` | Rewrite help/parsing sections |
