# Plan 2260-a Part 3: Brand surfaces — standard, website, skills, pack, catalogs

Depends on Parts 1–2 (the `jidoka` bin the skills invoke, the renamed rules
the skill-family scanners enforce, the product package that versions the
pack).

## Step 3.1 — Rebrand the standard

`git mv COALIGNED.md JIDOKA.md`, rewritten framing: same eight layers, layer
rules, and length caps; the identity section grounds the architecture in
jidoka (built-in quality, stop the line, never pass a defect downstream)
alongside the existing JTBD and Checklist Manifesto groundings; the title
becomes "Jidoka Instruction Architecture". Add the downstream migration
note — one short section: `git mv .coaligned .jidoka`, reinstall the pack
(`apm install forwardimpact/jidoka-skills`), swap the CLI name; an
unmigrated repo fails loudly with the loader's `rules directory not found`
error naming the expected location.

Reference repoints in the same commit:

| File | Change |
| --- | --- |
| `.rgignore` | `COALIGNED.md` → `JIDOKA.md` (the fixture-safety shield follows the file). |
| `MONOREPO.md` | L12/109/121/127 links and "Co-Aligned" prose → Jidoka forms. |
| `CONTRIBUTING.md` | L31 skill link → `jidoka-invariant`; any remaining standard-name prose. |
| `KATA.md` | L19/357 `COALIGNED.md` links → `JIDOKA.md`. |
| `.claude/skills/CLAUDE.md` | "COALIGNED.md § Length" → JIDOKA.md; the bare-CLI exception list `coaligned` → `jidoka`; the two rule-module paths → `.jidoka/invariants/…`. |
| `libraries/libharness/src/{facilitator,discusser,discuss-tools,supervisor,profile-prompt}.js` | Doc-comment references "COALIGNED.md § L0" etc. → JIDOKA.md (7 lines). |
| `libraries/libharness/test/prompts.test.js` | The 8 `describe("COALIGNED L0 — …")` labels → `JIDOKA L0 — …` (labels only; assertions untouched). |

**Verify:** `test ! -e COALIGNED.md`; `rg -n -i --hidden --no-ignore
'COALIGNED' --glob '!.git/**' --glob '!node_modules/**' --glob '!specs/**'
--glob '!wiki/**' --glob '!**/CHANGELOG.md'` returns only the JIDOKA.md
migration note (spec SC9).

## Step 3.2 — Rename and reframe the website

`git mv websites/coaligned websites/jidoka` and
`git mv .github/workflows/website-coaligned.yaml .github/workflows/website-jidoka.yaml`,
then:

| File | Change |
| --- | --- |
| `websites/jidoka/CNAME` | `www.jidoka.team` (spec SC10). |
| `robots.txt` | Sitemap URL → `https://www.jidoka.team/sitemap.xml`. |
| `llms.txt` | Rewrite: `# Jidoka`, the Toyota-concept story (same layer facts), install line → `apm install forwardimpact/jidoka-skills`, wire-in line → the installed `jidoka` binary or `npx @forwardimpact/jidoka`, standard link → JIDOKA.md. |
| `index.md` | Frontmatter title "Jidoka Instruction Architecture"; hero/story reframed to built-in quality with the same layer-stack visual language; CSS classes `coaligned-*` → `jidoka-*`; terminal snippet → `apm install forwardimpact/jidoka-skills` + scoped/bare CLI forms. |
| `index.template.html` | `<title>`, brand spans → Jidoka; both GitHub links → `forwardimpact/jidoka-skills`. |
| `assets/main.css` | Header comment and the `.coaligned-{section,hero,section-cool}` selectors → `jidoka-*` — same commit as `index.md` (coupled pair). |
| `website-jidoka.yaml` | `name: "Website: Jidoka Standard"`; paths → `websites/jidoka/**` + self-path; `site: jidoka`. |
| `.github/workflows/website.yml` | Input description site list → `(fit, monorepo, kata, jidoka)`. |
| `websites/CLAUDE.md` | Row → `Jidoka \| websites/jidoka/ \| www.jidoka.team`; serve example `--src=websites/jidoka`. |

Other-site brand references: `websites/README.md` L136 (`libcoaligned` →
`libinvariant`), `websites/fit/index.template.html` L95 and
`websites/fit/meta/index.md` L26 (footer/meta links → `jidoka.team`),
`websites/fit/docs/internals/release/index.md` L123 (CLI inventory →
`jidoka`), `websites/fit/docs/libraries/service-lifecycle/index.md`
L379-380, `websites/monorepo/index.md` L185/189,
`websites/monorepo/index.template.html` L54, `websites/monorepo/llms.txt`
L26/32 (install line, brand prose, domain).

**Verify:** `bunx fit-doc build --src=websites/jidoka` succeeds;
`rg -n -i coaligned websites/` returns nothing.

## Step 3.3 — Rename and reframe the five skills

