# `kata-skills` task family

Task family for `fit-benchmark` targeting the `forwardimpact/kata-skills`
skill pack. Runs on manual dispatch via `eval-kata.yml`.

Four tasks exercise the Plan→Do artifact spine — spec → design → plan →
implement — against **one shared mock app and one feature** (`todo list
--filter`, spec 042). The app is maintained once at the family level; each task
is seeded with its own *frozen* upstream artifacts, so it runs independently
while sharing a single coherent narrative. A fifth task, `coordinate-finding`,
exercises the **coordination half** of the loop — file → open change → gate →
merge — offline under the filesystem work tracker.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `spec-feature` | `kata-spec` | `spec.md` | Gates: file exists, no `file:line` leak. Scored: Problem/Scope/Success sections, JTBD citation. Judge |
| `design-feature` | `kata-design` | `design-a.md` | Gates: file exists, <200 lines. Scored: decisions, named trade-off. Judge |
| `plan-feature` | `kata-plan` | `plan-a.md` | Gate: file exists. Scored: Libraries-used line, Risks, design ref, verification. Judge |
| `implement-feature` | `kata-implement` | edits under `app/` | Hidden `tests/` suite: baseline regression as a gate, five scored feature checks. Judge: scope discipline |
| `coordinate-finding` | work-tracker operations | `.tracker/` work items | Gates: issue and change filed. Scored: change links the issue, `state: merged`, approval recorded. Judge |
| `product-issue-triage` | `kata-product-issue` | triaged `.tracker/` issue | Gate: issue still exists. Scored: closed, `wontfix`-labelled, rationale comment. Judge |

The work-tracking tasks are offline — run them under the filesystem tracker.
Run a single task with `--task`:

```text
fit-benchmark run --family=benchmarks/kata-skills --task=product-issue-triage --work-tracker=filesystem
```

Omit `--task` to run every task. The default tracker is `github`; production
leaves it. The artifact-spine tasks never read `LIBEVAL_WORK_TRACKER`, so they
are inert under `--work-tracker`.

## The shared app — family-level `workdir/`

The mock app lives once at `workdir/app/`. The harness copies a family-level
`workdir/` into **every** task's agent CWD (convention-over-configuration: it's
copied if present), so all four tasks get `app/` without any per-task scripting.
Per-task `workdir/` and `specs/` then overlay on top of this shared base.

```text
workdir/app/                    # the one mock app, shared by all tasks → cwd/app
tasks/spec-feature/workdir/     # brief.md + jtbd-excerpt.md  → cwd/ (spec input)
tasks/design-feature/specs/042-todo-filter/    spec.md         (design input)
tasks/plan-feature/specs/042-todo-filter/      spec.md, design-a.md
tasks/implement-feature/specs/042-todo-filter/ spec.md, design-a.md, plan-a.md
```

**The mock app** (`workdir/app/`) is a tiny `todo` CLI (`add` / `list` / `done`)
backed by a JSON store. It deliberately uses **only `node:` built-ins**
(`node:util.parseArgs`, `node:fs`, `node:test`) — no `@forwardimpact/*` or other
packages — so it runs in the benchmark CWD with **no install step**. Run its
tests with `node --test` from `workdir/app/`. The `--filter` feature is *not*
present in the fixture app; implementing it is the `implement-feature` task.

To change the app, edit `workdir/app/` once — all four tasks follow. The
per-task upstream artifacts (spec/design/plan) are deliberately frozen per task
so a benchmark's inputs never shift when a sibling task changes.

## Hidden tests

The `implement-feature` hidden suite lives at
`tasks/implement-feature/tests/` — an overlay mirror of the agent CWD that is
never copied into it, so the agent never sees the assertions. After the agent
runs, the harness stages each file at its mirrored path under `app/test/`,
runs every `*.test.js` check with `node --test`, emits one check row per
file, and restores the tree. `todo.gate.test.js` (a symlink to the family
workdir's baseline suite, so the baseline has one source) is the regression
gate; the five feature checks are scored at weight 1, which is what gives the
task its capability gradient. `feature-helpers.js` is support material —
staged, never graded. The task has no `invariants.sh`.

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required. The
`forwardimpact/kata-skills` pack stages every `kata-*` skill the tasks
reference.
