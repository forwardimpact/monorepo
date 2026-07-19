# Spec 2250 — An agent-runtime platform product

**Classification:** Product — defines a new user-facing product and repositions
an existing one (Gear); it changes what external personas can hire, not just
internal tooling.

**Naming is deferred.** This spec commits to the product's existence, job, and
boundary, not its name. Every identifier below is a placeholder: the product is
`PLATFORM`, its directory `products/<platform>/`, its package
`@forwardimpact/<platform>`, and its command family `<platform>-<capability>`
(e.g. `<platform>-harness`). `PLATFORM` and `<platform>` denote the same
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
- **Its user interface is library-owned.** The commands a team actually types —
  `fit-harness`, `fit-trace`, `fit-wiki`, `fit-xmr` — are thin `bin/` entry
  points declared by three library packages, so the operate-a-team surface
  reads as four freestanding `fit-*` tools rather than one product's command
  family. No product owns the interface.
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
| The CLI wiring is thin and separable from the components. | Each runtime CLI is a `bin/*.js` entry point that builds a CLI definition and dispatches to command handlers imported from its library's `src/`; the components and classes live entirely under `src/`. The launcher packages import only the `bin` subpath. |
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

Define a new Secondary product, `PLATFORM`, whose single job is to
**stand up and operate an agent team**, and split the agent-runtime substrate
out of Gear (and out of the library directories) into it along one boundary:
**`PLATFORM` ships what you run; Gear ships what you import.**
Name Kata as the platform's reference implementation.

`PLATFORM` is a **consumer** of the runtime libraries, not a re-exporter: it
depends on them and turns them into usage surfaces. It exposes exactly two —
the CLIs and the GitHub Actions — and no importable API of its own:

- **A CLI axis.** It owns the thin CLI wiring. The `bin/` entry points that
  today live inside the libraries move to `products/<platform>/bin/` and are
  renamed to the product's command family: `<platform>-harness`,
  `<platform>-trace`, `<platform>-benchmark`, `<platform>-selfedit` (from
  `libharness`), `<platform>-wiki` (from `libwiki`), and `<platform>-xmr`
  (from `libxmr`). Each bin stays what it is today — interface wiring that
  parses argv and dispatches to command handlers, now imported from the
  library packages instead of a sibling `src/`. The libraries stop declaring
  `bin` entries: the product owns the interface, the libraries own the
  implementation. The npm package `@forwardimpact/<platform>` is the install
  vehicle for this axis: a `bin` map and `dependencies`, no `exports`, no
  `main`, nothing importable.
- **A GitHub Actions axis.** It owns `products/<platform>/actions/` — the
  composite actions that execute the coding-agent runtime in CI: `bootstrap`
  (stand up), `harness` (run), `wiki` (remember), and `benchmark` (measure).
  These move here from `.github/actions/` and the two library directories,
  mirroring the precedent that `products/kata/actions/` already sets for a
  product owning its actions.

APIs stay library-direct. `@forwardimpact/libharness`,
`@forwardimpact/libwiki`, and `@forwardimpact/libxmr` remain individually
published; a builder who wants the components imports the library, never the
product. With Gear shedding the three libraries too, the runtime subset leaves
the meta-package layer entirely — its API home is the libraries themselves.

