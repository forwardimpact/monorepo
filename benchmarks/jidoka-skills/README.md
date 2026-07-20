# `jidoka-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/jidoka-skills`
skill pack. Runs on manual dispatch via `eval-jidoka.yml`.

Two tasks exercise the two ends of adopting the Jidoka standard in a
repository: **bootstrapping the architecture** with `jidoka-setup`, and
**authoring a job** with `jidoka-jtbd`. Each task is self-contained — a small
fixture project, a single skill under test, and grading that never enters the
agent's working directory.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `bootstrap-repo` | `jidoka-setup` | `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, `.jidoka/invariants/` | Gates: the three root files exist. Scored: `CLAUDE.md` surfaces job **and** checklist discovery; `JTBD.md` carries a `<job>`; starter rule present; `CONTRIBUTING.md` points at the invariant tooling. Judge: orients not governs, faithful to the project |
| `author-job` | `jidoka-jtbd` | a `<job>` entry appended to `JTBD.md` | Gate: `JTBD.md` exists. Scored: `<job>` tag with `user`/`goal`, Trigger, Big Hire, Little Hire. Judge: progress not features, trigger is a moment, includes nonconsumption |

`bootstrap-repo` is the primary task: it exercises the full setup path and
verifies the auto-loaded `CLAUDE.md` advertises the discovery conventions for
both jobs and checklists — the L1 property the Jidoka standard defines.

Run a single task with `--task`:

```text
fit-benchmark run --family=benchmarks/jidoka-skills --task=bootstrap-repo
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
uses `fit-trace assert` for file-existence and content checks. The emitted
check rows are the verdict — presence checks are `--gate` rows, content checks
are scored rows contributing to the task's score, and the script's exit code
means only "the grader itself ran". `hooks/` is never copied into the agent
CWD, so the agent never sees the assertions. The judge then decides the
faithfulness question the structural checks cannot.

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required. The
`forwardimpact/jidoka-skills` pack stages every `jidoka-*` skill the tasks
reference.
