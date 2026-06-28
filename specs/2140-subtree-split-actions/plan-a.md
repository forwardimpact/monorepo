# Plan 2140-a: Co-located action sources + bidirectional subtree-split publishing

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Debrand four siblings (`fit-harness → harness`, `fit-benchmark → benchmark`,
`fit-wiki → wiki`, `fit-bootstrap → bootstrap`; `kata-agent` unchanged) via
GitHub repo-rename so old pins redirect, then move the five composite actions'
canonical source into the monorepo at the homes the design fixes, add a
deterministic outbound split that mirrors each prefix to its renamed sibling
`main` with a non-force push (rejection = drift), an inbound
`git am --directory` replay recipe for external sibling PRs, and the
`MONOREPO.md` / `.github/CLAUDE.md` documentation. The publish workflow lands
`workflow_dispatch`-only so a CI push cannot fire against pre-migration sibling
history; a maintainer renames the repos and seeds the lineage once, then a
follow-up enables the push trigger. The consumption mechanism is untouched:
`uses:` lines stay SHA-pinned with `# v1` (only the repo name changes),
Dependabot keeps bumping them, and no gitlink is introduced. The
`fit-*`/`kata-*` CLIs, npm packages, and skill repos keep their names.

## Shared reference: prefix → sibling → home → consumed-as

| Prefix (split)                              | Sibling repo (renamed) | Home == sibling root | Consumed as              |
| ------------------------------------------- | ------------- | -------------------- | ------------------------ |
| `libraries/libharness/actions/harness`      | `harness`   | yes | `forwardimpact/harness@<sha> # v1`   |
| `libraries/libharness/actions/benchmark`    | `benchmark` | yes | `forwardimpact/benchmark@<sha> # v1` (+ `/.github/workflows/benchmark.yml`) |
| `libraries/libwiki/actions/wiki`            | `wiki`      | yes | `forwardimpact/wiki@<sha> # v1`      |
| `products/kata/actions/kata-agent`          | `kata-agent` | yes | `forwardimpact/kata-agent@<sha> # v1`    |
| `.github/actions/bootstrap`                 | `bootstrap` | yes | `forwardimpact/bootstrap@<sha> # v1` (not consumed locally) |

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
| [05](plan-a-05.md) | Seed runbook + enable the push trigger (maintainer, publish-time) | no | 01 + 02 + 04 + 06 merged + rename done |
| [06](plan-a-06.md) | Debrand: repo-rename + repoint every sibling-name surface (10 classes) | no | repo-rename first; 01 (vendored trees) + 04 (`.github/CLAUDE.md` prose) landed |

## Execution

- **Maintainer first:** the GitHub repo-rename (part 06 Step 1) happens before
  the repoint and the seed, so both old and new names resolve.
- **Parallel:** 01, 02, 03, 04 are independent at authoring time (02 references
  repo names as strings, not relocated files). Route 01, 02 to an **engineering
  agent** (`staff-engineer`); the `splitsh-lite` SHA pin in 02 goes through
  **`security-engineer`** per dependency policy. Route 03 to an **engineering
  agent**. Route 04 to **`technical-writer`**.
- **Part 06 last among the code PRs:** its repoint sweep needs the vendored
  trees (01) and the `.github/CLAUDE.md` editing-guidance prose (04) already on
  `main`, so 06 owns the single repo-wide name swap and the residual-grep gate.
  Part 06's public-doc surface (I) routes to **`technical-writer`**; the rest to
  an **engineering agent**. `.github/CLAUDE.md` has exactly one name-token owner
  (06), removing the 04↔06 seam.
- **Merge order:** repo-rename → land 01 and 04 → 06 (repoint + grep) → 02; land
  **01 before 02's first dispatch run** (the split needs the homes on `main`).
  03 merges anytime.
- **Sequential, last:** 05 is a maintainer runbook executed at publish time
  after 01, 02, 04, 06, and the rename are on `main`; criteria 2, 3, and 6 are
  verified by its seed run and the subsequent CI publishes, not inside any PR
  gate.

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
- **Repoint before rename, or a missed reference.** Repointing to a name that
  does not exist yet breaks CI; part 06 gates the repoint on the repo-rename
  being done first (redirects then cover any line not yet bumped). The repo
  identity lives in ten surface classes (part 06 Step 2), not just
  `.github/workflows` — a miss resolves via redirect, so the failure mode is
  silent staleness, not breakage. Criterion 9 is gated by a repo-wide
  **`--hidden`** residual grep (plain `rg` skips `.github/`/`.claude/`) that
  must return only the intentionally-stale set, plus a re-read of the three
  bare-name files.
- **A renamed repo collides with an existing `forwardimpact/` repo.** `harness`,
  `benchmark`, `wiki`, `bootstrap` must be free in the org before the rename;
  part 06 Step 1 checks availability first.

Libraries used: none.
