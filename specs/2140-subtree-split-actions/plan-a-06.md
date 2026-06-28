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

The repo identity lives in ten surface classes. Rewrite each reference to its
renamed owner/repo, leaving every `@<sha>` and `# v1.0.x` marker unchanged.
`kata-agent` references are left as-is throughout. **Two token forms appear:**
prefixed (`forwardimpact/fit-benchmark`) and **bare** (`fit-bootstrap@v1`,
`gh api repos/.../fit-harness`). Repoint a bare token only when it names the
**action/repo**; leave bare `fit-*` that names the **CLI command** the action
runs (the `wiki` action still invokes the `fit-wiki` CLI).

| # | Surface | Files | Note |
| - | --- | --- | --- |
| A | Workflow `uses:` pins | every `.github/workflows/*.yml`/`*.yaml` carrying a pin (discover: `rg -l 'forwardimpact/fit-(harness\|benchmark\|wiki\|bootstrap)' .github/workflows`) | includes the `benchmark` reusable-workflow ref in `eval-kata.yml` — **repoint, do not rely on redirect** (redirect coverage for reusable-workflow refs is not guaranteed) |
| B | Vendored sibling trees (from part 01) | the relocated homes — `products/kata/actions/kata-agent/action.yml` (its `bootstrap`/`harness`/`wiki` pins), `libraries/libharness/actions/benchmark/.github/workflows/benchmark.yml`, and any other in-tree `forwardimpact/fit-*` ref | the monorepo now owns this source; the projection republishes it |
| C | Enum source table | `.github/CLAUDE.md` § Third-party actions table rows | the `md-table` enum *source* (hand-edit; the seed cannot write the source) |
| D | Enum consumer fences | `CLAUDE.md` (`:list`, brace-expansion form), `KATA.md` (`:count`+`:list`) | reseed with the repository's enumeration-drift seed command, not by hand; verified by the enum-drift invariant, not the grep |
| E | `.github/CLAUDE.md` prose | non-table mentions, prefixed and bare: the `fit-bootstrap@v1`/`fit-wiki@v1` env prose, the `kata-agent`-delegates-to-bootstrap line, the `IS_SANDBOX` action list, the table-purpose prose, and the `forwardimpact/fit-bootstrap/sub-action@v1` path example | part 06 owns **all** action-name tokens in this file; part 04 owns only the editing-guidance semantics and lands first |
| F | Local composite action | `.github/actions/coaligned-check/action.yml` | two prefixed (`forwardimpact/fit-bootstrap`, lines 11/67) + one bare (`installed by fit-bootstrap`, line 64) — all name the bootstrap action |
| G | Downstream skill templates | `.claude/skills/kata-setup/references/workflow-dispatch.md` (prefixed `uses:`), `workflow-shift.md` (bare `fit-harness`/`fit-wiki` in `gh api repos/...` prose) | emit `uses:`/tag-lookup refs into consuming installs |
| H | CLI help + golden | `libraries/libharness/src/commands/benchmark-definition.js` and its golden `libraries/libharness/test/golden/fit-benchmark/help.stdout.txt` | the help string names the **action repo** `forwardimpact/fit-benchmark`; edit source and golden together (the golden dir name `fit-benchmark/` is the CLI name — leave it). Run the repository test to confirm the golden matches |
| I | Public docs | `websites/fit/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md` | six `forwardimpact/fit-benchmark` consumption examples + reusable-workflow ref (technical-writer) |
| J | Published skill | `.claude/skills/fit-benchmark/SKILL.md` (lines 116/121/199) | three `forwardimpact/fit-benchmark@v1` action references in a published `fit-*` skill (technical-writer) |

**Intentionally left stale** (historical or synthetic — not repointed):
`specs/**` (prior spec/design/plan records), `**/CHANGELOG.md`, and
`libraries/libcoaligned/test/enumeration-drift.test.js` (synthetic tmpdir
grammar fixtures that never read the real repo; the rename does not break them).

## Step 3: Verify completeness repo-wide

Verify: `bun run invariants` (enumeration-drift) passes; the enum source table
and the `CLAUDE.md`/`KATA.md` fences show the four new names and `kata-agent`,
count still `Five`; the repository test passes (golden H matches). Then the
**`--hidden`** residual grep (plain `rg` skips dot-dirs, so it would miss every
`.github/` and `.claude/` surface) returns **only** the intentionally-stale set:

```sh
rg -n --hidden 'forwardimpact/fit-(harness|benchmark|wiki|bootstrap)' \
  -g '!.git/**' -g '!**/dist/**' -g '!.claude/worktrees/**' \
  -g '!specs/**' -g '!**/CHANGELOG.md' \
  -g '!libraries/libcoaligned/test/enumeration-drift.test.js' -g '!bun.lock'
```

This catches every **prefixed** ref. **Bare** action-name tokens (surfaces E, F,
G) are not `forwardimpact/`-anchored and would collide with legitimate `fit-*`
CLI mentions under a blanket grep, so verify them by re-reading those three
enumerated files: no bare `fit-{harness,benchmark,wiki,bootstrap}` that names
the **action** remains (CLI-command mentions stay). The enum consumers (D) are
verified by the enum-drift invariant above, not the grep (the brace-expansion
form in `CLAUDE.md` is not `forwardimpact/fit-…`-shaped).

Libraries used: none.
