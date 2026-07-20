# Authoring task families

Guidance for writing and iterating on tasks.

## Writing agent.task.md

The prompt triggers the skill under test — it does not do the skill's job.
State the situation and the outcome a real user would ask for, name the
skill, and stop. Spelling out the steps or the output shape turns the
benchmark into a test of prompt-following. Push every "how" into the skill,
and every "did it land" into the checks and judge.

- **Good** — "This repo is `<project>`. Set up X here, following the
  `<skill>` skill."
- **Too prescriptive** — "Create A with sections P and Q, then B holding
  R…". Now the agent is transcribing the prompt.

## Test local, unpublished skills

A benchmark normally `apm install`s the published pack named in `apm.yml`.
To benchmark unpublished changes, point `--skills-from` at a directory
containing a `.claude/` tree (e.g. your working tree's root):

```sh
npx gemba-benchmark run --family=./families/coding --skills-from=. --task=todo-api
```

Omit `--skills-from` to grade the published pack.

## The grading contract

Check rows are the single authoritative grading channel; the score is the
weighted fraction of passing scored rows. Two producers feed it: when a
check asks "does the behaviour work", write a **hidden test**; when it asks
"is the artifact shaped right", write a **structural check**.

## Hidden test suites — the `tests/` layout

A task opts in with a `tests/` directory beside `hooks/`. No manifest — the
layout is the contract:

- `tests/` is an **overlay mirror** of the agent CWD: a file's path under
  `tests/` is its staging path (`tests/app/test/filter.test.js` stages at
  `app/test/filter.test.js`).
- Every `*.test.js` file is one check, run with `node --test` from the
  agent CWD; the exit status is the row. `*.gate.test.js` marks a gate; any
  other `*.test.js` is scored at weight 1, named by its filename stem.
- Every other file is support material — staged for the whole pass, never
  graded. Put shared helpers there and import them relatively.
- One small `*.test.js` per behaviour is what gives a task its gradient.
- A baseline suite already in `workdir/` can gate without a drift pair:
  make `<name>.gate.test.js` a symlink to it (resolved at stage time).

The harness stages each file (backing up collisions), runs the checks, and
removes what it staged, so the judge sees only the agent's work. An invalid
tree fails the family load before any agent spend.

## Structural checks — `hooks/invariants.sh`

The script emits rows on `$RESULTS_FD`; its exit code is **script health
only**. No exit-code bookkeeping — one helper and a final `exit 0`:

```sh
#!/bin/sh
set -u
check() { gemba-trace assert "$@" >&"$RESULTS_FD" || true; }

check produced  --gate --exists "$AGENT_CWD/out/record.md"
check has-state --grep 'state:\s*done' "$AGENT_CWD/out/record.md"
exit 0
```

- `--gate` marks presence, sanity, and anti-tamper checks — a failing gate
  fails the run and zeroes the score.
- Content checks stay default-weight scored rows; `--weight <n>` re-weights
  one, `--weight 0` emits an ungraded diagnostic.
- When later checks depend on an earlier gate, early-exit after it — the
  gate row already carries the failure:
  `gemba-trace assert dep --gate --exists "$F" >&"$RESULTS_FD" || exit 0`.
- Every `assert` failure (an invalid flag, a file the agent deleted) emits
  a failing row before its nonzero exit — a typo shrinks the score, never
  the denominator.

This also grades non-coding tasks: the agent produces files under
`$AGENT_CWD` and the script asserts on their content.

Make sure `gemba-trace` resolves (it ships with the eval tooling). Two things
that bite authors:

- **`--grep` is JavaScript-regex, not POSIX.** Use `\s` / `\S`, not
  `[[:space:]]` / `[[:graph:]]`.
- **`assert` takes one file, not a glob.** Resolve the path in shell first:

  ```sh
  ITEM=$(ls "$AGENT_CWD"/items/*.md 2>/dev/null | head -1)
  check item-present --gate --exists "$ITEM"
  ```

Reference emitted files as `$AGENT_CWD/<path>` — `AGENT_CWD` is the agent
CWD itself, not a parent containing `cwd/`.

## Fast iteration

Two LLM sessions per run cost real money, so confirm the mechanics first:

- **Validate grading with no agent.** Hand-author a post-run directory (a
  `cwd/` holding the files a correct agent would emit) and grade it:

  ```sh
  npx gemba-benchmark grade --family=./fam --task=mytask --run-dir=./fixture
  ```

  Confirm it passes on a correct fixture, fails on a broken one, and yields
  the fractional score you expect on a partial one.
- **Scope runs while authoring** with `--task=<id>` and `--runs=1`.

## What to commit

Commit only the files you author. `run` and `apm install` generate
`.claude/`, `apm.lock.yaml`, `apm_modules/`, and a per-family `.gitignore` —
all outputs, so ignore them once at the directory holding your families
(`*/.claude/`, `*/apm.lock.yaml`, `*/.gitignore`). `apm.yml` is authored,
not generated, so it stays at the family level.
