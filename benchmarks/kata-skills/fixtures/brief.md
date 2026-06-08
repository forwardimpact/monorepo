# Brief — `todo list --filter`

The mock `todo` CLI (materialized at `app/` in your working directory) supports
`add`, `list`, and `done`. As the list grows, `todo list` prints everything,
forcing the user to scan the whole list to find a few relevant items.

Spec a new `--filter <substring>` option for `todo list` that restricts the
output to todos whose text contains the given substring. Read the current app
under `app/` to ground the spec in how the CLI and store actually behave.

The hire is the persona+job at the level-2 heading of `jtbd-excerpt.md`; quote
that heading verbatim in your spec's persona section.
