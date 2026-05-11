# Benchmarks

Task families for `fit-benchmark`. Each family lives under
`benchmarks/<family>/` and targets one skill pack under test.

## Families

| Family | Pack under test | Workflow |
| --- | --- | --- |
| [`kata-skills/`](kata-skills/) | `forwardimpact/kata-skills` | `eval-kata.yml` |

## Task family layout

```
benchmarks/<family>/
├── judge.md                     # family-local judge profile (checked in)
├── scripts/stage-family.sh      # regime-aware staging script
├── apm.lock.yaml                # build output (gitignored)
├── .claude/                     # build output (gitignored)
└── tasks/
    └── <task-name>/
        ├── instructions.md      # agent prompt
        ├── judge.task.md        # judge prompt (templated)
        ├── supervisor.task.md   # reserved for v2
        ├── specs/               # copied into agent CWD
        ├── workdir/             # copied into agent CWD
        │   └── scripts/preflight.sh
        └── scoring/
            └── run.sh           # structural rubric
```

Task IDs are directory names under `tasks/` (e.g. `write-feature-spec`).

## Adding a task

Add a directory under `benchmarks/<family>/tasks/<task-name>/` with the
required files shown above. The workflow runs all tasks in the family
automatically.

## Adding a family

1. Create `benchmarks/<family>/` with `judge.md`, `.gitignore`, and
   `scripts/stage-family.sh`.
2. Add tasks under `tasks/`.
3. Add a workflow under `.github/workflows/eval-<family>.yml`.

## Fixture safety

Every file under `benchmarks/` is machine-skippable as a fixture:

1. **Path predicate** — `benchmarks/**` is excluded via
   [`.rgignore`](../.rgignore) from all `rg` invocations.
2. **Directory sentinel** — `benchmarks/.benchmark-fixture` marks the tree
   for ancestor-walking tools.

Agent outputs (produced at run time in ephemeral CWDs) never land in the repo.
