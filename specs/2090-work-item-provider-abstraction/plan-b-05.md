# Plan 2090-b, Part 05: The coordination benchmark task

Add `coordinate-finding/` to the `kata-skills` benchmark family: an end-to-end
file → open-change → gate → merge loop graded offline against `.tracker/` files.
Depends on Part 01 (operation names) and Part 04 (`--work-tracker`).
Conventions:
[plan-b.md](plan-b.md).

Libraries used: fit-trace (the `assert` harness in `invariants.sh`).

Model the structure on `benchmarks/kata-skills/tasks/spec-feature/` (agent /
judge / supervisor task files, a `workdir/` overlay, `hooks/preflight.sh`,
`hooks/invariants.sh`).

## Step 1 — Task files

Intent: give the agent a finding and the coordination loop to run.

Files: create `benchmarks/kata-skills/tasks/coordinate-finding/agent.task.md`,
`judge.task.md`, `supervisor.task.md`.

Change: `agent.task.md` hands the agent a finding and instructs it to run the
loop using the abstract operations — `create-issue` (the finding),
`open-change` (linking the issue), `gate` (trusted signal), `merge-change` —
resolving each through `work-trackers.md` under the active tracker, with
networking unavailable. `supervisor.task.md` and `judge.task.md` mirror the
rubric tasks' relay/grade shape.

Verification: the three files exist and name only matrix operations (no `gh`).

## Step 2 — Workdir overlay

Intent: seed the finding input and a clean coordination root.

Files: create
`benchmarks/kata-skills/tasks/coordinate-finding/workdir/finding.md` (and any
seed the agent reads).

Change: a short finding brief the agent files. No pre-existing `.tracker/` (the
agent creates it); no app/network seed required.

Verification: `workdir/` materializes; no remote or network dependency.

## Step 3 — Hooks

Intent: smoke-check preconditions and assert on the resulting files.

Files: create `hooks/preflight.sh` and `hooks/invariants.sh`.

Change: `preflight.sh` confirms the workdir is sane and `.tracker/` is absent at
start. `invariants.sh` uses the `fit-trace assert` harness (as
`spec-feature/hooks/invariants.sh` does) against `$WORKDIR/cwd/.tracker/`:

- `file-present` — an `issues/*.md` exists,
- the change `links` back to that issue,
- `changes/*.md` has `state: merged`,
- `approval` is recorded on the change.

Verification:
`fit-benchmark invariants --family=benchmarks/kata-skills --task=coordinate-finding --workdir=<hand-authored .tracker fixture>`
passes on a correct fixture and fails on one missing `state: merged`.

## Step 4 — Family wiring and offline run

Intent: confirm the task is discovered and runs offline under the filesystem
tracker.

Files: none expected — tasks are auto-discovered under `tasks/`;
`benchmarks/kata-skills/apm.yml` is unchanged. Confirm no rubric task or hook
reads `LIBEVAL_WORK_TRACKER` (plan-b.md Risks).

Change: document the invocation —
`fit-benchmark run --family=benchmarks/kata-skills --work-tracker=filesystem` —
and that production runs leave the default `github`.

Verification (criterion 4): the full loop — not just the `invariants` subcommand
of Step 3 — runs to a pass/fail verdict in the sandbox with networking
unavailable under `--work-tracker=filesystem`; the rubric tasks are unaffected.
