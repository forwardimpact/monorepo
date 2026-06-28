# Plan 2140-a: Co-located action sources + bidirectional subtree-split publishing

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Move the five composite actions' canonical source into the monorepo at the homes
the design fixes, then add a deterministic outbound split that mirrors each
prefix to its sibling `main` with a non-force push (rejection = drift), an
inbound `git am --directory` replay recipe for external sibling PRs, and the
`MONOREPO.md` / `.github/CLAUDE.md` documentation. The publish workflow lands
`workflow_dispatch`-only so a CI push cannot fire against pre-migration sibling
history; a maintainer seeds the lineage once, then a follow-up enables the push
trigger. Consumption is untouched: `uses:` lines stay SHA-pinned with `# v1`,
Dependabot keeps bumping them, and no gitlink is introduced.

## Shared reference: prefix → sibling → home → consumed-as

| Prefix (split)                                | Sibling repo  | Home == sibling root | Consumed as              |
| --------------------------------------------- | ------------- | -------------------- | ------------------------ |
| `libraries/libharness/actions/fit-harness`    | `fit-harness`   | yes | `forwardimpact/fit-harness@<sha> # v1`   |
| `libraries/libharness/actions/fit-benchmark`  | `fit-benchmark` | yes | `forwardimpact/fit-benchmark@<sha> # v1` (+ `/.github/workflows/benchmark.yml`) |
| `libraries/libwiki/actions/fit-wiki`          | `fit-wiki`      | yes | `forwardimpact/fit-wiki@<sha> # v1`      |
| `products/kata/actions/kata-agent`            | `kata-agent`    | yes | `forwardimpact/kata-agent@<sha> # v1`    |
| `.github/actions/fit-bootstrap`               | `fit-bootstrap` | yes | `forwardimpact/fit-bootstrap@<sha> # v1` (not consumed locally) |

Each home mirrors the **whole sibling repo root** byte-for-byte — `action.yml`,
sub-actions, reusable workflows, `LICENSE`, `README`, and the sibling's own
`.github/` meta — so the projection is faithful in both directions.

## Parts

| Part | Title | Independently executable | Depends on |
| ---- | ----- | --- | --- |
| [01](plan-a-01.md) | Relocate the five action sources + quality-suite exclusions | yes | — |
| [02](plan-a-02.md) | Outbound: `split-and-push` action + `publish-actions.yml` (dispatch-only) | yes | — |
| [03](plan-a-03.md) | Inbound: pull-back replay recipe | yes | — |
| [04](plan-a-04.md) | Standard: `MONOREPO.md` section + `.github/CLAUDE.md` rewrite | yes | — |
| [05](plan-a-05.md) | Seed runbook + enable the push trigger (maintainer, publish-time) | no | 01 + 02 merged |

## Execution

- **Parallel:** 01, 02, 03, 04 are independent at authoring time — 02 references
  the prefixes as strings, not the relocated files. Route 01 and 02 to an
  **engineering agent** (`staff-engineer`); the `splitsh-lite` SHA pin in 02
  goes through **`security-engineer`** review per dependency policy. Route 03 to
  an **engineering agent**. Route 04 to **`technical-writer`**.
- **Merge order:** land **01 before 02's first dispatch run** (the split needs
  the homes on `main`). 03 and 04 merge in any order.
- **Sequential, last:** 05 is a maintainer runbook executed at publish time
  after 01 and 02 are on `main`; criteria 2, 3, and 6 are verified by its seed
  run and the subsequent CI publishes, not inside any PR gate.

## Risks

- **Seed force-replace on the wrong ref breaks the published lineage.** The seed
  is the only sanctioned force push; it is isolated to part 05's reviewed
  maintainer runbook, and the workflow itself passes no `--force`.
- **`splitsh-lite` version drift turns the next push into a non-fast-forward.**
  Both the action (part 02) and the seed (part 05) must use the *same*
  SHA-pinned binary; a bump is a deliberate re-seed staged through
  `security-engineer`.
- **App not installed on every sibling.** With `fail-fast: false` one matrix leg
  fails silently; criterion 2 requires all five to publish, so part 05 verifies
  the install set across all five repos.
- **A relocated home trips a monorepo authored-source linter** (eslint/biome/
  rumdl/test glob), so criterion 8 stays red. Part 01 excludes every home from
  each tool that sweeps it; the implementer extends the ignore set for any
  further tool that `check`/`test` surfaces over the vendored trees.

Libraries used: none.
