# Spec 2250 — An agent-runtime platform product

**Classification:** Product — defines a new user-facing product and repositions
an existing one (Gear); it changes what external personas can hire, not just
internal tooling.

**Naming is deferred.** This spec commits to the product's existence, job, and
boundary, not its name. Every identifier below is a placeholder: the product is
`PLATFORM`, its directory `products/<platform>/`, its package
`@forwardimpact/<platform>`. `PLATFORM` and `<platform>` denote the same
deferred token. Naming is an explicit open decision (§ Deferred decisions),
resolved before implementation; the success criteria are written to hold for
whatever slug is chosen.

## Problem

The monorepo already ships a working substrate for running an agent team — the
bootstrap layer plus the `fit-harness`, `fit-trace`, `fit-wiki`, and `fit-xmr`
CLIs, and the composite actions that execute those CLIs in CI — but no product
frames it. The substrate is homeless in three ways:

- **Its runtime libraries are buried inside Gear.** Gear is a meta-package that
  re-exports everything a platform builder might import — retrieval (graph,
  vector, resource), typed contracts (rpc, codegen), MCP exposure, storage —
  *and* the agent-runtime libraries. Its one Big Hire, "give humans and agents
  shared capabilities through the same interface," spans both "query graphs, run
  vector search, expose services as MCP tools" (build-time primitives) and
  "chart agent metrics" (operate-time runtime). A team that wants to stand up
  and run an agent team is told to hire the same grab-bag as a team that wants a
  vector index.
- **Its run surface is scattered and mis-filed.** The composite actions that
  actually execute the agent team in CI — `harness` and `benchmark` under
  `libraries/libharness/actions/`, `wiki` under `libraries/libwiki/actions/` —
  hang off library directories, so libraries that should be pure import targets
  also ship CI actions. The `bootstrap` action and its `fit-install.sh` live
  under `.github/` as CI plumbing. None of them is named as one product's run
  surface.
- **Its bring-up has no product narrative.** The `bootstrap` action,
  `fit-install.sh`, and `scripts/bootstrap.sh` are the install-and-run story,
  but they are described only in `.github/CLAUDE.md` as CI plumbing. They are
  already published (`forwardimpact/bootstrap`) yet nowhere framed as one thing
  a persona hires.

The result: the substrate has no overview page, no skill, and no JTBD entry that
says "this is how you stand up and operate an agent team." Kata — the reference
team that runs on exactly this substrate — reads as the only possible tenant,
when the substrate is in fact generic and swappable.

### Evidence

| Claim | How to confirm |
| --- | --- |
| The agent-runtime libraries ship inside Gear today. | `products/gear/package.json` re-exports `libharness`, `libwiki`, and `libxmr` alongside retrieval/contract/storage packages. |
| Gear's single job mixes build-time and operate-time. | The Gear `jobs` entry's `littleHire` lists "query graphs, run vector search, expose services as MCP tools, **or chart agent metrics**" — the last clause is the operate-time runtime leaking into a build-time product. |
| The agent-run actions hang off library directories. | `libraries/libharness/actions/{harness,benchmark}/` and `libraries/libwiki/actions/wiki/` are subtree-split action sources co-located with import-only libraries; `publish-actions.yml` splits each prefix to a sibling repo. |
| The bring-up layer has no product home. | `.github/actions/bootstrap/` and its `fit-install.sh` are published to siblings but described only in `.github/CLAUDE.md` as CI plumbing; no `websites/fit/<product>/` page or skill names them. |
| `svcspan` is not part of the agent-run loop. | `fit-trace` (a `libharness` bin) reads **NDJSON** output from `fit-harness`; it references neither gRPC nor OpenTelemetry. `@forwardimpact/svcspan` is "OpenTelemetry span ingestion and storage over gRPC," and its only product consumer is `products/guide`. It is a build-time/retrieval service, not the collector `fit-trace` reads from. |
| The runtime packages are product-independent and already reused beyond Kata. | `libharness`, `libwiki`, `libxmr` live under `libraries/` (none under `products/kata/`); `fit-install.sh` bundles the `fit-*` runtime CLIs that the `kata-*` skills invoke; and the published `harness`/`wiki` actions are invoked by workflows outside the Kata team run. |

