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
  when an instruction layer drifts is the jidoka of that system. The rename is
  an owner-directed branding decision grounded in that lineage, not a response
  to measured adoption friction — the evidence below establishes the surface and
  the mis-filing, not user-side signal against the old name.

The result: the standard's tooling reads as monorepo-internal plumbing, its
implementation library cannot be hired on its own terms, and the brand does not
communicate the product's job.

### Evidence

| Claim                                       | How to confirm                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The CLI is library-owned.                   | `@forwardimpact/libcoaligned` declares `bin: { coaligned }`; its bin file is definition-and-dispatch wiring importing handlers from the library's own `src/`.                                                                                                                                                                                                                                               |
| The action is local-only.                   | `.github/actions/coaligned-check/` exists; the `publish-actions.yml` matrix carries `bootstrap`/`harness`/`benchmark`/`wiki`/`kata-agent`/`kata-interview` and no `coaligned` entry; the root `CLAUDE.md` `sibling-composite-actions` enum lists six repos, none for the check suite.                                                                                                                       |
| The library is generic beyond the brand.    | The invariant runner discovers and executes repo-authored `*.rules.mjs` modules from a config directory; the monorepo's own 18 rule modules (26 files with their allow/deny/registry companions) enforce rules — route registries, node floors, workspace imports — that have nothing to do with instruction layering.                                                                                      |
| The skill pack is brand-coupled end to end. | `publish-skills.yml` publishes the five `coaligned-*` skills to the `coaligned-skills` sibling, versioned by `libcoaligned`'s `package.json` — a library, not a product, versions the pack.                                                                                                                                                                                                                 |
| The brand surface is broad.                 | `COALIGNED.md` (the standard), `websites/coaligned/` (CNAME `www.coaligned.team`), the `coaligned` npm launcher, the `coaligned` gear binary (`build/cli-manifest.json`, bundle `gear`; a bootstrap default tool), the `.coaligned/invariants/` config directory hardcoded in the library, and the `eval-coaligned.yml` workflow with its `benchmarks/coaligned-skills` family installing the pack by name. |
| No JTBD entry frames the product.           | `JTBD.md` has no Co-Aligned job; the only jobs entry touching the suite is `libcoaligned`'s library-level _Run a Predictable Platform_ clause.                                                                                                                                                                                                                                                              |

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
    `dependencies`, nothing importable. Published invocations use the scoped
    form (`npx @forwardimpact/jidoka …`) or the bare binary on PATH — the bare
    npm name is unavailable (§ Deferred decisions), so no launcher succeeds the
    `coaligned` one.
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
- **Rename the config directory, as product wiring.** The rule-module discovery
  directory moves from `.coaligned/invariants/` to `.jidoka/invariants/` — the
  brand would otherwise live on in every consuming repository. The directory
  name becomes the product's convention, supplied to the library by its callers
  (the `jidoka` bin and CI wiring): the generalized `libinvariant` carries no
  brand-named discovery default. The monorepo's own rule modules move with the
  directory; downstream migration is documented, not performed — and a consumer
  who runs the renamed CLI against an unmigrated `.coaligned/` tree gets a hard
  error naming the expected location, not a silent pass.
- **Give the product a job.** One Big Hire under **Teams Using Agents**, with
  the full switching framing owned here rather than left to implementation:
  - **Goal:** _Build Quality Into Agent Instructions_.
  - **Trigger:** the team's layered instructions exist, but nothing enforces
    them — layers drift and restate each other, and stale jobs blocks ship
    unnoticed until an agent misbehaves.
  - **Big Hire:** keep humans and agents on one layered instruction
    architecture, with checks that stop the line the moment a layer drifts.
  - **Little Hire:** check one layer's caps, validate the jobs blocks, or run
    the repository's invariant rules with a single command before commit.
  - **Competes with:** unenforced conventions; review-time nitpicking;
    hand-rolled lint scripts; letting drift accumulate until a rewrite.
  - **Forces:** push — instruction sprawl keeps breaking agent behavior with no
    layer to blame; pull — one command family and CI action that stop the line
    at the first drifted layer; habit — trusting contributors to keep
    instructions tidy by hand; anxiety — another gate slowing every commit.
  - **Fired when:** the checks block more work than the drift they catch, or the
    team stops layering its instructions.

  Platform Builders benefit secondarily through `libinvariant`, whose
  library-level jobs entry stays where it is.

