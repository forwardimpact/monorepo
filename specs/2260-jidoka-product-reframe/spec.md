# Spec 2260 — Reframe Co-Aligned as the Jidoka product

**Classification:** Product — it renames and reframes a user-facing product (the
Co-Aligned standard and its tooling become Jidoka), changing what external
personas hire, not just internal wiring.

## Problem

The Co-Aligned check suite works and is distributed — a CLI, a CI action, a
skill pack, a website, and a standard document — but its packaging repeats the
exact mis-filing spec 2250 fixed for the agent runtime, and its brand names the
aspiration rather than the mechanism:

- **The CLI is library-owned.** The `coaligned` command is a `bin` entry point
  declared by `@forwardimpact/libcoaligned`; the library ships both the
  implementation and the user interface. No product owns the command surface.
- **The run surface is unpublished CI plumbing.** The `coaligned-check`
  composite action lives under `.github/actions/` as local glue. Every other
  agent-facing action (`bootstrap`, `harness`, `wiki`, `benchmark`,
  `kata-agent`, `kata-interview`) is published to a `forwardimpact/` sibling; a
  repository adopting the standard has no action to `uses:` — it must
  reverse-engineer the monorepo's local step.
- **The library name binds a generic capability to a brand.** `libcoaligned`
  implements checks any repository could use — instruction-layer length caps,
  JTBD block validation, and a declarative invariant-rule-module runner — but
  its name couples it to one standard's brand, obscuring that the invariant kit
  is general-purpose.
