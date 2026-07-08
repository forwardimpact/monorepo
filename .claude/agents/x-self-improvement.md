# Self-Improvement Writes Under `.claude/**`

Claude Code's permission guard blocks `Write`, `Edit`, and sandboxed `Bash`
calls targeting `.claude/**`. Until upstream regression
[claude-code#38806](https://github.com/anthropics/claude-code/issues/38806) is
resolved, agents use the `fit-selfedit` CLI described below.

## Rule

Every agent edit under `.claude/**` goes through `fit-selfedit`. No other
mechanism is supported. Do not use `Edit`, `Write`, or sandboxed `Bash` on
`.claude/**` paths — they will be denied.

## Invocation

Use the `Bash` tool. Pipe content on stdin; the target path is the only
positional argument:

    echo "<content>" | fit-selfedit <path>

For multi-line content, use a heredoc:

    fit-selfedit .claude/path/to/file <<'FIT_SELFEDIT_EOF'
    file content here
    FIT_SELFEDIT_EOF

- **Target path** — relative to the current working directory or absolute.
  The CLI resolves `..` before the gate check.
- **Content** — stdin. Written verbatim to the target. stdin must not be a
  TTY.

## Safeguards

Two safeguards, checked in order. Failure on either exits with code 2 and a
message naming which safeguard rejected.

1. **Settings allowlist.** The CLI walks upward from the target for the
   nearest `.claude/settings.json` and requires the target (relative to the
   project root) to match at least one `Edit(<glob>)` rule in
   `permissions.allow[]`. Widen the project allowlist and the CLI follows.
   Path traversal like `.claude/../README.md` is collapsed by `path.resolve`
   before matching, so escapes are rejected as a side effect. On failure,
   the error message lists every `Edit()` rule that was tried.

2. **Branch scope.** `git rev-parse --abbrev-ref HEAD` must not return
   `HEAD` (detached) or `main`. Edits ride a feature branch through whatever
   merge gates the project has configured.

## Exit codes

| Exit | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| 0    | Written successfully                                                     |
| 2    | Safeguard violation — no settings.json, no matching `Edit()` rule, on    |
|      | `main`, detached HEAD, missing parent directory, or TTY stdin            |
| 1    | Unexpected I/O error                                                     |

If exit 2 names safeguard 1, check that the target path falls under one of
the `Edit()` globs the message lists — or widen `.claude/settings.json` and
re-run. If a parent directory is missing, create it with `mkdir -p` first.

## Trace invariant

The cross-cutting invariant table (KATA.md § Invariants) enforces that every
write under `.claude/**` is performed via `fit-selfedit`. Any other
mechanism — direct `Edit`/`Write` on `.claude/**`, or a sandbox-disabled
`Bash` call writing to those paths — is a **high-severity** trace finding.

## Retirement

When [claude-code#38806](https://github.com/anthropics/claude-code/issues/38806)
lands and `Edit`/`Write` calls on `.claude/**` succeed under the project
allowlist, the CLI and this reference retire by deletion.
`.claude/settings.json` is already at target state — no change needed at
retirement.
