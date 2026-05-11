# `kata-skills` benchmark family

The `fit-benchmark` task family targeting the `forwardimpact/kata-skills`
skill pack. Run on three signals (manual dispatch, weekly schedule on `main`,
path-filtered PRs) and produces a pass@k table per workflow invocation.

## v1 task list

| Task family | Task name | Skill exercised | Grading |
| --- | --- | --- | --- |
| `kata-spec` | `write-feature-spec` | `kata-spec` | Structural rubric (six checks against the skill's DO-CONFIRM bar) + judge verdict (spec addresses the brief). |

## Layout

```
benchmarks/kata-skills/
├── README.md                              # this file
├── .gitignore                             # excludes staging build output
├── judge.md                               # checked-in family-local judge prompt
├── scripts/stage-family.sh                # regime-aware staging
├── apm.lock.yaml                          # build output; bytes drive skillSetHash
├── .claude/                               # build output (all of it)
│   ├── skills/kata-*/                     # staged from regime source
│   └── agents/judge.md                    # copied from ./judge.md by the staging script
└── tasks/
    └── kata-spec/
        └── write-feature-spec/
            ├── instructions.md            # agent prompt: brief + persona+job ref
            ├── supervisor.task.md         # reserved (v1: unread per #870)
            ├── judge.task.md              # judge prompt (templated)
            ├── specs/                     # copied into agent CWD
            │   ├── brief.md               # the brief
            │   └── jtbd-excerpt.md        # the JTBD persona+job
            ├── workdir/scripts/preflight.sh  # `exit 0` — no scaffold to boot
            └── scoring/run.sh             # structural rubric; lives template-side
```

Checked in: `judge.md` (the family-local judge profile source), the task
tree, and `scripts/stage-family.sh`. Everything under `.claude/` and the
`apm.lock.yaml` are build output produced by the staging script and ignored
via `.gitignore`. The staging script copies `judge.md` into
`.claude/agents/judge.md` so the harness's judge contract is satisfied.

Design Decision 4 (judge profile lives inside the family) is preserved —
the source of truth is family-local. The mechanism shift (checked in at
`judge.md`, copied into `.claude/agents/` at staging time rather than
checked in directly under `.claude/`) is documented here because the
project harness blocks writes to nested `.claude/` paths.

## Staging regimes

`scripts/stage-family.sh --regime in-repo|published` produces the
`.claude/skills/kata-*` tree, the `.claude/agents/` profiles (including
`judge.md` copied from `./judge.md`), and a deterministic `apm.lock.yaml`.

| Regime | Source | Used by | `source_identity` |
| --- | --- | --- | --- |
| `in-repo` | Monorepo `.claude/skills/kata-*` and `.claude/agents/*.md` | `pull_request` trigger | `sha256:<hash-of-staged-contents>` |
| `published` | `forwardimpact/kata-skills` git repo, latest `main` | `workflow_dispatch` and `schedule` triggers | `<pack-version>@<commit-sha>` |

The lockfile's bytes flip iff the staged sources flip — `skillSetHash`
reflects that, per spec #890 § Success Criteria.

## Fixture safety

Files under `benchmarks/` are skipped by the canonical discovery commands per
[`benchmarks/README.md`](../README.md) § Fixture safety. The mechanism is the
same as the catalog's: path predicate (`benchmarks/**`) plus directory sentinel
(`benchmarks/.benchmark-fixture`).

## Substrate operational notes

Spec [#870](../../specs/870-fit-benchmark-coding-tasks/design-a.md) is the
source of truth for skill-pack staging, sandbox flags, agent-cwd discipline,
hidden-grading isolation, and the judge-profile-only-for-v1 constraint. This
README does not re-enumerate those notes.
