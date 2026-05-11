# Benchmarks

Top-level catalog of `fit-benchmark` task families. Each family lives under
`benchmarks/<pack-name>/` and targets one skill pack under test.

## Existing families

| Family | Pack under test | v1 task |
| --- | --- | --- |
| [`kata-skills/`](kata-skills/) | `forwardimpact/kata-skills` | `kata-spec/write-feature-spec` |

## Per-family layout

A family is a valid `fit-benchmark` family per spec
[#870](../specs/870-fit-benchmark-coding-tasks/design-a.md). At minimum it
carries:

- `apm.lock.yaml` at the family root (bytes drive `skillSetHash`).
- `.claude/skills/` — staged skill pack under test (build output, not checked in).
- `.claude/agents/` — agent profiles (build output) plus the family-local
  `judge.md` (checked in).
- `tasks/<task-family>/<task-name>/` — each task with `instructions.md`,
  `supervisor.task.md` (reserved in v1), `judge.task.md`, `specs/`,
  `workdir/scripts/preflight.sh`, and `scoring/run.sh`.
- `scripts/stage-family.sh` — regime-aware build script that produces the
  `.claude/` tree and the lockfile.

The `scripts/stage-family.sh` script accepts `--regime in-repo|published` and
is the only mechanism that touches the staged tree.

## Adding a new family

1. Create `benchmarks/<pack>/` with a `README.md` documenting the v1 task list
   and a link to spec #870 for substrate-level operational notes (skill-pack
   staging, sandbox flags, agent-cwd discipline, judge-profile-only-for-v1).
2. Check in `benchmarks/<pack>/.claude/agents/judge.md` and a `.gitignore` that
   excludes everything else under `.claude/` plus `apm.lock.yaml`.
3. Write `scripts/stage-family.sh` that produces a deterministic `apm.lock.yaml`
   and stages `.claude/skills/` from the regime-selected source.
4. Add the tasks under `tasks/<task-family>/<task-name>/`.
5. Add a workflow under `.github/workflows/benchmark-<pack>.yml` driving the
   three trigger signals (`workflow_dispatch`, `schedule`, `pull_request`).

## Fixture safety

Every file checked into `benchmarks/` is unambiguously machine-skippable as a
fixture without parsing its body. Two independent mechanisms apply:

1. **Path predicate** — `benchmarks/**` is the primary marker. The repo-root
   [`.rgignore`](../.rgignore) excludes the prefix from every `rg` invocation,
   so the canonical monorepo discovery commands in [`CLAUDE.md`](../CLAUDE.md)
   § Jobs and Checklists pick up the exclusion implicitly. Other crawlers can
   apply the same predicate via `--glob '!benchmarks/**'` or equivalent.
2. **Directory sentinel** — `benchmarks/.benchmark-fixture` is an empty file
   that ancestor-walking tools without monorepo-path awareness detect by
   looking up the directory tree.

Agent **outputs** (produced at run time inside per-task ephemeral CWDs) are
not in scope here — they never land in the repo.

## Substrate operational notes

Spec [#870](../specs/870-fit-benchmark-coding-tasks/design-a.md) is the source
of truth for: skill-pack staging contracts, sandbox flag policy, agent-cwd
discipline, hidden-grading isolation, and the judge-profile-only-for-v1
constraint. This catalog does not re-enumerate those notes.
