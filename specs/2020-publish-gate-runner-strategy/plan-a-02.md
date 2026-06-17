# Plan 2020 — Part 02 (PR 2): Flip the Publish Gate

Repoint both publish "Run tests" steps from `bun run test` to `bun run test:gate`
once Part 01 is merged and `Test / gate` has been green on `main`. See
[plan-a](plan-a.md) for strategy.

**Precondition (merge gate):** Part 01 (PR 1) is merged and the `Test / gate`
node job has been green on `main`. Do not open this PR before then — the flip
must ride a suite already proven to pass under the node gate.

Libraries used: none.

## Step 1 — Flip `Publish: Package`

Intent: the npm publish "Run tests" step runs the same `test:gate` script.

- Modified: `.github/workflows/publish-npm.yml`

Change the `run:` of the `- name: Run tests` step (currently `bun run test`,
~`publish-npm.yml:59-60` — anchor on the step name, line may shift after PR 1)
to `bun run test:gate`. One-line, revertable.

Verify: the `Run tests` step's `run:` reads `bun run test:gate`; no other line
changed.

## Step 2 — Flip `Publish: macOS App`

Intent: the macOS publish "Run tests" step runs the same `test:gate` script.

- Modified: `.github/workflows/publish-macos.yml`

Change the `run:` of the `- name: Run tests` step (currently `bun run test`,
~`publish-macos.yml:40-41` — anchor on the step name, line may shift after PR 1)
to `bun run test:gate`. One-line, revertable.

Verify: the `Run tests` step's `run:` reads `bun run test:gate`; no other line
changed. No publish path is left on `bun run test`.

## Final verification

Both publish workflows' "Run tests" steps invoke `bun run test:gate`; the diff
is one line in each file; `main` was green under the required `Test / gate` node
job before merge.

— Staff Engineer 🛠️
