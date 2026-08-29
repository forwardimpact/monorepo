# Plan 2310-a Part 07: Convergence Fixture and Repository Gates

Prove criterion 11 with a product test and close the sweep criteria. Runs
last; depends on every other part.

## Step 1: Migration convergence test

A legacy fixture vault with the spec's seeded violations converges to a
passing validation through the playbook's mechanical operations, with the
human gates simulated by fixed inputs.

- Created: `products/outpost/test/kb-migration.integration.test.js`

Build a legacy vault in a temp directory: a `Knowledge/` wrapper with
`People/`, `Projects/`, `Candidates/`, a grown `Research/` directory, a
`Drafts/` directory with ledgers, a mixed-audience person note
(team facts plus a recruitment backlink), a wider-to-narrower link, a
bare wiki link, a by-design dangling link, notes without frontmatter, and
one note with legacy inline `**Key:**` metadata.

The test executes the MIGRATION.md phases mechanically with fixed gate
inputs (a hardcoded tier map for Gate 1, a fixed routing list for Gate 2,
the dangle on the baseline for Gate 3; Gate 4 is out of test scope):

1. Assert the validator fails the legacy layout and names MIGRATION.md
   (criterion 9 end-to-end).
2. Apply the moves per the tier map, split the mixed note per the
   deterministic split rules (facet overlay with `canonical`), rewrite
   links to the tier-prefixed form, stamp frontmatter from the fixture
   registry, move the ledgers, and write `validation-baseline.json` with
   the by-design dangle.
3. Assert `validateKnowledgeBase` returns zero new findings and exactly
   one baselined warning (criterion 11).

Verification: the test passes under `bun run test` and `node --test`.

## Step 2: Repository sweeps

Close every grep-shaped success criterion from the repo root.

- Modified: none (verification only; fix any hit in the owning part's
  files)

```sh
rg --hidden -e 'Knowledge/' -e 'Drafts/' products/outpost/templates/   # only MIGRATION.md hits (criterion 12)
rg -e 'Knowledge/' -e 'Drafts/' websites/fit/outpost/ \
  websites/fit/docs/getting-started/engineers/outpost/ \
  websites/fit/docs/products/knowledge-systems/ .claude/skills/fit-outpost/   # no hits (criterion 13)
rg --files-without-match '^## Tiers' products/outpost/templates/.claude/agents/*.md   # empty (criterion 3)
rg --files-without-match '^Write tier:' products/outpost/templates/.claude/skills/*/SKILL.md   # empty (criterion 4)
rg --files-without-match '^Frontmatter:' products/outpost/templates/.claude/skills/*/SKILL.md  # empty (criterion 18)
```

Verification: each command returns what its comment states.

## Step 3: Repository gates

- Modified: none

Run `bun run check` and `bun run test` (criterion 15). Jidoka instruction
and invariant checks cover the rewritten templates; `workspace-imports`
covers the `yaml` dependency. When `check` flags pre-existing `specs/**`
markdown outside this diff, confirm the file is untouched before treating
it as a regression.

Verification: both commands exit 0.

## Step 4: PR notes for the release

- Modified: none (PR body content)

The PR body states: clean break, next major (3.12.1 → 4.0.0) per
criterion 16, release notes must point to MIGRATION.md, and the npm
`os: ["darwin"]` limit on recipient-side `npx fit-outpost validate`
(plan-a.md § Risks) for product-manager follow-up.

Verification: PR body review.
