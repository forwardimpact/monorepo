# Authoring task families

Guidance for writing and iterating on tasks, beyond the format in the skill.

## Test local, unpublished skills

A benchmark normally `apm install`s the published skill pack named in
`apm.yml`, so by default it grades the *published* skills. To benchmark skills
you have changed but not yet published, point `--skills-from` at a directory
that contains a `.claude/` tree (for example your working tree's root):

```sh
npx fit-benchmark run --family=./families/coding --skills-from=. --task=todo-api
```

The harness stages that `.claude/` instead of running `apm install`, so the
agent runs against your local skills. Omit `--skills-from` to grade the
published pack. This is how you prove a skill change before publishing it.

## The invariants authoring contract

`hooks/invariants.sh` decides the verdict by exit code (`0` = pass) and writes
optional per-check rows as NDJSON to `$RESULTS_FD`. Grade with the
`fit-trace assert` harness — make sure it resolves (it ships with the eval
tooling; invoke it through your package runner if it is not on `PATH`):

```sh
#!/bin/sh
set -u
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }
```

Two things that bite authors:

- **`--grep` is JavaScript-regex, not POSIX.** Use `\s` / `\S`, not
  `[[:space:]]` / `[[:graph:]]` (those silently fail to match).
- **`assert` takes one file, not a glob.** Resolve the path in shell first,
  then assert on it:

  ```sh
  ITEM=$(ls "$AGENT_CWD"/items/*.md 2>/dev/null | head -1)
  assert item-present --exists "$ITEM"
  ```

Reference the agent's emitted files as `$AGENT_CWD/<path>` — `AGENT_CWD` is the
agent CWD itself, not a parent containing `cwd/`.

## Fast iteration

Two LLM sessions per run (agent + judge) cost real money, so confirm the
mechanics before paying for full runs:

- **Validate hooks with no agent.** Hand-author a post-run directory (a
  `cwd/` holding the files a correct agent would emit) and run the invariants
  alone:

  ```sh
  npx fit-benchmark invariants --family=./fam --task=mytask --run-dir=./fixture
  ```

  Confirm it passes on a correct fixture and fails on a broken one before
  wiring an agent run.
- **Scope agent runs while authoring.** `--task=<id>` runs one task instead of
  the whole family; `--runs=1` runs it once.

## Grading emitted files (non-coding tasks)

Tasks need not grade a coding diff. A task can ask the agent to *produce files*
and grade their content — useful for coordination, document, or data-shaping
work. The agent writes under `$AGENT_CWD`; `invariants.sh` asserts on the
result:

```sh
#!/bin/sh
set -u
OUT="$AGENT_CWD/out/record.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

assert produced  --exists "$OUT"
assert has-state --grep 'state:\s*done' "$OUT" --message "record not marked done"
[ "$FAIL" = 0 ] && exit 0 || exit 1
```

Seed any inputs the agent reads under the task's `workdir/` (copied into
`$AGENT_CWD` before the run); a `hooks/preflight.sh` can confirm the seed and
that no output exists yet.
