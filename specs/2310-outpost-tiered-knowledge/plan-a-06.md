# Plan 2310-a Part 06: Docs and the Published Skill

Rewrite the external documentation and the published `fit-outpost` skill.
Route to technical-writer. Runs in parallel with parts 04 and 05 after
part 03.

## Step 1: Product and getting-started pages

- Modified: `websites/fit/outpost/index.md`
- Modified: `websites/fit/docs/getting-started/engineers/outpost/index.md`

The product page carries the five-tier table with audiences, the root
model, the sharing-over-mounts model, and the validator command. The
getting-started guide shows the post-init layout (five tiers,
`Briefings/`, `registry.yaml`) and adds one validate step. Every example
path is tier-prefixed.

Verification: criterion 13 review: the tier table and
`npx fit-outpost validate` appear on both pages.

## Step 2: Knowledge-systems guides

- Modified: `websites/fit/docs/products/knowledge-systems/index.md`
- Modified: `websites/fit/docs/products/knowledge-systems/meeting-prep/index.md`

Rewrite every `Knowledge/` example path to the tier-prefixed form. The
index gains three short sections: the overlay forms, the export action,
and the metadata standard with its coherence payoff (Bases on
`type`/`status`, aliases, graph groups).

Verification: `rg -e 'Knowledge/' -e 'Drafts/'` over both files returns
nothing.

## Step 3: Published skill and CLI parity

- Modified: `.claude/skills/fit-outpost/SKILL.md`
- Modified: `.claude/skills/fit-outpost/references/cli.md`

Replace the `Knowledge/` graph description (line 72 area) with the tier
model: the tier table, the link rule in one sentence, the placement rule
in one sentence, and the `validate [path] [--json]` command with the
baseline behavior. Update every stale `validate` description: SKILL.md
lines 35 and 169 and `references/cli.md` line 11 still say "Validate
agent definitions exist" / "Verify agent/skill references exist". Keep
the `## Documentation` list byte-identical to the CLI `documentation`
array in `products/outpost/src/outpost.js` — the four existing entries
keep their titles and URLs, so no CLI change; confirm parity rather than
edit. Repository settings block direct `.claude/**` writes; apply these
edits through `echo … | bunx gemba-selfedit <path>`.

Verification: criterion 13's `rg` command over
`.claude/skills/fit-outpost/` returns nothing; `rg -n 'agent definitions
exist|references exist' .claude/skills/fit-outpost/` returns nothing; the
Documentation list and the CLI array match entry-for-entry.

## Writing constraints

External pages use `npm`/`npx` only, ASD-STE100 prose, and fully
qualified `www.forwardimpact.team` URLs. The published skill never names
monorepo paths.