### Who is affected

| Affected | How |
| --- | --- |
| Teams Using Agents | Cannot find or hire "the thing you run an agent team on" — it has no name, page, or install story of its own; they must reverse-engineer it out of Gear, `libraries/*/actions/`, and `.github/`. |
| Platform Builders | Gear's promise is blurred by two audiences; a builder wanting composable primitives wades through agent-runtime concerns and vice versa. |
| Kata | Reads as the substrate's owner rather than its first tenant, obscuring that the platform is generic and another team could run on it. |

## Proposal

Define a new Secondary meta-product, `PLATFORM`, whose single job is to
**stand up and operate an agent team**, and split the agent-runtime substrate
out of Gear (and out of the library directories) into it along one boundary:
**`PLATFORM` ships what you run; Gear ships what you import.**
Name Kata as the platform's reference implementation.

`PLATFORM` follows the meta-package shape Gear and Kata already establish — a
`package.json` with a JTBD and no `bin/`/`src/` of its own (each capability
keeps its existing CLI) — but its concrete surface is two-sided:

- **An npm axis.** It re-exports the three runtime *libraries* whose CLIs you run
  to operate a team: `@forwardimpact/libharness` (`fit-harness`, `fit-trace`),
  `@forwardimpact/libwiki` (`fit-wiki`), and `@forwardimpact/libxmr`
  (`fit-xmr`).
- **A GitHub Actions axis.** It owns `products/<platform>/actions/` — the
  composite actions that execute the coding-agent runtime in CI: `bootstrap`
  (stand up), `harness` (run), `wiki` (remember), and `benchmark` (measure).
  These move here from `.github/actions/` and the two library directories,
  mirroring the precedent that `products/kata/actions/` already sets for a
  product owning its actions.

