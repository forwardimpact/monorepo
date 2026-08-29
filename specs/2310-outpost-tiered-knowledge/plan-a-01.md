# Plan 2310-a Part 01: KB Validator Module

Deliver `kb-validator.js` as a pure module with its complete unit-test
suite. Nothing in this part touches the CLI. All contracts come from
design-a.md § Interfaces.

## Step 1: Declare the `yaml` dependency

Add the YAML parser the frontmatter and registry checks need.

- Modified: `products/outpost/package.json`

Add `"yaml": "^2.9.0"` to `dependencies` (the pin every other consumer in
the repo uses). Run `bun install`.

Verification: `bun install` resolves; the Step 3 tests exercise every YAML
path. (`workspace-imports` guards `@forwardimpact/*` imports only, so it
does not cover this declaration.)

## Step 2: Create the validator module

One pure module owns every knowledge check. It takes a KB root and a
runtime `fs`, and returns findings. It never logs, never exits, and never
reads scheduler config; the only files it consults besides the vault
content are the vault-local `registry.yaml` and `validation-baseline.json`.
The frontmatter block-splitter is deliberately local: reusing libdoc's
helper would pull a site-generator package into an end-user CLI for ten
lines of code.

- Created: `products/outpost/src/kb-validator.js`

Public surface:

```js
/**
 * @param {string} kbRoot - Absolute path to the KB root (the vault).
 * @param {{fs: object}} runtime - Injected async fs surface.
 * @returns {Promise<{findings: Finding[], tierCount: number}>}
 */
export async function validateKnowledgeBase(kbRoot, runtime)
```

Every finding carries `baselined: boolean`. Three shapes per the design:

| Shape | Fields | Kinds |
| ----- | ------ | ----- |
| Link | `{kind, file, line, link, sourceTier, targetTier, baselined}` | `unresolved`, `ambiguous`, `narrower-link`, `bare-basename`, `path-string` |
| Directory | `{kind, path, baselined}` | `legacy-layout`, `duplicate-rank`, `out-of-grammar-rank`, `no-tiers` |
| Frontmatter | `{kind, file, line, property, value, baselined}` | `frontmatter-missing`, `frontmatter-invalid`, `frontmatter-vocabulary`, `overlay-undeclared` |

Internal passes, in order:

1. **Tier collection.** `readdir` the root with file types. An entry
   matching `^[0-9]-` is a tier; rank is the digit, and the entry may be a
   symlink (rank from the link's own name; traversal follows it). An entry
   matching `^[0-9]{2,3}-` is an `out-of-grammar-rank` finding. Four or
   more leading digits is a personal folder and passes. Two tiers with one
   rank: `duplicate-rank`.
2. **Legacy detection.** `Knowledge/` or `Drafts/` at the root at any time:
   `legacy-layout`. One of the twelve historical entity directories
   (People, Organizations, Projects, Topics, Candidates, Priorities,
   Conditions, Roles, Prospects, Erasure, Tasks, Goals) at the root, only
   when the root has no tiers: `legacy-layout`. No tiers at all:
   `no-tiers`. Each legacy finding message names MIGRATION.md.
3. **File index.** Walk every tier recursively (through symlinks). Index
   all files, notes and assets, into a path list and a basename → paths
   map.
4. **Extraction.** Per `.md` note: wiki links and embeds
   (`[[target]]`, `[[target|alias]]`, `![[target]]`, strip `#heading` and
   `#^block` suffixes), relative markdown links (skip URLs with a scheme),
   literal path strings that start with a tier directory name or a
   personal-surface name (mechanical prefix match, per the design), and
   the YAML frontmatter block when line 1 opens one. Quoted wiki links
   inside property values enter the same link list, flagged
   `fromFrontmatter` so the format check skips the entity-subdirectory
   exemption.
5. **Resolution.** Wiki links and embeds resolve from the KB root, then by
   unique basename. Relative markdown links resolve from the note's
   directory. Zero targets: `unresolved`. More than one: `ambiguous`.
6. **Legality.** `rank(target) >= rank(source)` or the finding is
   `narrower-link`. A target outside every tier is `narrower-link` against
   a personal surface. A path string that names a narrower tier or a
   personal surface in a shared note: `path-string`.
7. **Format.** In shared tiers (rank ≥ 1) a wiki link must start with a
   tier directory name (`[[3-Team/People/Sarah Chen]]`); a bare basename
   is `bare-basename`. Exempt: links in tier-0 notes, and relative links
   whose source and resolved target share one entity subdirectory
   (`<tier>/<entity>/...`). No exemption inside frontmatter.
8. **Frontmatter.** Per shared-tier note. No block or a missing core key
   (`type`, `created`, `updated`): `frontmatter-missing`. Non-flat block,
   non-ISO date, unquoted property wiki link, or an inline `#tag` in a
   shared-tier note body (tags live in the frontmatter `tags` key):
   `frontmatter-invalid`. With a registry present:
   `type`, `status`, or a tag outside its vocabulary, or a tag on a note
   wider than the tag's tier bound: `frontmatter-vocabulary`; conditional
   triggers (`aliases` on person/candidate/organization types, `status`
   on candidate/prospect types, `verified` on rank-4 notes) missing:
   `frontmatter-missing` with the property named. A cross-tier duplicate
   basename inside the same entity-subdirectory name whose narrower note
   lacks `canonical`: `overlay-undeclared`. All registry-dependent checks
   skip when `registry.yaml` is absent.
9. **Baseline.** Read `validation-baseline.json` at the root when present:
   `{findings: [{kind, file, link|path|property, value?}]}`. Match on
   those fields, never on line. Matched findings get `baselined: true`.

Verification: Step 3 tests pass.

## Step 3: Unit tests over real temp vaults

Test every finding kind against small vaults built on the real filesystem,
because resolution and symlink traversal need real fs semantics.

- Created: `products/outpost/test/kb-validator.test.js`

Build vaults with `mkdtemp` under a shared helper. Pass
`node:fs/promises` as `runtime.fs`. Cases, one `describe` per contract:

- Rank grammar: five conforming tiers pass; `12-Foo` fails
  `out-of-grammar-rank`; `2026-Archive` passes; two `3-` entries fail
  `duplicate-rank`.
- Legacy: `Knowledge/` fails; `Drafts/` fails; `People/` at a tier-less
  root fails; `People/` beside tiers passes; empty root fails `no-tiers`;
  every legacy message names MIGRATION.md.
- Links: same-tier and narrower-to-wider pass; wider-to-narrower fails
  `narrower-link`; dangling fails `unresolved`; duplicate basename with a
  bare link fails `ambiguous` or `bare-basename` per case; a tier-0 bare
  link passes; relative link inside one candidate folder passes; a
  path-string naming `1-Management/` in a `3-Team` note fails.
- Suffix subset: a vault holding only `3-Team` and `4-Public` with
  conforming links passes.
- Symlink: a tier entry symlinked to a directory whose basename carries no
  rank validates identically.
- Baseline: a baselined `unresolved` finding reports `baselined: true`; an
  extra new finding stays `false`; matching survives a line shift.
- Frontmatter: each of the four kinds from a violating fixture; a
  registry-less vault skips vocabulary checks; conforming notes pass.
- Property links: an illegal (narrower) property link reports
  `narrower-link`; a bare-basename property link reports `bare-basename`
  even inside an entity subdirectory.

Verification: the repository-root `bun run test` is green
(`products/outpost` has no local test script); the gate runs the same
files under `node --test`.
