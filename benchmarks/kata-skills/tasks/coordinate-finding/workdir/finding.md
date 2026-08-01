# Finding — `todo list` exit code on empty store

A study of `todo` CLI traces surfaced a defect that recurs. `todo list` against
an empty store prints nothing and exits with status `1`. Any script that checks
the exit code reads that status as an error. An empty list is a normal state. It
is not a failure, so the command should exit `0`.

This finding must re-enter the work loop. File it as an issue. Carry it with a
change that links back to the issue. Gate it with a trusted signal. Then merge
it.