Extracting the actions out of `libraries/libharness/` and `libraries/libwiki/`
leaves those two libraries as pure import targets. Gear sheds the three runtime
libraries and the "chart agent metrics" clause, leaving one clean promise:
composable primitives you build agents *with*. `svcspan` stays in Gear — it is
a build-time/retrieval service (Guide's OTel collector), never part of the run
loop.

**JTBD relationship.** The primary persona is **Teams Using Agents**. Its
existing job, *Run a Continuously Improving Agent Team*, is Kata-owned (both its
hires resolve to Kata) and stays unchanged — that job is the reference tenant.
`PLATFORM` adds a new, distinct job for the same persona, *Stand Up and Operate
an Agent Team*, which is the substrate Kata's job runs on. Platform Builders
benefit secondarily (they can adopt the runtime without Kata), but the product
declares one Big Hire under one `user`. Gear keeps **Platform Builders → Build
Agent-Capable Systems**, the build half.

This is a clean break, not an additive layer: the runtime libraries move out of
Gear and the run actions move out of the library directories, rather than being
cross-listed, so each persona-job has exactly one product to hire.

## Scope

### Included

| Item | What it does |
| --- | --- |
| New product `products/<platform>/` | A Secondary meta-package (`package.json` with `description` and one Big Hire `jobs` entry, `user` = `Teams Using Agents`) that re-exports the three runtime libraries and owns the run actions under `actions/`. No `bin/`/`src/`, following the Gear/Kata meta-package exemption. |
| New JTBD job | Add a *Teams Using Agents → Stand Up and Operate an Agent Team* job to the new package's `jobs`; leave Kata's existing *Run a Continuously Improving Agent Team* job untouched. |
| Runtime library subset | `PLATFORM` re-exports exactly the three operate-an-agent-team libraries: `@forwardimpact/libharness` (`fit-harness`/`fit-trace`, and its `fit-benchmark`/`fit-selfedit` bins travel with the package), `@forwardimpact/libwiki` (`fit-wiki`), and `@forwardimpact/libxmr` (`fit-xmr`). `svcspan` is **not** in this subset. |
| Run-actions relocation | Move the agent-run composite actions into `products/<platform>/actions/`: `bootstrap` (from `.github/actions/bootstrap/`), `harness` and `benchmark` (from `libraries/libharness/actions/`), and `wiki` (from `libraries/libwiki/actions/`). Repoint the `publish-actions.yml` matrix `prefix:` and `paths:` filters; the **sibling repo names** (`bootstrap`, `harness`, `benchmark`, `wiki`) and their consumer SHA pins are unchanged. |
| Libraries become pure | After the move, `libraries/libharness/` and `libraries/libwiki/` no longer contain an `actions/` directory; they are import-only libraries. |
| Bring-up narrative ownership | The bootstrap layer (now `products/<platform>/actions/bootstrap/`, plus `fit-install.sh` and `scripts/bootstrap.sh`) is framed as `PLATFORM`'s stand-it-up story in the product's overview and skill. |
| Gear refocus (clean break) | Remove the three runtime libraries from `products/gear/package.json`, and remove the operate-time promise ("chart agent metrics") from Gear's `jobs` entry, so Gear's promise is build-time primitives only. `svcspan` remains a Gear dependency. |
| Overview page | `websites/fit/<platform>/index.md` — the cohesive "stand up and operate an agent team" story, organized by persona, presenting the CLIs and the CI actions as one runtime loop, with a Getting Started that names the bring-up layer. |
| Skill | `.claude/skills/fit-<platform>/SKILL.md` describing when to hire the platform and how its capabilities compose (stand up → run → see → remember → measure). |
| Kata as reference implementation | The overview page and `KATA.md` name Kata as the platform's first tenant — the proof the substrate is generic and swappable — without moving any Kata code. |
| Generated context + counts | Regenerate the `JTBD.md` and `products/README.md` catalog blocks via the repo's context command, and update the hand-maintained product-count prose in the `products/README.md` intro, `CLAUDE.md` § Secondary Products, and the `sibling-composite-actions` enum / `.github/CLAUDE.md` action-home prose to reflect the new action homes and both products. |

### Excluded

| Item | Why |
| --- | --- |
| `svcspan` membership in `PLATFORM` | `svcspan` is an OTel gRPC ingestion service consumed by Guide, not the collector `fit-trace` reads from. It stays a Gear re-export; it never enters the runtime subset. |
| Renaming the sibling action repos | Only the monorepo `prefix:` (source path) moves; the published sibling repos (`bootstrap`, `harness`, `benchmark`, `wiki`) keep their names, so downstream `uses:` pins are untouched. |
| `fit-doc` / `libdoc` placement | Stays in Gear as a general infrastructure primitive; it fails the run-the-team test. Reopen only if the platform later claims a "publish team knowledge" verb. |
| `fit-rc` / `fit-svscan` placement | They operate a *service stack*, not an agent team; they remain Gear infrastructure. |
| Shared foundation packages | `libtelemetry`, `libutil` and the like are not part of the runtime subset; wherever Gear re-exports them today is untouched, and `PLATFORM` does not claim them. |
| Generalizing `scripts/bootstrap.sh` → `fit-bootstrap.sh` | Extracting a generic installer is a follow-up; this spec relocates and narrates the bring-up layer, not the installer refactor. |
| Moving or renaming any runtime *library* on disk | The libraries stay at their `libraries/` paths; only their `actions/` subdirectories move and only the re-export lists change. |
| A standalone CLI for the platform | Like Gear, the product is a meta-package; capabilities keep their own CLIs. |

## Deferred decisions

Named here as the single home for each, so they are tracked rather than silently
dropped. None blocks capturing the product; each is resolved in a later
iteration.

- **Product name.** The placeholder `PLATFORM` / `<platform>` stands in
  throughout. Success criteria are written against the product's contents and
  boundary, not its name.
- **`fit-terrain` / `libterrain` home.** Its placement (platform vs Gear vs its
  own product) is entangled with the Map standard and the synthetic
  sub-libraries; decided after this product lands. Untouched here — it stays a
  Gear re-export for now.
- **`svcpathway` mis-filing.** `svcpathway` is the Pathway product's service and
  is arguably mis-listed in Gear today; a pre-existing Gear-hygiene item
  independent of this boundary. Flagged, not fixed here.

## Success criteria

Written to hold for whatever slug the name decision assigns; each references the
new product's contents and the Gear boundary, not a brand string. "The new
product's `package.json`" means the single `package.json` under the new
`products/<slug>/` directory created by this change.

| # | Claim | Verification |
| --- | --- | --- |
| 1 | The new meta-package re-exports exactly the three runtime libraries and nothing from the build-time set. | Static check: the new `package.json` `dependencies` are exactly `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`; no retrieval/contract/storage package and no `svcspan` appears. |
| 2 | Gear no longer re-exports any runtime-subset library. | Static check: `products/gear/package.json` `dependencies` contain none of `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`. |
| 3 | Each of the three runtime libraries is re-exported by exactly one meta-product. | Static check: no runtime-subset library appears in both `products/gear/package.json` and the new package's `dependencies`. |
| 4 | `svcspan` stays a Gear build-time dependency and never enters `PLATFORM`. | Static check: `@forwardimpact/svcspan` appears in `products/gear/package.json` `dependencies` and does not appear in the new package's `dependencies`. |
| 5 | Gear's job no longer promises any operate-time capability. | Static check: Gear's `jobs` `littleHire` no longer contains the "chart agent metrics" clause or any equivalent metrics/operate-a-team verb. |
| 6 | The four agent-run actions live under the product and the libraries are pure. | Static check: `products/<platform>/actions/{bootstrap,harness,wiki,benchmark}/action.yml` exist; `libraries/libharness/actions/` and `libraries/libwiki/actions/` no longer exist; `.github/actions/bootstrap/` no longer exists. |
| 7 | The action move preserves publication: same sibling repos, repointed sources. | Static check: `publish-actions.yml` matrix `prefix:` entries for `bootstrap`/`harness`/`benchmark`/`wiki` point under `products/<platform>/actions/`, the `repo:` names are unchanged, and the `paths:` filter matches the new sources. |
| 8 | The new product declares one Big Hire for the operate persona, distinct from Kata's job. | Static check: the new package's `jobs` array has exactly one entry whose `user` is `Teams Using Agents` and whose `goal` is not `Run a Continuously Improving Agent Team`. |
| 9 | The product has an overview page and a skill that name the bring-up layer and present the runtime loop as one workflow. | `websites/fit/<slug>/index.md` and `.claude/skills/fit-<slug>/SKILL.md` exist; each names the bootstrap layer and references `fit-harness`, `fit-wiki`, `fit-xmr`, and `fit-trace`, and presents the CI actions as the same loop. |
| 10 | Kata is documented as the platform's reference implementation, with no Kata code moved. | `KATA.md` and the overview page name Kata as a tenant of the platform; `git diff` shows no change under `products/kata/`. |
| 11 | Generated context and hand-maintained counts reflect both products and the new action homes. | After `bun run context:fix`, the `JTBD.md` and `products/README.md` catalog blocks list the new product and the refocused Gear; the `products/README.md` intro count, `CLAUDE.md` § Secondary Products, and the `sibling-composite-actions` action-home prose are updated; `bun run check` passes. |
| 12 | The deferred decisions are recorded, not silently resolved. | § Deferred decisions names the product-name, `fit-terrain`, and `svcpathway` items; `git diff` shows none of the three acted on (no rename, no `libterrain`/`svcpathway` dependency move). |

## Relationship to other specs

- **Distinct from spec 2080 (platform adoption substrate).** 2080 adds an
  activity-schema substrate for Landmark to *measure* platform adoption across
  teams. This spec *packages and names* the agent-runtime platform as a product.
  Different surface (product framing vs data schema), no overlap.
- **Builds on the debranding line (spec 2140, subtree-split actions).** The
  bring-up and run actions are already published under debranded sibling names
  (`bootstrap`, `harness`, `wiki`, `benchmark`); this spec regroups their
  monorepo sources under one product and gives that published surface a product
  narrative, without changing the sibling names those consumers pin.