Extracting the actions and the bins leaves `libharness`, `libwiki`, and
`libxmr` as pure import targets on both surfaces. Gear sheds the three runtime
libraries and the "chart agent metrics" clause, leaving one clean promise:
composable primitives you build agents *with*. `svcspan` stays in Gear — it is
a build-time/retrieval service (Guide's OTel collector), never part of the run
loop.

**Compatibility stance: clean break.** The old `fit-*` command names for the
six moved CLIs are removed, not aliased — no shim bins, no dual publish. Every
internal invoker (installer bundle, run actions, skills, docs) switches to the
new names in the same change, and the launcher set follows the rename through
the `public-cli-set` invariant that computes it.

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
| New product `products/<platform>/` | A Secondary product (`package.json` with `description` and one Big Hire `jobs` entry, `user` = `Teams Using Agents`) that owns the CLI entry points under `bin/` and the run actions under `actions/`. No `src/`, no `exports`, no `main` — the product ships usage surfaces only; the implementation stays in the libraries. |
| New JTBD job | Add a *Teams Using Agents → Stand Up and Operate an Agent Team* job to the new package's `jobs`; leave Kata's existing *Run a Continuously Improving Agent Team* job untouched. |
| Runtime dependencies | The product's `dependencies` are consumption, not surface: the three operate-an-agent-team libraries (`@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`) plus the wiring-level foundation packages the bins already import today (`libcli`, `libconfig`, `libpreflight`, `libtelemetry`, `libutil`). `svcspan` is **not** among them. |
| CLI wiring move | The six thin `bin/` entry points move from the libraries into `products/<platform>/bin/`, renamed to the product family: `<platform>-{harness,trace,benchmark,selfedit}` (from `libharness`), `<platform>-wiki` (from `libwiki`), `<platform>-xmr` (from `libxmr`). Command handlers, components, and classes stay in each library's `src/`; the libraries export the modules the bins import and drop their `bin` fields. |
| CLI consumer repoint | Every internal invoker switches to the new names: the `bootstrap` action's installer bundle list, the `harness`/`wiki`/`benchmark` action steps, the CLI-named skills (which rename with their CLIs) and the docs they link. The launcher set is recomputed by the `public-cli-set` invariant: new-name launchers replace the old `fit-*` ones. |
| Run-actions relocation | Move the agent-run composite actions into `products/<platform>/actions/`: `bootstrap` (from `.github/actions/bootstrap/`), `harness` and `benchmark` (from `libraries/libharness/actions/`), and `wiki` (from `libraries/libwiki/actions/`). Repoint the `publish-actions.yml` matrix `prefix:` and `paths:` filters; the **sibling repo names** (`bootstrap`, `harness`, `benchmark`, `wiki`) and their consumer SHA pins are unchanged. |
| Libraries become pure | After the moves, `libraries/libharness/` and `libraries/libwiki/` no longer contain an `actions/` directory, and none of the three runtime libraries contains a `bin/` directory or declares a `bin` field; they are import-only libraries. |
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
| Re-exporting the runtime libraries' APIs | The product exposes nothing importable. The three libraries stay individually published as the API home; adding them to another meta-package would re-create the second import channel this spec removes. |
| Shared foundation packages | `libtelemetry`, `libutil` and the like are not part of the platform's surface; the product's bins consume them as ordinary dependencies exactly as the library bins do today, and wherever Gear re-exports them is untouched. |
| Generalizing `scripts/bootstrap.sh` → `fit-bootstrap.sh` | Extracting a generic installer is a follow-up; this spec relocates and narrates the bring-up layer, not the installer refactor. |
| Moving or renaming any runtime *library* on disk | The libraries stay at their `libraries/` paths; only their `bin/` entry points and `actions/` subdirectories move, and only dependency lists change. |
| An umbrella `fit-<platform>` CLI | The product owns one thin bin per capability, not a new aggregate command; each capability keeps its own command surface, carried under the product's name. |
| Moving handlers or classes out of the libraries | Only interface wiring moves. Command handlers, session/wiki/XmR components, and their tests stay in `libraries/`; the bins import them through package exports. |
| Back-compat alias bins for the old `fit-*` names | Clean break per repo policy; consumers and launchers move to the new names in the same change. Deprecating the superseded launcher packages on npm follows the standing release process. |

## Deferred decisions

Named here as the single home for each, so they are tracked rather than silently
dropped. None blocks capturing the product; each is resolved in a later
iteration.

- **Product name.** The placeholder `PLATFORM` / `<platform>` stands in
  throughout, including the command family `<platform>-*`. The name decision
  also settles whether the resolved bin names carry the `fit-` brand prefix;
  the `public-cli-set` launcher invariant already supports non-`fit` public
  CLIs, so either resolution is implementable. Success criteria are written
  against the product's contents and boundary, not its name.
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
| 1 | The product consumes the runtime subset and nothing from the build-time set, and exposes no API. | Static check: the new `package.json` `dependencies` are the three runtime libraries plus only wiring-level foundation packages the bins import; no retrieval/contract/storage package and no `svcspan` appears; the package declares no `exports` and no `main`. |
| 2 | The product owns the six CLI entry points, and owns only wiring. | Static check: the new `package.json` `bin` maps exactly `<platform>-harness`, `<platform>-trace`, `<platform>-benchmark`, `<platform>-selfedit`, `<platform>-wiki`, `<platform>-xmr` to files under `products/<slug>/bin/`; `products/<slug>/src/` does not exist. |
| 3 | The libraries ship components, not interfaces. | Static check: none of the three runtime library `package.json`s declares a `bin` field; `libraries/{libharness,libwiki,libxmr}/bin/` no longer exist; the command handlers remain under each library's `src/`. |
| 4 | No surface invokes the six old command names. | Static check: the installer bundle list, the `harness`/`wiki`/`benchmark` action steps, skills, and docs reference only the new names; `launchers/` carries launchers for the new names and none for `fit-harness`/`fit-trace`/`fit-benchmark`/`fit-selfedit`/`fit-wiki`/`fit-xmr`; the `public-cli-set` invariant passes. |
| 5 | Gear no longer re-exports any runtime-subset library. | Static check: `products/gear/package.json` `dependencies` contain none of `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`. |
| 6 | API consumption is library-direct: no meta-product re-exports the runtime subset. | Static check: after the Gear edit, no `products/*/package.json` other than the new product's lists the three runtime libraries, and the new product's page and skill document commands and actions only — no `import` guidance for the product package. |
| 7 | `svcspan` stays a Gear build-time dependency and never enters `PLATFORM`. | Static check: `@forwardimpact/svcspan` appears in `products/gear/package.json` `dependencies` and does not appear in the new package's `dependencies`. |
| 8 | Gear's job no longer promises any operate-time capability. | Static check: Gear's `jobs` `littleHire` no longer contains the "chart agent metrics" clause or any equivalent metrics/operate-a-team verb. |
| 9 | The four agent-run actions live under the product and the libraries are pure. | Static check: `products/<platform>/actions/{bootstrap,harness,wiki,benchmark}/action.yml` exist; `libraries/libharness/actions/` and `libraries/libwiki/actions/` no longer exist; `.github/actions/bootstrap/` no longer exists. |
| 10 | The action move preserves publication: same sibling repos, repointed sources. | Static check: `publish-actions.yml` matrix `prefix:` entries for `bootstrap`/`harness`/`benchmark`/`wiki` point under `products/<platform>/actions/`, the `repo:` names are unchanged, and the `paths:` filter matches the new sources. |
| 11 | The new product declares one Big Hire for the operate persona, distinct from Kata's job. | Static check: the new package's `jobs` array has exactly one entry whose `user` is `Teams Using Agents` and whose `goal` is not `Run a Continuously Improving Agent Team`. |
| 12 | The product has an overview page and a skill that name the bring-up layer and present the runtime loop as one workflow. | `websites/fit/<slug>/index.md` and the product skill exist; each names the bootstrap layer and references the product's four run-loop CLIs (`<platform>-harness`, `<platform>-trace`, `<platform>-wiki`, `<platform>-xmr`), and presents the CI actions as the same loop. |
| 13 | Kata is documented as the platform's reference implementation, with no Kata code moved. | `KATA.md` and the overview page name Kata as a tenant of the platform; `git diff` shows no change under `products/kata/`. |
| 14 | Generated context and hand-maintained counts reflect both products and the new action homes. | After `bun run context:fix`, the `JTBD.md` and `products/README.md` catalog blocks list the new product and the refocused Gear; the `products/README.md` intro count, `CLAUDE.md` § Secondary Products, and the `sibling-composite-actions` action-home prose are updated; `bun run check` passes. |
| 15 | The deferred decisions are recorded, not silently resolved. | § Deferred decisions names the product-name, `fit-terrain`, and `svcpathway` items; `git diff` shows none of the three acted on (no rename, no `libterrain`/`svcpathway` dependency move). |

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
- **Flows through spec 1670 (public CLI launchers).** The launcher set is
  computed from invoked names intersected with workspace bins, so the CLI
  rename propagates through that invariant — new-name launchers appear, the
  old `fit-*` launchers retire — without changing the launcher contract
  itself.