`git mv` each of `.claude/skills/coaligned-{setup,audit,invariant,jtbd,layer}`
→ `.claude/skills/jidoka-*`, then per skill: frontmatter `name` → the new
id, `description` reframed to Jidoka vocabulary (what stays: the
trigger-condition structure); body prose swaps "Co-Aligned" → "Jidoka
instruction architecture"; CLI invocations stay **bare** (`jidoka`,
`jidoka instructions`, `jidoka jtbd --fix`, `jidoka invariants --seed …`);
asset paths self-update (`.claude/skills/jidoka-setup/assets/…`); the
`## Documentation` lists carry the same two entries as the bin's
`documentation` array (Step 1.2): the JIDOKA.md standard and the
`libinvariant` README URLs.

Cross-reference inventory (all in the same commit):

| Surface | Change |
| --- | --- |
| Intra-pack links | setup → {layer, jtbd, invariant, audit}; audit → {layer, jtbd}; layer → {setup}; `structure-decision.md` uses `../../jidoka-jtbd/…`. |
| `jidoka-setup` assets | `jobs-and-checklists.md` L6 CLI prose; `no-conflict-markers.rules.mjs` L5 skill-name comment. Step 4 wiring prose: the published CLI package is `@forwardimpact/jidoka`. |
| `.claude/skills/monorepo-setup/SKILL.md` | Every `coaligned-setup` → `jidoka-setup` (9 sites); L83 → `apm install forwardimpact/jidoka-skills forwardimpact/kata-skills --target claude`; L148 brand link → `https://www.jidoka.team/`; L46/112 `.coaligned/` → `.jidoka/`. |
| `monorepo-setup/references/check-workflows.md` | Generated CI templates: `npx coaligned <sub>` → `npx @forwardimpact/jidoka <sub>` (clean runners resolve from the registry; the bare name is squatted — plan-a.md § invocation rule); prose skill names. |
| `monorepo-setup/references/repo-skeleton.md` | devDependency → `"@forwardimpact/jidoka": "^0.2.0"`; `"check": "jidoka"`; resolution prose (the bin comes from the product package). |
| `monorepo-setup/references/wiki-init.md` | L6/57 skill names. |
| `references/bionova-apps/{spec.md,plan-a.md,plan-a-01.md}` | Living templates: `coaligned-setup` → `jidoka-setup`, `coaligned-skills` → `jidoka-skills`, `.coaligned/` → `.jidoka/`, CLI tokens (16 lines per the sweep). |

**Verify:** `ls .claude/skills/ | rg coaligned` empty (spec SC8);
`bun run invariants` green — `skill-template` and `skill-genericity` now
scan the `jidoka-*` dirs via the Part 1 regex flips, and no
`npx jidoka`/`bunx jidoka` token exists anywhere in `.claude/skills/`.

## Step 3.4 — Repoint the skill pack

**Modified:** `.github/workflows/publish-skills.yml`:

- Path filters: `.claude/skills/coaligned-*/**` → `jidoka-*/**`;
  `libraries/libcoaligned/package.json` → `products/jidoka/package.json`.
- The leg: `prefix: jidoka`, `repo: jidoka-skills`,
  `version-file: products/jidoka/package.json`, `readme-title: Jidoka
  Skills`, `readme-intro` reframed (Jidoka instruction architecture, the
  `jidoka` CLI, JIDOKA.md link) **carrying the one-line migration pointer**
  (renamed from `coaligned-skills`; `git mv .coaligned .jidoka`, swap the
  CLI), `apm-description` reframed.

The sibling repo rename itself is Step 4.0, pre-merge.

**Verify:** `rg -n coaligned .github/workflows/publish-skills.yml` empty.

## Step 3.5 — Product framing, catalogs, and counts

- `CLAUDE.md`: § Secondary Products — the "Co-Aligned Instructions
  Standard" entry becomes **Jidoka — `jidoka-skills`** ("Built-in quality
  for agent instructions: the check suite that stops the line when an
  instruction layer drifts. [JIDOKA.md](JIDOKA.md)"); § Distribution Model
  pack list → `forwardimpact/{fit-skills,kata-skills,jidoka-skills}`.
- Run `bun run context:fix`: regenerates `JTBD.md` (the Jidoka Big Hire
  appears under Teams Using Agents), the `products/README.md` catalog row,
  and the `libraries/README.md` catalog/jobs rows (`libinvariant`).
- Hand edits: `products/README.md` intro count sentence (reconcile the
  existing "eight products" against the now-ten catalog rows before writing
  the new number — the sentence lagged 2250); `libraries/README.md` L280/287
  hand-maintained lists (`libcoaligned` → `libinvariant`) if `context:fix`
  does not own them.

**Verify:** `bun run context:fix` produces no further diff; `bun run check`
green (spec SC13/SC15).

## Step 3.6 — Final rename gate (spec SC5)

```sh
rg --hidden --no-ignore -n -i coaligned \
  --glob '!.git/**' --glob '!node_modules/**' --glob '!specs/**' \
  --glob '!wiki/**' --glob '!**/CHANGELOG.md' --glob '!bun.lock'
```

Inspect every returned line. Allowed remainders: the migration note in
`JIDOKA.md` and the pack `readme-intro` in `publish-skills.yml` — nothing
else (the workflow-pin remainder class the spec reserves is empty: no
`clis:` list or pin line carries the token). Then `bun run context:fix`,
`bun run check`, and `bun run test` green — final gate for the PR. Confirm
the diff touches neither deferred decision (no DNS config, no bare-name
launcher — spec SC17).
