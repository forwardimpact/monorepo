# `kata-skills` task family

This task family serves `fit-benchmark`. It targets the
`forwardimpact/kata-skills` skill pack. It runs on manual dispatch through
`eval-kata.yml`.

Four tasks exercise the Plan→Do artifact spine of spec → design → plan →
implement. They run against **one shared mock app and one feature** (`todo list
--filter`, spec 042). This family maintains the app once, at the family level.
Each task carries its own *frozen* upstream artifacts. Each task therefore runs
independently, and all the tasks share one coherent narrative. A fifth task,
`coordinate-finding`, exercises the **coordination half** of the loop: file →
open change → gate → merge. It runs offline under the filesystem work tracker.

## Tasks

| Task | Skill exercised | Agent produces | Grading |
| --- | --- | --- | --- |
| `spec-feature` | `kata-spec` | `spec.md` | Gates: file exists, no `file:line` leak. Scored: Problem/Scope/Success sections, JTBD citation. Judge |
| `design-feature` | `kata-design` | `design-a.md` | Gates: file exists, <200 lines. Scored: decisions, named trade-off. Judge |
| `plan-feature` | `kata-plan` | `plan-a.md` | Gate: file exists. Scored: Libraries-used line, Risks, design ref, verification. Judge |
| `implement-feature` | `kata-implement` | edits under `app/` | Hidden `tests/` suite: baseline regression as a gate, five scored feature checks. Judge: scope discipline |
| `coordinate-finding` | work-tracker operations | `.tracker/` work items | Gates: issue and change filed. Scored: change links the issue, `state: merged`, approval recorded. Judge |
| `product-issue-triage` | `kata-product-issue` | triaged `.tracker/` issue | Gate: issue still exists. Scored: closed, `wontfix`-labelled, rationale comment. Judge |

The tasks that use the work tracker are offline. Run them under the filesystem
tracker. Run a single task with `--task`:

```text
fit-benchmark run --family=benchmarks/kata-skills --task=product-issue-triage --work-tracker=filesystem
```

Omit `--task` to run every task. The default tracker is `github`. Production
leaves it unchanged. The artifact-spine tasks never read
`LIBEVAL_WORK_TRACKER`, so they are inert under `--work-tracker`.

## The shared app — family-level `workdir/`

The mock app lives once at `workdir/app/`. The harness copies a family-level
`workdir/` into **every** task's agent CWD. It copies the directory if it is
present, by convention over configuration. All four tasks therefore get `app/`
with no per-task script. Per-task `workdir/` and `specs/` then overlay on top of
this shared base.

```text
workdir/app/                    # the one mock app, shared by all tasks → cwd/app
tasks/spec-feature/workdir/     # brief.md + jtbd-excerpt.md  → cwd/ (spec input)
tasks/design-feature/specs/042-todo-filter/    spec.md         (design input)
tasks/plan-feature/specs/042-todo-filter/      spec.md, design-a.md
tasks/implement-feature/specs/042-todo-filter/ spec.md, design-a.md, plan-a.md
```

**The mock app** (`workdir/app/`) is a tiny `todo` CLI (`add` / `list` /
`done`). A JSON store backs it. It deliberately uses **only `node:` built-ins**
(`node:util.parseArgs`, `node:fs`, `node:test`). It uses no `@forwardimpact/*`
package and no other package. It therefore runs in the benchmark CWD with **no
install step**. Run its tests with `node --test` from `workdir/app/`. The
fixture app does *not* have the `--filter` feature. The `implement-feature` task
adds it.

To change the app, edit `workdir/app/` once. All four tasks then follow. Each
task deliberately freezes its own upstream artifacts (spec/design/plan). A
benchmark's inputs therefore never shift when a sibling task changes.

## Hidden tests

The `implement-feature` hidden suite lives at
`tasks/implement-feature/tests/`. It is an overlay mirror of the agent CWD. The
harness never copies it into the CWD, so the agent never sees the assertions.
After the agent runs, the harness stages each file at its mirrored path under
`app/test/`. It runs every `*.test.js` check with `node --test`. It emits one
check row per file. It then restores the tree. `todo.gate.test.js` is the
regression gate. It is a symlink to the family workdir's baseline suite, so the
baseline has one source. The harness scores the five feature checks at weight 1.
That weight gives the task its capability gradient. `feature-helpers.js` is
support material. The harness stages it and never grades it. The task has no
`invariants.sh`.

## Dependencies

`apm.yml` declares the dependencies. `fit-benchmark run` calls
`apm install --target claude` automatically before each run. You stage nothing
by hand. The `forwardimpact/kata-skills` pack stages every `kata-*` skill the
tasks reference.
