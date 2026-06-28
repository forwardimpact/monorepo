# Plan 2140-a-06: Debrand — repo-rename + repoint `uses:` / enum / docs

Debrands the four siblings and repoints every monorepo surface that names them
(criterion 9). The repo-rename is a maintainer step; the repoint is a normal
monorepo PR gated on the rename being done first.

## Step 1: Rename the four sibling repos (maintainer)

GitHub repo-rename `fit-harness → harness`, `fit-benchmark → benchmark`,
`fit-wiki → wiki`, `fit-bootstrap → bootstrap`; leave `kata-agent`. Rename (not
create-new) so GitHub auto-redirects old paths and the `v1.0.x` tags travel with
the repo.

Verify: `forwardimpact/{harness,benchmark,wiki,bootstrap}` resolve;
`forwardimpact/fit-{harness,benchmark,wiki,bootstrap}` HTTP-redirect to them;
the four target names were free in the org before the rename.

## Step 2: Repoint every monorepo `uses:` line

Rewrite each `forwardimpact/fit-{harness,benchmark,wiki,bootstrap}` reference to
its renamed owner/repo, leaving the `@<sha>` and `# v1` marker unchanged. This
includes the `benchmark` reusable-workflow ref in `eval-kata.yml`
(`forwardimpact/benchmark/.github/workflows/benchmark.yml@<sha>`).

Files modified: every `.github/workflows/*.yml` / `*.yaml` carrying one of the
four pins (discover with
`rg -l 'forwardimpact/fit-(harness|benchmark|wiki|bootstrap)' .github/workflows`).

Verify:
`! rg -n 'forwardimpact/fit-(harness|benchmark|wiki|bootstrap)' .github/workflows`;
each rewritten line keeps its original `@<sha>` and `# v1` marker; `kata-agent`
pins are untouched.

## Step 3: Repoint the `sibling-composite-actions` enum + `.github/CLAUDE.md` table

Update the enum **source** and its consumers to the new names; the
`forwardimpact/` filter and the `Five` count are unchanged.

Files modified:

- `.github/CLAUDE.md` — § Third-party actions table rows (the `md-table` enum
  source) to `harness` / `benchmark` / `wiki` / `bootstrap`; the "every workflow
  calls `bootstrap@v1`" prose. (Coordinate with part 04, which rewrites the
  "Editing a published action" prose in the same file.)
- `CLAUDE.md` — the `enum:sibling-composite-actions:list` fenced block.
- `KATA.md` — the `enum:sibling-composite-actions` count + list fenced blocks.

Reseed the canonical fence bodies with the repository's enumeration-drift seed
command rather than hand-editing the consumer fences.

Verify: `bun run invariants` (enumeration-drift) passes; the source table and
the two consumer fences all show the four new names and `kata-agent`; the count
is still `Five`.

Libraries used: none.
