# Finding — `todo list` exit code on empty store

While studying traces of the `todo` CLI, a recurring defect surfaced: running
`todo list` against an empty store prints nothing but exits with status `1`,
which reads as an error to any script that checks the exit code. An empty list
is a normal state, not a failure, so the command should exit `0`.

This finding needs to re-enter the work loop: filed as an issue, carried by a
change that links back to it, gated by a trusted signal, and merged.