**Compatibility stance: clean break.** Every `coaligned` surface is renamed, not
aliased — no shim bin, no dual publish, no compatibility symlink; the old npm
names are deprecated with pointers. GitHub's automatic redirect on the renamed
pack repo is inherited behavior, not a maintained surface.

## Scope

### Included

| Item                           | What it does                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New product `products/jidoka/` | Secondary product (`package.json` with `description` and the one Big Hire `jobs` entry from § Proposal) owning the CLI entry point under `bin/` and the published action under `actions/`. No `src/` — the implementation stays in the library.                                                                                   |
| Library rename                 | `libraries/libcoaligned/` → `libraries/libinvariant/`; npm `@forwardimpact/libcoaligned` → `@forwardimpact/libinvariant`. Handlers, components, and tests stay in the library; the `bin` field and bin file leave it. Its library-level jobs entry stays.                                                                         |
| CLI wiring move                | The single thin bin moves to the product as `jidoka`, dispatching to the same library handlers via package imports. Subcommand set and check behavior unchanged.                                                                                                                                                                  |
| Config directory rename        | `.coaligned/invariants/` → `.jidoka/invariants/`, with the directory name supplied by the product wiring rather than a library constant; the monorepo's rule modules move with the directory, contents unchanged except self-referential name tokens.                                                                             |
| Action move, rename, publish   | `.github/actions/coaligned-check/` → `products/jidoka/actions/jidoka/`; internal consumers repoint to the new local path; `publish-actions.yml` gains a matrix entry publishing it to a new `forwardimpact/jidoka` sibling; the `sibling-composite-actions` enum and action-home prose update.                                    |
| Skills rename                  | `.claude/skills/coaligned-{setup,audit,invariant,jtbd,layer}/` → `jidoka-*`, content reframed to the Jidoka vocabulary; every cross-reference (other skills, agent references, docs, `CONTRIBUTING.md`, and the living templates under `references/`) follows.                                                                    |
| Skill-pack repoint             | `publish-skills.yml`: prefix `coaligned` → `jidoka`, repo `coaligned-skills` → `jidoka-skills` (renamed on GitHub), version-file → the product's `package.json`, pack prose reframed.                                                                                                                                             |
| Standard rebrand               | `COALIGNED.md` → `JIDOKA.md`, rewritten framing (same layers, same rules) grounded in the Toyota concept, carrying the downstream migration note; `MONOREPO.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and skill/doc references follow.                                                                                                 |
| Website                        | `websites/coaligned/` → `websites/jidoka/`, CNAME `www.jidoka.team`, content reframed; the site's caller workflow renames; `websites/CLAUDE.md` table updates. The site and `JIDOKA.md` are the product's documentation home; the CLI's `documentation` links point there.                                                        |
| Launcher retirement            | `launchers/coaligned/` is removed with no successor (the bare npm name is unavailable — § Deferred decisions); the `public-cli-set` invariant's non-`fit` allowance drops `coaligned` and adds nothing; published skills and docs switch to `npx @forwardimpact/jidoka` or the bare binary, and the skill-lint allowances follow. |
| Binary distribution            | The gear bundle's `coaligned` entry renames to `jidoka` (`build/cli-manifest.json`); the installer's default-tool list and gear-binary predicate follow. Bundle vehicle unchanged.                                                                                                                                                |
| Eval lane                      | `eval-coaligned.yml` → `eval-jidoka.yml`; `benchmarks/coaligned-skills/` → `benchmarks/jidoka-skills/`, its pack dependency, task hooks, and judge/task prose updated to the renamed pack, skills, command, and config directory. The pass@k series restarts under the new family name.                                           |
| JTBD + catalogs                | New product jobs entry; regenerate `JTBD.md` and catalog blocks via the context command; hand-maintained product counts and § Secondary Products prose update.                                                                                                                                                                    |
| Release train                  | Chain making the rename real for CI and external consumers — see § Release train.                                                                                                                                                                                                                                                 |

### Excluded

| Item                                        | Why                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior change to the checks               | `instructions`, `jtbd`, and `invariants` keep their semantics, options, and output; rule-module contracts are untouched. The one wiring change — the discovery directory becomes caller-supplied — preserves behavior through the product bin.                                                                                                           |
| Splitting `libinvariant`'s command families | Whether instruction/JTBD checks later separate from the invariant kit is a future boundary question; the library renames wholesale.                                                                                                                                                                                                                      |
| Other libraries' jobs entries               | `libpreflight`/`librc`/`libsupervise`/`libtelemetry` share the _Run a Predictable Platform_ job; only `libinvariant`'s own entry is touched (name tokens), the shared job is not restructured.                                                                                                                                                           |
| A new product-level skill                   | The five renamed skills already narrate setup, audit, invariants, JTBD, and layers; a sixth umbrella skill would duplicate `jidoka-setup`. This consciously adapts the products-convention documentation triple: the skill surface is the five-skill set, and the docs home is `JIDOKA.md` plus the standalone site rather than a `websites/fit/` guide. |
| Moving the binary out of the gear bundle    | The `jidoka` binary keeps shipping in the gear bundle and cask — the same one-product's-CLI-in-another's-vehicle condition spec 2250's plan holds out of its boundary and files as a Part 4 follow-up issue; this spec adds the `jidoka` binary to that issue's scope rather than resolving it.                                                          |
| Executing downstream migrations             | Consuming repos rename `.coaligned/` and reinstall the pack on their own schedule; this spec documents the migration in the standard and pack README, it does not run it.                                                                                                                                                                                |
| `MONOREPO.md` renaming                      | The Monorepo Structure Standard keeps its name; only its references to the instruction standard update.                                                                                                                                                                                                                                                  |
| Unpublishing old npm names                  | `coaligned` (launcher) and `@forwardimpact/libcoaligned` are deprecated with pointers, never unpublished.                                                                                                                                                                                                                                                |

## Deferred decisions

- **Old-domain disposition and DNS provisioning.** `www.jidoka.team` DNS and
  Pages configuration are provisioned by the repository owner at release-train
  step 6, where the owner also settles whether `www.coaligned.team` redirects or
  lapses; the spec requires only that the new domain serves the reframed site.
- **Reclaiming the bare npm name.** `jidoka` on npm is owned by a third party
  (`jidoka@0.1.1`, last modified 2022), verified 2026-07-19;
  `@forwardimpact/jidoka` and `@forwardimpact/libinvariant` were verified
  available the same day. The product therefore ships without a bare-name
  launcher. Whether to pursue an npm name dispute to reclaim `jidoka` is the
  repository owner's call, deferred; if reclaimed, the standing launcher
  invariant supports adding a launcher later.

## Release train

Sibling repository operations happen **before** the monorepo merge — the merge
push itself fires the skill-pack and action publishes at the renamed and new
sibling repos, so they must exist first (GitHub's rename redirect keeps the old
pack name serving in the interim). The remaining steps run immediately after the
merge, executed by `release-engineer` per the standing release process, and
assume spec 2250's own train has completed so the installer and pins being
flipped are the post-2250 ones. Between the merge and step 4, CI's pinned
bootstrap installs the old `coaligned` binary while merged surfaces invoke
`jidoka` — the same expected window as spec 2250's rename; execute same-day.

| #   | Step                                | What it does                                                                                                                                                                                               |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sibling repo operations (pre-merge) | Rename `coaligned-skills` → `jidoka-skills`; create `forwardimpact/jidoka` for the action split (authenticated `gh` environment). The monorepo PR then merges with workflows already naming the new repos. |
| 2   | npm cuts, dependency order          | `libinvariant` (first cut under the new name), then `jidoka`, then a gear release whose binary bundle and stamped installer carry the `jidoka` binary.                                                     |
| 3   | Bootstrap re-tag                    | Bump the installer's pinned gear release; publish and tag the `bootstrap` sibling.                                                                                                                         |
| 4   | Repin PR                            | Flip every SHA pin and installed-CLI list in workflows to the new bootstrap/action releases; first CI run that installs and invokes `jidoka` end to end.                                                   |
| 5   | Deprecations                        | `npm deprecate` the `coaligned` launcher (pointer: `npx @forwardimpact/jidoka`) and `@forwardimpact/libcoaligned` (pointer: `@forwardimpact/libinvariant`).                                                |
| 6   | Website cutover                     | Deploy `websites/jidoka/`; provision `www.jidoka.team` DNS; settle the old-domain disposition (§ Deferred decisions).                                                                                      |

The train's ordering and executor are stated here because the user directed the
spec to carry the release train; step mechanics stay with the plan.

## Success criteria

| #   | Claim                                                    | Verification                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The product consumes the library and exposes no API.     | Static check: `products/jidoka/package.json` `dependencies` include `@forwardimpact/libinvariant` and only wiring-level foundation packages the bin imports; no `main`, no importable export surface, no `products/jidoka/src/`.                                                                                                                             |
| 2   | The product owns the CLI, and owns only wiring.          | Static check: `products/jidoka/package.json` `bin` maps exactly `jidoka` to a file under `products/jidoka/bin/`; the bin dispatches to library imports; `jidoka --help` lists `instructions`, `jtbd`, `invariants`.                                                                                                                                          |
| 3   | The library is renamed and pure.                         | Static check: `libraries/libinvariant/` exists with package name `@forwardimpact/libinvariant`; `libraries/libcoaligned/` does not; the library `package.json` declares no `bin`; handlers remain under its `src/`.                                                                                                                                          |
| 4   | The config directory is renamed and caller-supplied.     | Static check: `.jidoka/invariants/` carries the monorepo's rule modules and `.coaligned/` does not exist; the library source names neither `.coaligned/` nor `.jidoka/` as a discovery default (the product bin and CI wiring supply it); outside `specs/`, `wiki/`, CHANGELOG history, and the documented migration note, no file references `.coaligned/`. |
| 5   | No surface invokes the old command name.                 | Static check: an `rg` for `coaligned` outside `specs/`, `wiki/`, and `**/CHANGELOG.md` returns only (a) workflow SHA pins and installed-CLI lists held for release-train step 4 and (b) the migration note; root scripts and recipes invoke `jidoka`.                                                                                                        |
| 6   | The action lives under the product and is published.     | Static check: `products/jidoka/actions/jidoka/action.yml` exists; `.github/actions/coaligned-check/` does not; internal workflows use the new local path; the `publish-actions.yml` matrix maps it to sibling repo `jidoka`.                                                                                                                                 |
| 7   | The skill pack is renamed and product-versioned.         | Static check: `publish-skills.yml` carries prefix `jidoka`, repo `jidoka-skills`, version-file `products/jidoka/package.json`; its trigger paths match `jidoka-*` skills.                                                                                                                                                                                    |
| 8   | The five skills are renamed and cross-references follow. | Static check: `.claude/skills/jidoka-{setup,audit,invariant,jtbd,layer}/` exist, no `coaligned-*` skill dir remains, and no skill, agent reference, doc, or `references/` template links a `coaligned-*` skill path.                                                                                                                                         |
| 9   | The standard is rebranded.                               | Static check: `JIDOKA.md` exists with the migration note, `COALIGNED.md` does not, and `MONOREPO.md`, `CLAUDE.md`, and `CONTRIBUTING.md` reference `JIDOKA.md`. Editorial review on the PR confirms the Toyota-concept framing.                                                                                                                              |
| 10  | The website is renamed and reframed.                     | Static check: `websites/jidoka/` exists with CNAME `www.jidoka.team`, `websites/coaligned/` does not, the caller workflow builds `site: jidoka`, and `websites/CLAUDE.md` lists the new row. Editorial review on the PR confirms the reframed content.                                                                                                       |
| 11  | The launcher is retired without a successor.             | Static check: `launchers/coaligned/` does not exist, no `launchers/jidoka/` exists, the `public-cli-set` invariant passes with no `coaligned` or `jidoka` allowance, and published skills and docs invoke `npx @forwardimpact/jidoka` or the bare binary.                                                                                                    |
| 12  | The binary pipeline carries the new name.                | Static check: `build/cli-manifest.json` lists `jidoka` (bundle `gear`) and no `coaligned`; the installer's default tools and gear-binary predicate name `jidoka`.                                                                                                                                                                                            |
| 13  | The product declares one Big Hire.                       | Static check: the product's `jobs` array has exactly one entry with `user` `Teams Using Agents`, goal _Build Quality Into Agent Instructions_, and the § Proposal trigger, hires, competes-with, forces, and fired-when content; regenerated `JTBD.md` carries it.                                                                                           |
| 14  | The eval lane exercises the renamed product.             | Static check: `eval-jidoka.yml` exists with family `./benchmarks/jidoka-skills`; `eval-coaligned.yml` and `benchmarks/coaligned-skills/` do not exist; the family's pack dependency names `forwardimpact/jidoka-skills` and its hooks reference `.jidoka/invariants`.                                                                                        |
| 15  | Generated context and counts reflect the reframe.        | After the context command's fix mode, catalog and JTBD blocks list Jidoka and `libinvariant`; hand-maintained counts and § Secondary Products prose updated; the repository check suite passes.                                                                                                                                                              |
| 16  | The release train completed.                             | `npm view` shows `@forwardimpact/libinvariant` and `@forwardimpact/jidoka` published and deprecation notices on `coaligned` and `@forwardimpact/libcoaligned`; the gear release lists `jidoka` binaries; the repin PR is merged with CI green; `forwardimpact/jidoka` and `forwardimpact/jidoka-skills` exist and receive publishes.                         |
| 17  | Deferred decisions are recorded, not silently resolved.  | § Deferred decisions names the domain/DNS disposition and the bare-npm-name reclaim; the diff resolves neither ahead of its owner.                                                                                                                                                                                                                           |

## Relationship to other specs

- **Applies the spec 2250 boundary (agent-runtime platform product).** Same
  pattern — a product ships usage surfaces (CLI + action), the library stays the
  API home — applied to the check suite. The two changes share files (installer
  tool list, launcher invariant, `CLAUDE.md` enums, action publish matrix); this
  spec is sequenced after 2250's monorepo merge and release train, written
  against that tree, with the design naming the interaction points.
- **Follows the rename precedents.** Spec 2110 (`libeval` → `libharness`)
  established the category-scoped codemod-with-keep-list method; spec 2200
  (`svctrace` → `svcspan`) the clean-break rename policy this spec inherits.
- **Extends the debranding line (spec 2140, subtree-split actions).** The action
  gains a published sibling home under the same split mechanism, adding `jidoka`
  to the sibling set rather than changing any existing one.
- **Diverges from spec 1670 (public CLI launchers) deliberately.** The launcher
  set stays computed; this rename removes the one non-`fit` allowance instead of
  renaming it, because the bare npm name is unavailable (§ Deferred decisions).
