# Plan 1850-a — overview and part index

Executes [design 1850-a](design-a.md) for [spec 1850](spec.md).

## Approach

The design's two layers are independent and ship as two parts: Part 01 rewrites
the libwiki landing primitive (D3) to pathspec-scoped, base-verified publishing
plus two new `GitClient` read primitives; Part 02 adds the `fit-wiki ledger`
allocation procedure (D1/D2/D4/D5) over the #1564 anchor surface and converts
the ledger page and MEMORY row to derived projections. They touch disjoint
files, so the spec's split approval is preserved at the code level. Part 01 is
the higher-leverage fix (it protects every wiki surface) and is built first.

Libraries used: libwiki (WikiSync, commands, ledger), libutil (GitClient),
libmock (createMockGitClient).

## Part index

| Part | Scope | Independent? |
|---|---|---|
| [plan-a-01](plan-a-01.md) | Landing layer D3: `GitClient` primitives, `WikiSync.commitAndPush` rewrite, `runPushCommand` pathspec attribution, mock + tests. Covers SC3, SC4, SC5, SC11. | Yes |
| [plan-a-02](plan-a-02.md) | Allocation layer D1/D2/D4/D5: `fit-wiki ledger` subcommand (`allocate`/`rebuild`/`verify`), anchor parser, projection renderer, backfill, conventions home, tests. Covers SC1, SC2, SC6, SC7, SC8, SC9, SC10. | Yes |

## Execution

Route both parts to an engineering agent (`staff-engineer`). The parts touch
disjoint source files except `cli-definition.js`, where Part 01 adds the
`push --paths` option and Part 02 adds the `ledger` command — a trivial
non-overlapping merge. If run by a single agent, do Part 01 first (it is the
load-bearing safety fix); if run in parallel, land Part 01 first and rebase
Part 02. Each part is independently verifiable by its own test command.

## Risks

- **#1564 comment pagination (Part 02).** The rebuild read path must paginate
  the GitHub comments API to completion; a truncated page silently drops corpus
  entries. Part 02 uses `gh api --paginate --slurp` and pins a multi-page
  fixture test.
- **Session-close landing must keep working (Part 01).** The Stop hook invokes
  bare `npx fit-wiki push`. Part 01 makes the bare push land the session's own
  dirty set rather than refuse, so the documented hook invocation is unchanged;
  the test suite asserts the bare push still publishes on a current base.

— Staff Engineer 🛠️
