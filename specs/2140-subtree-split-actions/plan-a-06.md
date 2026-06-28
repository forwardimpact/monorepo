# Plan 2140-a-06: Debrand — repo-rename + repoint every sibling-name surface

Debrands the four siblings and repoints **every** monorepo surface that names
one of them (criterion 9). The repo-rename is a maintainer step; the repoints
are a normal monorepo PR gated on the rename being done first. The vendored-tree
repoint (Surface B) depends on part 01 having relocated the sources.

## Step 1: Rename the four sibling repos (maintainer)

GitHub repo-rename `fit-harness → harness`, `fit-benchmark → benchmark`,
`fit-wiki → wiki`, `fit-bootstrap → bootstrap`; leave `kata-agent`. Rename (not
create-new) so GitHub auto-redirects old paths and the `v1.0.x` tags travel with
the repo.

Verify: `forwardimpact/{harness,benchmark,wiki,bootstrap}` resolve;
`forwardimpact/fit-{harness,benchmark,wiki,bootstrap}` HTTP-redirect to them;
the four target names were free in the org before the rename.

## Step 2: Repoint every sibling-name surface

The repo identity lives in eight surface classes. Rewrite each
`forwardimpact/fit-{harness,benchmark,wiki,bootstrap}` reference to its renamed
owner/repo, leaving every `@<sha>` and `# v1` marker unchanged. `kata-agent`
references are left as-is throughout.

| # | Surface | Files | Note |
| - | --- | --- | --- |
| A | Workflow `uses:` pins | every `.github/workflows/*.yml`/`*.yaml` carrying a pin (discover: `rg -l 'forwardimpact/fit-(harness\|benchmark\|wiki\|bootstrap)' .github/workflows`) | includes the `benchmark` reusable-workflow ref in `eval-kata.yml` — **repoint, do not rely on redirect** (redirect coverage for reusable-workflow refs is not guaranteed) |
| B | Vendored sibling trees (from part 01) | the relocated homes — `products/kata/actions/kata-agent/action.yml` (its `bootstrap`/`harness`/`wiki` pins), `libraries/libharness/actions/benchmark/.github/workflows/benchmark.yml`, and any other in-tree `forwardimpact/fit-*` ref | the monorepo now owns this source; the projection republishes it |
| C | Enum source table | `.github/CLAUDE.md` § Third-party actions table rows | the `md-table` enum *source* (hand-edit; the seed cannot write the source) |
| D | Enum consumer fences | `CLAUDE.md` (`:list`), `KATA.md` (`:count`+`:list`) | reseed with the repository's enumeration-drift seed command, not by hand |
| E | `.github/CLAUDE.md` prose | the non-table mentions: the `bootstrap@v1`/`fit-wiki@v1` env prose, the `kata-agent`-delegates-to-`bootstrap` line, the `IS_SANDBOX` action list, and the `forwardimpact/fit-bootstrap/sub-action@v1` path example | part 06 owns **all** name tokens in this file; part 04 owns only the editing-guidance semantics and lands first |
| F | Local composite action | `.github/actions/coaligned-check/action.yml` | three prose/`::error::` mentions of `forwardimpact/fit-bootstrap` |
| G | Downstream skill templates | `.claude/skills/kata-setup/references/workflow-dispatch.md`, `workflow-shift.md` | emit `forwardimpact/fit-harness`/`fit-wiki` `uses:` and `gh api repos/forwardimpact/fit-*` into consuming installs |
| H | CLI help + golden | `libraries/libharness/src/commands/benchmark-definition.js` and its golden `libraries/libharness/test/golden/fit-benchmark/help.stdout.txt` | the help string names the **action repo** `forwardimpact/fit-benchmark`; edit source and golden together (the golden dir name `fit-benchmark/` is the CLI name — leave it). Run the repository test to confirm the golden matches |
| I | Public docs | `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md` | six `forwardimpact/fit-benchmark` consumption examples + reusable-workflow ref (technical-writer) |

**Intentionally left stale** (historical or synthetic — not repointed):
`specs/**` (prior spec/design/plan records), `**/CHANGELOG.md`, and
`libraries/libcoaligned/test/enumeration-drift.test.js` (synthetic tmpdir
grammar fixtures that never read the real repo; the rename does not break them).

## Step 3: Verify completeness repo-wide

Verify: `bun run invariants` (enumeration-drift) passes; the enum source table
and the `CLAUDE.md`/`KATA.md` fences show the four new names and `kata-agent`,
count still `Five`; the repository test passes (golden H matches). Then the
residual grep returns **only** the intentionally-stale set:

```sh
rg -n 'forwardimpact/fit-(harness|benchmark|wiki|bootstrap)' \
  -g '!specs/**' -g '!**/CHANGELOG.md' \
  -g '!libraries/libcoaligned/test/enumeration-drift.test.js' -g '!bun.lock'
```

(The pattern carries the `forwardimpact/` prefix, so bare `fit-*` CLI names —
which keep their names — are not false-positives.)

Libraries used: none.
