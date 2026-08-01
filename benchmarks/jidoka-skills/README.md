# `jidoka-skills` task family

Task family for `fit-benchmark`. It targets the `forwardimpact/jidoka-skills`
skill pack. It runs on manual dispatch through `eval-jidoka.yml`.

Two tasks exercise the two ends of the work to adopt the Jidoka standard in a
repository. One task **bootstraps the architecture** with `jidoka-setup`. The
other task **authors a job** with `jidoka-jtbd`. Each task is self-contained.
It has a small fixture project, a single skill under test, and a grader that
never enters the agent's working directory.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `bootstrap-repo` | `jidoka-setup` | `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, `.jidoka/invariants/` | Gates: the three root files exist. Scored: `CLAUDE.md` surfaces job **and** checklist discovery. `JTBD.md` carries a `<job>`. The starter rule is present. `CONTRIBUTING.md` points at the invariant tooling. Judge: it orients, it does not govern, and it stays faithful to the project |
| `author-job` | `jidoka-jtbd` | a `<job>` entry appended to `JTBD.md` | Gate: `JTBD.md` exists. Scored: `<job>` tag with `user`/`goal`, Trigger, Big Hire, Little Hire. Judge: it states progress, it does not list features, the trigger is a moment, and it includes nonconsumption |

`bootstrap-repo` is the primary task. It exercises the full setup path. It also
verifies that the auto-loaded `CLAUDE.md` advertises the discovery conventions
for both jobs and checklists. That is the L1 property the Jidoka standard
defines.

Run a single task with `--task`:

```text
fit-benchmark run --family=benchmarks/jidoka-skills --task=bootstrap-repo
```

Omit `--task` to run every task.

## Fixtures — per-task `workdir/`

Each task ships its own `workdir/`. The harness copies it into the agent CWD
before the run:

```text
tasks/bootstrap-repo/workdir/   a tiny existing project (README, package.json,
                                src/) for the agent to orient CLAUDE.md around
tasks/author-job/workdir/       a seeded JTBD.md (no jobs yet) + brief.md
                                (a struggle story to reconstruct the job from)
```

The fixtures deliberately use only `node:` built-ins, so they need no install
step in the benchmark CWD.

## What the tasks grade against

Both tasks grade against **repository state** through `hooks/invariants.sh`.
That script uses `fit-trace assert` for file-existence checks and content
checks. The check rows it emits are the verdict. Presence checks are `--gate`
rows. Content checks are scored rows that add to the task's score. The script's
exit code means only "the grader itself ran". The harness never copies `hooks/`
into the agent CWD, so the agent never sees the assertions. The judge then
decides the faithfulness question the structural checks cannot.

## Dependencies

`apm.yml` declares the dependencies. `fit-benchmark run` calls
`apm install --target claude` automatically before each run. You stage nothing
by hand. The `forwardimpact/jidoka-skills` pack stages every `jidoka-*` skill
the tasks reference.
