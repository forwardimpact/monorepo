# Plan 2250-a Part 3: Product framing — Gear refocus, page, skill, catalogs

Give the split its product story and keep every catalog and pack in sync.
Depends on Parts 1–2 (names and homes are final).

## Step 3.1 — Gear refocus

**Modified:** `products/gear/package.json`.

- `dependencies`: delete `@forwardimpact/libharness`, `@forwardimpact/libwiki`,
  `@forwardimpact/libxmr`. `@forwardimpact/svcspan` and everything else stays.
- `jobs[0].littleHire`: "query graphs, run vector search, expose services as
  MCP tools, or chart agent metrics without building infrastructure." → "query
  graphs, run vector search, or expose services as MCP tools without building
  infrastructure." (design names only the littleHire clause; the bigHire's
  eval-tooling phrasing stays with `libterrain`).

**Verify:** `rg 'libharness|libwiki|libxmr' products/gear/package.json`
returns nothing; `rg 'chart agent metrics' products/` returns nothing;
`bun install` resolves.

## Step 3.2 — Overview page and site card

**Created:** `websites/fit/gemba/index.md`,
`websites/fit/assets/scene-gemba.svg`.
**Modified:** `websites/fit/index.md`.

- `index.md` follows the Gear page shape (`layout: product`, hero, persona
  sections): the "stand up and operate an agent team" story; the runtime loop
  **stand up** (bootstrap action) → **run** (harness action /
  `gemba-harness`) → **see** (`gemba-trace`) → **remember** (wiki action /
  `gemba-wiki`) → **measure** (benchmark action / `gemba-xmr`), presented once
  for the CLI axis and once for the CI-actions axis; Getting Started names the
  bring-up layer (`forwardimpact/bootstrap`, the released `fit-install.sh`
  one-liner, `scripts/bootstrap.sh`) and `npx gemba-<cli>`; a section names
  Kata as the reference tenant. No `import` guidance anywhere — APIs are the
  libraries' pages (spec SC6).
- `scene-gemba.svg` follows the existing `scene-*.svg` style.
- `websites/fit/index.md` gains a Gemba product card beside Gear's.

**Verify:** `bunx fit-doc build websites/fit` (or the site's `just` recipe)
succeeds; the page renders both axes and the four run-loop CLIs (SC12).

## Step 3.3 — `gemba` product skill

**Created:** `.claude/skills/gemba/SKILL.md`.

When to hire the platform and how the capabilities compose into the loop
(stand up → run → see → remember → measure), pointing to the per-capability
`gemba-*` skills for command documentation. Per spec SC12 the skill itself
names the bring-up layer (the `bootstrap` action and its installer) and
references the four run-loop CLIs (`gemba-harness`, `gemba-trace`,
`gemba-wiki`, `gemba-xmr`), presenting the CI actions as the same loop.
Follows the house template (`## When to Use`, `## Documentation` last);
written generic per `.claude/skills/CLAUDE.md`. CLI-parity `## Documentation`
blocks stay on the capability skills (renamed in Part 1).

**Verify:** `bun run invariants` green (`skill-genericity` covers the new
skill after Part 1's prefix additions; `skill-template` scopes only the
kata/coaligned/monorepo packs and does not gate it); `bun run context` green.

## Step 3.4 — Pack staging for gemba skills

The `fit-skills` pack must carry the renamed capability skills and the product
skill; today `fit-pack stage --prefix fit` selects `skills/fit-*` only. The
repeatable `--prefix` and the exact-name match are a small libpack API
addition the design does not name — recorded here as a plan-level deviation
required by the pack-staging contract (the alternative, a new `gemba-skills`
sibling pack, would change the distribution model beyond the spec's scope).

| File | Change |
| --- | --- |
| `libraries/libpack/src/skill-pack.js` | Stage selection accepts repeated prefixes and matches `name === prefix \|\| name.startsWith(prefix + "-")` so `gemba` (the product skill) and `gemba-*` both select. |
| `libraries/libpack/bin/fit-pack.js` | `stage --prefix` becomes repeatable (its option parsing lives in the bin), threaded through to the stager. |
| `libraries/libpack/test/**` | Cover multi-prefix and exact-name selection. |
| `.github/actions/publish-skill-pack/action.yml` | `pack-prefix` documented as space-separated; the run step expands each prefix into a `--prefix` flag (a single-prefix value expands identically to today, so the change is inert until a leg passes two). |
| `.github/workflows/publish-skills.yml` | `on.push.paths` gains `.claude/skills/gemba*/**`. The fit leg **keeps `prefix: fit`** — the merge-triggered publish runs the SHA-pinned old `fit-pack` binary, which parses only a single `--prefix` (last wins) and would silently stage a fit-skills pack stripped of every `fit-*` skill; Part 4 Step 4.3 flips it to `fit gemba` once the repinned bootstrap installs the multi-prefix `fit-pack`. |
| `.claude/skills/CLAUDE.md` | "Skills prefixed `fit-*` and `kata-*` are published" → include `gemba*`; the bare-invoke exception list (`fit-*` / `kata-*` / `coaligned`) gains `gemba-*`; the CLI-location rule gains "Platform: `products/gemba/bin/gemba-<name>.js`". |
| `products/CLAUDE.md`, `libraries/CLAUDE.md` | CLI/skill linking policy: the six runtime CLIs' home is now the product; worked examples updated. |

**Verify:** `bun test libraries/libpack`; a local
`fit-pack stage --from .claude --prefix fit --prefix gemba --into /tmp/pack …`
dry run stages `gemba/`, `gemba-*/`, and every `fit-*/` skill.

## Step 3.5 — Kata framing and identity prose

| File | Change |
| --- | --- |
| `KATA.md` | A short paragraph naming Gemba as the platform Kata runs on — Kata is the reference tenant, the proof the substrate is generic — linking the overview page. No `products/kata/` change (SC13). |
| `CLAUDE.md` § Secondary Products | Add the Gemba entry (one line + overview link, same shape as Gear's); note Kata "runs on Gemba" in the Kata line if it reads naturally. |
| `CLAUDE.md` § Distribution Model | npm-packages line: `fit-*` and `kata-*` CLIs → `fit-*`, `gemba-*`, and `kata-*`. |

**Verify:** `git diff --stat products/kata/` is empty across the whole PR.

## Step 3.6 — Generated context and hand-maintained counts

- Run `bun run context:fix`: regenerates the `JTBD.md` and
  `products/README.md` catalog blocks (Gemba row appears, Gear's description
  unchanged unless edited) and the jobs lines.
- Hand edits: `products/README.md` intro product-count sentence (reconcile the
  existing "seven products" against the catalog before writing the new
  number); `websites/README.md` jobs line if `context:fix` flags it.

**Verify:** `bun run context:fix` produces no further diff; `bun run check`
and `bun run test` green — final gate for the PR (SC14). Final rename gate:
re-run the Part 1 verify `rg` unchanged; the allowed remainder is now only
its items (a) and (b) — the Part-2-owned action sources are moved and
renamed, so item (c) must be empty.
