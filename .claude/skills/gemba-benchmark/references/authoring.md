# Author task families

Guidance to write and iterate on tasks.

## Write agent.task.md

The prompt triggers the skill under test. It does not do the skill's job.
State the situation and the outcome a real user would ask for. Name the
skill. Stop. If you spell out the steps or the output shape, the benchmark
tests whether the agent follows the prompt. Push every "how" into the
skill, and every "did it land" into the checks and judge.

- **Good** — "This repo is `<project>`. Set up X here. Follow the
  `<skill>` skill."
- **Too prescriptive** — "Create A with sections P and Q, then B that
  holds R…". Now the agent transcribes the prompt.

## Test local, unpublished skills

A benchmark normally `apm install`s the published pack named in `apm.yml`.
To benchmark unpublished changes, point `--skills-from` at a directory
with a `.claude/` tree (e.g. your working tree's root):

```sh
npx gemba-benchmark run --family=./families/coding --skills-from=. --task=todo-api
```

Omit `--skills-from` to grade the published pack.

## The grading contract

Check rows are the single authoritative grading channel. The score is the
weighted fraction of scored rows that pass. Two producers feed it. When a
check asks "does the behaviour work", write a **hidden test**. When it
asks "is the artifact shaped right", write a **structural check**.

## Hidden test suites — the `tests/` layout

A task opts in with a `tests/` directory beside `hooks/`. No manifest
exists. The layout is the contract:

- `tests/` is an **overlay mirror** of the agent CWD. The harness stages
  each file at its `tests/` path (`tests/app/test/filter.test.js` stages
  at `app/test/filter.test.js`).
- Every `*.test.js` file is one check, run with `node --test` from the
  agent CWD. The exit status is the row. `*.gate.test.js` marks a gate.
  Any other `*.test.js` is scored at weight 1, named by its filename stem.
- Every other file is support material, staged for the whole pass and
  never graded. Put shared helpers there and import them relatively.
- One small `*.test.js` per behaviour gives a task its gradient.
- A baseline suite already in `workdir/` can gate without a drift pair.
  Make `<name>.gate.test.js` a symlink to it (resolved at stage time).

The harness backs up collisions, stages each file, runs the checks, and
removes what it staged. The judge sees only the agent's work. An invalid
tree fails the family load before any agent spend.

## Structural checks — `hooks/invariants.sh`

The script emits rows on `$RESULTS_FD`. Its exit code is **script health
only**. No exit-code bookkeeping. Use one helper and a final `exit 0`:

```sh
#!/bin/sh
set -u
check() { gemba-trace assert "$@" >&"$RESULTS_FD" || true; }

check produced  --gate --exists "$AGENT_CWD/out/record.md"
check has-state --grep 'state:\s*done' "$AGENT_CWD/out/record.md"
exit 0
```

- `--gate` marks presence, sanity, and anti-tamper checks. A failed gate
  fails the run and zeroes the score.
- Content checks stay default-weight scored rows. `--weight <n>`
  re-weights one. `--weight 0` emits an ungraded diagnostic.
- When later checks depend on an earlier gate, early-exit after it. The
  gate row already carries the failure. Use
  `gemba-trace assert dep --gate --exists "$F" >&"$RESULTS_FD" || exit 0`.
- Every `assert` failure (an invalid flag, a file the agent deleted)
  emits a failed row before its nonzero exit. A typo shrinks the score.
  The denominator never shrinks.

This also grades non-coding tasks. The agent produces files under
`$AGENT_CWD`. The script asserts on their content.

Make sure `gemba-trace` resolves (it ships with the eval tools). Two
things bite authors:

- **`--grep` is JavaScript-regex.** POSIX classes fail. Use `\s` / `\S`
  for `[[:space:]]` / `[[:graph:]]`.
- **`assert` takes one file.** Globs fail. Resolve the path in shell
  first:

  ```sh
  ITEM=$(ls "$AGENT_CWD"/items/*.md 2>/dev/null | head -1)
  check item-present --gate --exists "$ITEM"
  ```

Reference emitted files as `$AGENT_CWD/<path>`. `AGENT_CWD` is the agent
CWD itself. It is not a parent of `cwd/`.

## Fast iteration

Two LLM sessions per run cost real money, so confirm the mechanics first:

- **Validate grading with no agent.** Hand-author a post-run directory (a
  `cwd/` with the files a correct agent would emit). Then grade it:

  ```sh
  npx gemba-benchmark grade --family=./fam --task=mytask --run-dir=./fixture
  ```

  Confirm it passes on a correct fixture and fails on a broken one. On a
  partial one, confirm the fractional score you expect.
- **Scope runs while you author** with `--task=<id>` and `--runs=1`.

## What to commit

Commit only the files you author. `run` and `apm install` generate
`.claude/`, `apm.lock.yaml`, `apm_modules/`, and a per-family `.gitignore`.
These are all outputs. Ignore them once at the directory with your
families (`*/.claude/`, `*/apm.lock.yaml`, `*/.gitignore`). You author
`apm.yml`. No tool generates it. It stays at the family level.
