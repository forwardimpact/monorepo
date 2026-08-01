# Self-Improvement Writes Under `.claude/**`

Claude Code's permission guard blocks `Write`, `Edit`, and sandboxed `Bash`
calls that target `.claude/**`. Until upstream resolves regression
[claude-code#38806](https://github.com/anthropics/claude-code/issues/38806),
agents use the `gemba-selfedit` CLI described below.

## Rule

Every agent edit under `.claude/**` goes through `gemba-selfedit`. The
repository supports no other mechanism. Do not use `Edit`, `Write`, or
sandboxed `Bash` on `.claude/**` paths. The guard denies them.

## Invocation

Use the `Bash` tool. Pipe content on stdin. The target path is the only
positional argument:

    echo "<content>" | gemba-selfedit <path>

For multi-line content, use a heredoc:

    gemba-selfedit .claude/path/to/file <<'FIT_SELFEDIT_EOF'
    file content here
    FIT_SELFEDIT_EOF

- **Target path** — relative to the current working directory or absolute.
  The CLI resolves `..` before the gate check.
- **Content** — stdin. The CLI writes it verbatim to the target. stdin must
  not be a TTY.

## Safeguards

The CLI checks two safeguards in order. If either fails, the CLI exits with
code 2 and a message that names which safeguard rejected it.

1. **Settings allowlist.** The CLI walks upward from the target for the
   nearest `.claude/settings.json`. The target, relative to the project root,
   must match at least one `Edit(<glob>)` rule in `permissions.allow[]`.
   Widen the project allowlist and the CLI follows. `path.resolve` collapses
   path traversal like `.claude/../README.md` before the match, so the match
   rejects escapes as a side effect. On failure, the error message lists
   every `Edit()` rule the CLI tried.

2. **Branch scope.** `git rev-parse --abbrev-ref HEAD` must not return
   `HEAD` (detached) or `main`. Edits ride a feature branch through whatever
   merge gates the project configured.

## Exit codes

| Exit | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | The CLI wrote the file                                               |
| 2    | Safeguard violation — no settings.json, no `Edit()` rule matched, on |
|      | `main`, detached HEAD, absent parent directory, or TTY stdin         |
| 1    | Unexpected I/O error                                                 |

If exit 2 names safeguard 1, check that the target path falls under one of
the `Edit()` globs the message lists. Otherwise widen `.claude/settings.json`
and re-run. If a parent directory does not exist, create it with `mkdir -p`
first.

## Trace invariant

The cross-cutting invariant table (KATA.md § Invariants) enforces that every
write under `.claude/**` goes through `gemba-selfedit`. Any other mechanism is
a **high-severity** trace finding. This covers a direct `Edit` or `Write` on
`.claude/**`, and a sandbox-disabled `Bash` call that writes to those paths.

## Retirement

When [claude-code#38806](https://github.com/anthropics/claude-code/issues/38806)
lands and `Edit`/`Write` calls on `.claude/**` succeed under the project
allowlist, the CLI and this reference retire by deletion.
`.claude/settings.json` is already at target state. It needs no change at
retirement.