- **The brand names the goal, not the method.** "Co-Aligned" says what you hope
  for (humans and agents staying aligned); it does not say how the product
  achieves it. The mechanism is _jidoka_ — the Toyota principle of building
  quality into the process so the line stops at the first defect, never passing
  one downstream. The repository already stands on this Lean lineage (Kata's
  improvement cycle, Gemba's shop-floor naming); the check suite that halts CI
  when an instruction layer drifts is the jidoka of that system, and naming it
  so makes the product legible in the same vocabulary.

The result: the standard's tooling reads as monorepo-internal plumbing, its
implementation library cannot be hired on its own terms, and the brand does not
communicate the product's job.

### Evidence

| Claim                                       | How to confirm                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The CLI is library-owned.                   | `@forwardimpact/libcoaligned` declares `bin: { coaligned }`; its bin file is definition-and-dispatch wiring importing handlers from the library's own `src/`.                                                                                                                            |
| The action is local-only.                   | `.github/actions/coaligned-check/` exists; the `publish-actions.yml` matrix carries `bootstrap`/`harness`/`benchmark`/`wiki`/`kata-agent`/`kata-interview` and no `coaligned` entry; the root `CLAUDE.md` `sibling-composite-actions` enum lists six repos, none for the check suite.    |
| The library is generic beyond the brand.    | The invariant runner discovers and executes repo-authored `*.rules.mjs` modules from a config directory; the monorepo's own 26 rule modules enforce rules (route registries, node floors, workspace imports) that have nothing to do with instruction layering.                          |
| The skill pack is brand-coupled end to end. | `publish-skills.yml` publishes the five `coaligned-*` skills to the `coaligned-skills` sibling, versioned by `libcoaligned`'s `package.json` — a library, not a product, versions the pack.                                                                                              |
| The brand surface is broad.                 | `COALIGNED.md` (the standard), `websites/coaligned/` (CNAME `www.coaligned.team`), the `coaligned` npm launcher, the `coaligned` gear binary (`cli-manifest.json`, bundle `gear`; a bootstrap default tool), and the `.coaligned/invariants/` config directory hardcoded in the library. |
| No JTBD entry frames the product.           | `JTBD.md` has no Co-Aligned job; the only jobs entry touching the suite is `libcoaligned`'s library-level _Run a Predictable Platform_ clause.                                                                                                                                           |

### Who is affected

| Affected              | How                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teams Using Agents    | Cannot hire "the thing that keeps agent instructions honest" — the CLI reads as a library detail, the CI action is invisible outside the monorepo, and the standard's name does not say what the tooling does. |
| Platform Builders     | Cannot import the invariant kit on its own terms; `libcoaligned`'s name and JTBD clause blur a generic checker into one standard's brand.                                                                      |
| Internal contributors | Maintain a product spread across a library `bin`, local CI glue, and a brand that predates the repo's Lean vocabulary (Kata, Gemba).                                                                           |

## Proposal

Reframe the Co-Aligned product as **Jidoka**, applying the boundary spec 2250
established: **the product ships what you run; the library ships what you
import.**

- **Generalize the library.** Rename `@forwardimpact/libcoaligned` to
  `@forwardimpact/libinvariant` (directory `libraries/libinvariant/`). The
  library keeps every command handler and component — instruction checks, JTBD
  checks, the invariant kit and rule-module runner — and stops declaring a
  `bin`: it becomes a pure import target whose name says what it does.
- **Introduce `products/jidoka/`.** A Secondary product that consumes
  `libinvariant` and exposes exactly two usage surfaces, no importable API:
  - **CLI axis:** the `jidoka` command — the thin definition-and-dispatch wiring
    moved from the library's bin, with the same three subcommands
    (`instructions`, `jtbd`, `invariants`). The npm package
    `@forwardimpact/jidoka` is the install vehicle: a `bin` map and
    `dependencies`, nothing importable.
  - **Actions axis:** the composite action moved from
    `.github/actions/coaligned-check/` and renamed **`jidoka`**, published to a
    new `forwardimpact/jidoka` sibling so external adopters can `uses:` it.
- **Rebrand the standard and its surfaces.** `COALIGNED.md` becomes `JIDOKA.md`,
  reframed around the Toyota concept: built-in quality, stop the line, never
  pass a defect downstream. `websites/coaligned/` becomes `websites/jidoka/` at
  `www.jidoka.team`, telling the same story. The five `coaligned-*` skills
  rename to `jidoka-*`; the `coaligned-skills` sibling repo is renamed
  `jidoka-skills` and the pack is versioned by the product's `package.json`, not
  the library's.
- **Rename the config directory.** The rule-module discovery directory moves
  from `.coaligned/invariants/` to `.jidoka/invariants/` — the brand would
  otherwise live on in every consuming repository. The monorepo's own rule
  modules move with it; downstream migration is documented, not performed.
- **Give the product a job.** One Big Hire under **Teams Using Agents**: _Build
  Quality Into Agent Instructions_ — keep humans and agents on one layered
  instruction architecture, with checks that stop the line when a layer drifts.
  Platform Builders benefit secondarily through `libinvariant`, whose
  library-level jobs entry stays where it is.

**Compatibility stance: clean break.** The `coaligned` command name, launcher,
skills, action, config directory, and standard document are renamed, not aliased
— no shim bin, no dual publish, no compatibility symlink. Every internal invoker
switches in the same change; the npm `coaligned` launcher and
`@forwardimpact/libcoaligned` package are deprecated, not unpublished. GitHub
repo renames (`coaligned-skills` → `jidoka-skills`) retain GitHub's automatic
redirects, which is inherited behavior, not a maintained compatibility surface.

## Scope

### Included

| Item                           | What it does                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New product `products/jidoka/` | Secondary product (`package.json` with `description` and one Big Hire `jobs` entry, `user` = `Teams Using Agents`) owning the CLI entry point under `bin/` and the published action under `actions/`. No `src/` — the implementation stays in the library.                                     |
| Library rename                 | `libraries/libcoaligned/` → `libraries/libinvariant/`; npm `@forwardimpact/libcoaligned` → `@forwardimpact/libinvariant`. Handlers, components, and tests stay in the library; the `bin` field and bin file leave it. Its library-level jobs entry stays.                                      |
| CLI wiring move                | The single thin bin moves to the product as `jidoka`, dispatching to the same library handlers via package imports. Subcommand set and behavior unchanged.                                                                                                                                     |
| Config directory rename        | The discovery constant and every reference move from `.coaligned/invariants/` to `.jidoka/invariants/`; the monorepo's rule modules move with the directory, contents unchanged except self-referential name tokens.                                                                           |
| Action move, rename, publish   | `.github/actions/coaligned-check/` → `products/jidoka/actions/jidoka/`; internal consumers repoint to the new local path; `publish-actions.yml` gains a matrix entry publishing it to a new `forwardimpact/jidoka` sibling; the `sibling-composite-actions` enum and action-home prose update. |
| Skills rename                  | `.claude/skills/coaligned-{setup,audit,invariant,jtbd,layer}/` → `jidoka-*`, content reframed to the Jidoka vocabulary; every cross-reference (other skills, agent references, docs, `CONTRIBUTING.md`) follows.                                                                               |
| Skill-pack repoint             | `publish-skills.yml`: prefix `coaligned` → `jidoka`, repo `coaligned-skills` → `jidoka-skills` (renamed on GitHub), version-file → the product's `package.json`, pack prose reframed.                                                                                                          |
| Standard rebrand               | `COALIGNED.md` → `JIDOKA.md`, rewritten framing (same layers, same rules) grounded in the Toyota concept; `MONOREPO.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and skill/doc references follow.                                                                                                      |
| Website                        | `websites/coaligned/` → `websites/jidoka/`, CNAME `www.jidoka.team`, content reframed; the site's caller workflow renames; `websites/CLAUDE.md` table updates.                                                                                                                                 |
| Launcher                       | `launchers/coaligned/` → `launchers/jidoka/`, backed by `@forwardimpact/jidoka`; the `public-cli-set` invariant's non-`fit` allowance renames with it.                                                                                                                                         |
| Binary distribution            | The gear bundle's `coaligned` entry renames to `jidoka` (`cli-manifest.json`); the installer's default-tool list and gear-binary predicate follow. Bundle vehicle unchanged.                                                                                                                   |
| JTBD + catalogs                | New product jobs entry; regenerate `JTBD.md` and catalog blocks via the context command; hand-maintained product counts and § Secondary Products prose update.                                                                                                                                 |
| Release train                  | Post-merge chain making the rename real for CI and external consumers — see § Release train.                                                                                                                                                                                                   |

### Excluded

| Item                                        | Why                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any behavior change to the checks           | Pure rename and reframe: `instructions`, `jtbd`, and `invariants` keep their semantics, options, and output; rule-module contracts are untouched.                                                                     |
| Splitting `libinvariant`'s command families | Whether instruction/JTBD checks later separate from the invariant kit is a future boundary question; the library renames wholesale.                                                                                   |
| Other libraries' jobs entries               | `libpreflight`/`libsupervise`/`libtelemetry` share the _Run a Predictable Platform_ job; only `libinvariant`'s own entry is touched (name tokens), the shared job is not restructured.                                |
| A new product-level skill                   | The five renamed skills already narrate setup, audit, invariants, JTBD, and layers; adding a sixth umbrella skill would duplicate `jidoka-setup`.                                                                     |
| Moving the binary out of the gear bundle    | The `jidoka` binary keeps shipping in the gear bundle and cask — the same one-product's-CLI-in-another's-vehicle condition spec 2250 records as a follow-up; this spec joins that follow-up rather than resolving it. |
| Executing downstream migrations             | Consuming repos rename `.coaligned/` and reinstall the pack on their own schedule; this spec documents the migration in the standard and pack README, it does not run it.                                             |
| `MONOREPO.md` renaming                      | The Monorepo Structure Standard keeps its name; only its references to the instruction standard update.                                                                                                               |
| Unpublishing old npm names                  | `coaligned` (launcher) and `@forwardimpact/libcoaligned` are deprecated with pointers, never unpublished.                                                                                                             |

## Deferred decisions

- **Old-domain disposition.** Whether `www.coaligned.team` redirects to
  `www.jidoka.team` or lapses is a DNS decision owned by the repository owner,
  resolved during the release train; the spec requires only that the new domain
  serves the reframed site.
- **npm name availability.** `jidoka` (launcher) and `@forwardimpact/jidoka` are
  assumed available; the plan verifies against the registry before
  implementation, as spec 2250's plan did for its family.

## Release train

The monorepo PR merges the rename atomically; the train then makes it real, in
order, executed by `release-engineer` per the standing release process. Between
the merge and step 4, CI's pinned bootstrap installs the old `coaligned` binary
while merged surfaces invoke `jidoka` — the same expected window as spec 2250's
rename; execute the train same-day.

| #   | Step                       | What it does                                                                                                                                                                                                               |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sibling repo operations    | Rename `coaligned-skills` → `jidoka-skills`; create `forwardimpact/jidoka` for the action split (performed with the authenticated `gh` environment; sibling `repo:` names in workflows updated in the monorepo PR itself). |
| 2   | npm cuts, dependency order | `libinvariant` (first cut under the new name), then `jidoka` plus the `jidoka` launcher, then a gear release whose binary bundle and stamped installer carry the `jidoka` binary.                                          |
| 3   | Bootstrap re-tag           | Bump the installer's pinned gear release; publish and tag the `bootstrap` sibling.                                                                                                                                         |
| 4   | Repin PR                   | Flip every SHA pin and installed-CLI list in workflows to the new bootstrap/action releases; first CI run that installs and invokes `jidoka` end to end.                                                                   |
| 5   | Deprecations               | `npm deprecate` the `coaligned` launcher and `@forwardimpact/libcoaligned` with pointers to their successors.                                                                                                              |
| 6   | Website cutover            | Deploy `websites/jidoka/`; provision `www.jidoka.team` DNS; settle the old-domain disposition (§ Deferred decisions).                                                                                                      |

## Success criteria

| #   | Claim                                                    | Verification                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The product consumes the library and exposes no API.     | Static check: `products/jidoka/package.json` `dependencies` include `@forwardimpact/libinvariant` and only wiring-level foundation packages the bin imports; no `main`, no importable export surface, no `products/jidoka/src/`.                                                                                                                              |
| 2   | The product owns the CLI, and owns only wiring.          | Static check: `products/jidoka/package.json` `bin` maps exactly `jidoka` to a file under `products/jidoka/bin/`; the bin dispatches to library imports; `jidoka --help` lists `instructions`, `jtbd`, `invariants`.                                                                                                                                           |
| 3   | The library is renamed and pure.                         | Static check: `libraries/libinvariant/` exists with package name `@forwardimpact/libinvariant`; `libraries/libcoaligned/` does not; the library `package.json` declares no `bin`; handlers remain under its `src/`.                                                                                                                                           |
| 4   | The config directory is renamed everywhere.              | Static check: the library's discovery constant names `.jidoka/invariants`; `.jidoka/invariants/` carries the monorepo's rule modules; `.coaligned/` does not exist; no non-historical file references `.coaligned/`.                                                                                                                                          |
| 5   | No surface invokes the old command name.                 | Static check: `rg` for `coaligned` invocations outside `specs/`, `wiki/`, `benchmarks/`, and CHANGELOG history returns only allowed remainders (release-train-held pins, per the plan's gates); root scripts and recipes invoke `jidoka`.                                                                                                                     |
| 6   | The action lives under the product and is published.     | Static check: `products/jidoka/actions/jidoka/action.yml` exists; `.github/actions/coaligned-check/` does not; internal workflows use the new local path; the `publish-actions.yml` matrix maps it to sibling repo `jidoka`.                                                                                                                                  |
| 7   | The skill pack is renamed and product-versioned.         | Static check: `publish-skills.yml` carries prefix `jidoka`, repo `jidoka-skills`, version-file `products/jidoka/package.json`; its trigger paths match `jidoka-*` skills.                                                                                                                                                                                     |
| 8   | The five skills are renamed and cross-references follow. | Static check: `.claude/skills/jidoka-{setup,audit,invariant,jtbd,layer}/` exist, no `coaligned-*` skill dir remains, and no skill, agent reference, or doc links a `coaligned-*` skill path.                                                                                                                                                                  |
| 9   | The standard is rebranded.                               | Static check: `JIDOKA.md` exists and frames the architecture via the Toyota concept; `COALIGNED.md` does not exist; `MONOREPO.md`, `CLAUDE.md`, and `CONTRIBUTING.md` reference `JIDOKA.md`.                                                                                                                                                                  |
| 10  | The website is renamed and reframed.                     | Static check: `websites/jidoka/` exists with CNAME `www.jidoka.team`; `websites/coaligned/` does not; the caller workflow builds `site: jidoka`; `websites/CLAUDE.md` lists the new row.                                                                                                                                                                      |
| 11  | The launcher follows the CLI.                            | Static check: `launchers/jidoka/` exists importing the product's bin, `launchers/coaligned/` does not, and the `public-cli-set` invariant passes with the non-`fit` allowance naming `jidoka`.                                                                                                                                                                |
| 12  | The binary pipeline carries the new name.                | Static check: `cli-manifest.json` lists `jidoka` (bundle `gear`) and no `coaligned`; the installer's default tools and gear-binary predicate name `jidoka`.                                                                                                                                                                                                   |
| 13  | The product declares one Big Hire.                       | Static check: the product's `jobs` array has exactly one entry with `user` `Teams Using Agents` and goal _Build Quality Into Agent Instructions_; regenerated `JTBD.md` carries it.                                                                                                                                                                           |
| 14  | Generated context and counts reflect the reframe.        | After the context command's fix mode, catalog and JTBD blocks list Jidoka and `libinvariant`; hand-maintained counts and § Secondary Products prose updated; the repository check suite passes.                                                                                                                                                               |
| 15  | The release train completed.                             | `npm view` shows `@forwardimpact/libinvariant`, `@forwardimpact/jidoka`, and the `jidoka` launcher published, and deprecation notices on `coaligned` and `@forwardimpact/libcoaligned`; the gear release lists `jidoka` binaries; the repin PR is merged with CI green; `forwardimpact/jidoka` and `forwardimpact/jidoka-skills` exist and receive publishes. |
| 16  | Deferred decisions are recorded, not silently resolved.  | § Deferred decisions names the old-domain disposition and npm availability; the diff resolves neither ahead of its owner.                                                                                                                                                                                                                                     |

## Relationship to other specs

- **Applies the spec 2250 boundary (agent-runtime platform product).** Same
  pattern — a product ships usage surfaces (CLI + action), the library stays the
  API home — applied to the check suite. The two changes share files (installer
  tool list, launcher invariant, `CLAUDE.md` enums, action publish matrix); this
  spec is sequenced after 2250's monorepo merge and written against that tree,
  with the design naming the interaction points.
- **Follows the rename precedents.** Spec 2110 (`libeval` → `libharness`)
  established the category-scoped codemod-with-keep-list method; spec 2200
  (`svctrace` → `svcspan`) the clean-break rename policy this spec inherits.
- **Extends the debranding line (spec 2140, subtree-split actions).** The action
  gains a published sibling home under the same split mechanism, adding `jidoka`
  to the sibling set rather than changing any existing one.
- **Flows through spec 1670 (public CLI launchers).** The launcher set stays
  computed; the rename flows through the invariant's named non-`fit` allowance,
  exactly as `coaligned` does today.
