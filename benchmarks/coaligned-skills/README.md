# `coaligned-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/coaligned-skills`
skill pack. Runs on manual dispatch via `eval-coaligned.yml`.

Two tasks exercise the two ends of adopting the Co-Aligned standard in a
repository: **bootstrapping the architecture** with `coaligned-setup`, and
**authoring a job** with `coaligned-jtbd`. Each task is self-contained — a small
fixture project, a single skill under test, and grading that never enters the
agent's working directory.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `bootstrap-repo` | `coaligned-setup` | `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, `.coaligned/invariants/` | Invariants (files exist; `CLAUDE.md` surfaces job **and** checklist discovery; `JTBD.md` carries a `<job>`; starter rule present) + judge (orients not governs, faithful to the project) |
| `author-job` | `coaligned-jtbd` | a `<job>` entry appended to `JTBD.md` | Invariants (`<job>` tag with `user`/`goal`, Trigger, Big Hire, Little Hire) + judge (progress not features, trigger is a moment, includes nonconsumption) |

`bootstrap-repo` is the primary task: it exercises the full setup path and
verifies the auto-loaded `CLAUDE.md` advertises the discovery conventions for
both jobs and checklists — the L1 property the Co-Aligned standard defines.

Run a single task with `--task`:

```text
fit-benchmark run --family=benchmarks/coaligned-skills --task=bootstrap-repo
```

Omit `--task` to run every task.

## Fixtures — per-task `workdir/`

Each task ships its own `workdir/`, copied into the agent CWD before the run:

```text
tasks/bootstrap-repo/workdir/   a tiny existing project (README, package.json,
                                src/) for the agent to orient CLAUDE.md around
tasks/author-job/workdir/       a seeded JTBD.md (no jobs yet) + brief.md
                                (a struggle story to reconstruct the job from)
```

The fixtures deliberately use only `node:` built-ins, so they need no install
step in the benchmark CWD.

## Grading surfaces

Both tasks grade against **repository state** via `hooks/invariants.sh`, which
uses `fit-trace assert` for file-existence and content checks. `hooks/` is never
copied into the agent CWD, so the agent never sees the assertions. The judge
then decides the faithfulness question the structural checks cannot.

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required. The
`forwardimpact/coaligned-skills` pack stages every `coaligned-*` skill the tasks
reference.
