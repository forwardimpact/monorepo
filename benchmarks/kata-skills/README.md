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
| `spec-feature` | `kata-spec` | `spec.md` | Structural rubric (Problem/Scope/Success, no `file:line` leak, JTBD citation) + judge |
| `design-feature` | `kata-design` | `design-a.md` | Rubric (exists, <200 lines, decisions, named trade-off) + judge |
| `plan-feature` | `kata-plan` | `plan-a.md` | Rubric (Libraries-used line, Risks, design ref, verification) + judge |
| `implement-feature` | `kata-implement` | edits under `app/` | Hidden test suite (baseline regression + feature) + judge (scope discipline) |
| `coordinate-finding` | work-tracker operations | `.tracker/` work items | Invariants (issue filed, change links it, `state: merged`, approval recorded) + judge |
| `product-issue-triage` | `kata-product-issue` | triaged `.tracker/` issue | Invariants (out-of-scope issue closed, `wontfix`-labelled, rationale comment) + judge |

The work-tracking tasks are offline — run them under the filesystem tracker.
Run a single task with `--task`:

```
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

```
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

The `implement-feature` feature test lives at
`tasks/implement-feature/hooks/feature.test.js`. Because `hooks/` is never copied
into the agent CWD, the agent never sees these assertions; `invariants.sh` copies
the file (via `$HOOKS_DIR`) into `app/test/` after the agent runs and executes
the full suite.

## Dependencies

Declared in `apm.yml`. `fit-benchmark run` calls `apm install --target claude`
automatically before each run — no manual staging step required. The
`forwardimpact/kata-skills` pack stages every `kata-*` skill the tasks reference.
