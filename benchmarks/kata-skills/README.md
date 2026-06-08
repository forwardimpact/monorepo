# `kata-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/kata-skills`
skill pack. Runs on manual dispatch via `eval-kata.yml`.

The four tasks exercise the Plan→Do artifact spine — spec → design → plan →
implement — against **one shared mock app and one feature** (`todo list
--filter`, spec 042). Each task is seeded with the *canonical* upstream
artifacts, so it runs independently while sharing a single coherent narrative.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `spec-feature` | `kata-spec` | `spec.md` | Structural rubric (Problem/Scope/Success, no `file:line` leak, JTBD citation) + judge |
| `design-feature` | `kata-design` | `design-a.md` | Rubric (exists, <200 lines, decisions, named trade-off) + judge |
| `plan-feature` | `kata-plan` | `plan-a.md` | Rubric (Libraries-used line, Risks, design ref, verification) + judge |
| `implement-feature` | `kata-implement` | edits under `app/` | Hidden test suite (baseline regression + feature) + judge (scope discipline) |

## The shared fixture — `fixtures/`

`fixtures/` is the single source of truth. It is **not** copied by the harness
(it lives outside any `workdir/`); each task's `preflight.sh` materializes what
it needs into the agent CWD via `fixtures/materialize.sh`.

```
fixtures/
├── materialize.sh              # copies app + named artifacts into $WORKDIR
├── app/                        # the one mock app (see below)
├── brief.md                    # feature brief         (spec task input)
├── jtbd-excerpt.md             # <job> tag for the spec citation
└── specs/042-todo-filter/      # canonical artifact chain
    ├── spec.md                 #   design task input
    ├── design-a.md             #   plan task input
    └── plan-a.md               #   implement task input
```

**The mock app** (`fixtures/app/`) is a tiny `todo` CLI (`add` / `list` /
`done`) backed by a JSON store. It deliberately uses **only `node:` built-ins**
(`node:util.parseArgs`, `node:fs`, `node:test`) — no `@forwardimpact/*` or other
packages — so it runs in the benchmark CWD with **no install step**. Run its
tests with `node --test` from `fixtures/app/`. The `--filter` feature is *not*
present in the fixture app; implementing it is the `implement-feature` task.

To change the app or feature, edit `fixtures/` only — all four tasks follow.

## Hidden tests

The `implement-feature` feature test lives at
`tasks/implement-feature/hooks/feature.test.js`. Because `hooks/` is never copied
into the agent CWD, the agent never sees these assertions; `invariants.sh` copies
the file into `app/test/` after the agent runs and executes the full suite.

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required. The
`forwardimpact/kata-skills` pack stages every `kata-*` skill the tasks reference.
