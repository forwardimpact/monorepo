# Plan 2020 — Test-Runner Strategy

Executes [design-a](design-a.md) for [spec 2020](spec.md). Two independently
executable, independently green parts mirroring the spec's mandatory two-PR
sequencing (spec § Sequencing constraint). **PR 2 must not merge until PR 1's
`Test / gate` node job has been green on `main`.**

## Approach

Part 01 (PR 1) builds the `expect` shim in libmock, converges the 49 `bun:test`
importers onto `node:test` + the shim, adds the `scripts/test-gate.mjs` per-file
count-enforcing wrapper with its committed `floor.json`, adds the
`scripts/check-bun-test-imports.mjs` re-divergence guard, wires both a required
`Test / gate` node job and the guard step into `check-test.yml`, and documents
the resolved trade. Publish still calls `bun run test` here. Part 02 (PR 2) is
the one-line flip of both publish "Run tests" steps to `bun run test:gate`.
`node --test` hard-fails on any remaining `bun:` import, so the sweep and the
gate-script must land complete in one PR before the gate is enforced; the flip
rides a suite already proven green on `main`.

Libraries used: libmock (new `./expect` export beside `./mock`); no new external
dependencies — shim and scripts are stdlib-only.

## Part index

| Part | Scope | PR | Depends on |
| --- | --- | --- | --- |
| [plan-a-01](plan-a-01.md) | `expect` shim + test, 49-file sweep, `test:gate` wrapper + floor, re-divergence guard, required `Test / gate` job + guard step, resolved-trade doc | PR 1 | none |
| [plan-a-02](plan-a-02.md) | Flip both publish "Run tests" steps to `bun run test:gate` | PR 2 | PR 1 merged **and** `Test / gate` green on `main` |

## Execution

- **Sequential, two PRs.** Part 01 then Part 02 — Part 02's merge gate is Part
  01 green on `main`, so they cannot run in parallel.
- **Routing.** Both parts are code/CI work for an **engineering agent**
  (`staff-engineer`). Part 01 carries the substantive build; Part 02 is a
  two-line CI diff. The resolved-trade doc (Part 01 final step) is small prose
  inline with the code PR, not a separate `technical-writer` hand-off.

## Risks

- **Required-check registration is repo-admin, not in-repo.** Adding the `gate`
  job to `check-test.yml` makes it *run*; marking it a **required** status check
  is a branch-protection setting only a repo admin can flip. Part 01 ships the
  job and notes the admin step; if the check is not marked required, the gate
  runs but does not block — call this out in the PR body so the human can flip it.
- **Per-file wall-clock.** Part 01's wrapper runs `node --test` per file (design
  D4/D6), so the gate hits the per-file path (~87 s class in the spec's table),
  not node's 70.3 s batched baseline. Measure it; parallelise per-file runs if it
  dominates CI time. Enforcement is non-negotiable; speed is tunable.
- **`afterAll` is a rename, not a re-point.** One file (`serve.integration`)
  imports and calls `afterAll`; `node:test` has only `after`. The sweep must
  rename both the import and the call site, not just change the source module.

— Staff Engineer 🛠️
