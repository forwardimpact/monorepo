# Spec 2200 — Gemba, an agent-runtime platform product

**Classification:** Product — defines a new user-facing product and repositions
an existing one (Gear); it changes what external personas can hire, not just
internal tooling.

**The product is Gemba.** Its directory is `products/gemba/`, its package
`@forwardimpact/gemba`, its skill `fit-gemba`, and its overview page
`websites/fit/gemba/index.md`. "Gemba" — the actual place where work happens —
names the substrate an agent team runs on, matching the house lean vocabulary
(Kata, Plan-Do-Study-Act). The library, CLI, and action names are unchanged;
only the actions' home moves and the runtime libraries change which meta-product
re-exports them.

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
| `svctrace` is not part of the agent-run loop. | `fit-trace` (a `libharness` bin) reads **NDJSON** output from `fit-harness`; it references neither gRPC nor OpenTelemetry. `@forwardimpact/svctrace` is "OpenTelemetry span ingestion and storage over gRPC," and its only product consumer is `products/guide`. It is a build-time/retrieval service, not the collector `fit-trace` reads from. |
| The runtime packages are product-independent and already reused beyond Kata. | `libharness`, `libwiki`, `libxmr` live under `libraries/` (none under `products/kata/`); `fit-install.sh` bundles the `fit-*` runtime CLIs that the `kata-*` skills invoke; and the published `harness`/`wiki` actions are invoked by workflows outside the Kata team run. |

### Who is affected

| Affected | How |
| --- | --- |
| Teams Using Agents | Cannot find or hire "the thing you run an agent team on" — it has no name, page, or install story of its own; they must reverse-engineer it out of Gear, `libraries/*/actions/`, and `.github/`. |
| Platform Builders | Gear's promise is blurred by two audiences; a builder wanting composable primitives wades through agent-runtime concerns and vice versa. |
| Kata | Reads as the substrate's owner rather than its first tenant, obscuring that the platform is generic and another team could run on it. |

## Proposal

Define a new Secondary meta-product, `Gemba`, whose single job is to
**stand up and operate an agent team**, and split the agent-runtime substrate
out of Gear (and out of the library directories) into it along one boundary:
**`Gemba` ships what you run; Gear ships what you import.**
Name Kata as the platform's reference implementation.

`Gemba` follows the meta-package shape Gear and Kata already establish — a
`package.json` with a JTBD and no `bin/`/`src/` of its own (each capability
keeps its existing CLI) — but its concrete surface is two-sided:

- **An npm axis.** It re-exports the three runtime *libraries* whose CLIs you run
  to operate a team: `@forwardimpact/libharness` (`fit-harness`, `fit-trace`),
  `@forwardimpact/libwiki` (`fit-wiki`), and `@forwardimpact/libxmr`
  (`fit-xmr`).
- **A GitHub Actions axis.** It owns `products/gemba/actions/` — the
  composite actions that execute the coding-agent runtime in CI: `bootstrap`
  (stand up), `harness` (run), `wiki` (remember), and `benchmark` (measure).
  These move here from `.github/actions/` and the two library directories,
  mirroring the precedent that `products/kata/actions/` already sets for a
  product owning its actions.

Extracting the actions out of `libraries/libharness/` and `libraries/libwiki/`
leaves those two libraries as pure import targets. Gear sheds the three runtime
libraries and the "chart agent metrics" clause, leaving one clean promise:
composable primitives you build agents *with*. `svctrace` stays in Gear — it is
a build-time/retrieval service (Guide's OTel collector), never part of the run
loop.

**JTBD relationship.** The primary persona is **Teams Using Agents**. Its
existing job, *Run a Continuously Improving Agent Team*, is Kata-owned (both its
hires resolve to Kata) and stays unchanged — that job is the reference tenant.
`Gemba` adds a new, distinct job for the same persona, *Stand Up and Operate
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
| New product `products/gemba/` | A Secondary meta-package (`package.json` with `description` and one Big Hire `jobs` entry, `user` = `Teams Using Agents`) that re-exports the three runtime libraries and owns the run actions under `actions/`. No `bin/`/`src/`, following the Gear/Kata meta-package exemption. |
| New JTBD job | Add a *Teams Using Agents → Stand Up and Operate an Agent Team* job to the new package's `jobs`; leave Kata's existing *Run a Continuously Improving Agent Team* job untouched. |
| Runtime library subset | `Gemba` re-exports exactly the three operate-an-agent-team libraries: `@forwardimpact/libharness` (`fit-harness`/`fit-trace`, and its `fit-benchmark`/`fit-selfedit` bins travel with the package), `@forwardimpact/libwiki` (`fit-wiki`), and `@forwardimpact/libxmr` (`fit-xmr`). `svctrace` is **not** in this subset. |
| Run-actions relocation | Move the agent-run composite actions into `products/gemba/actions/`: `bootstrap` (from `.github/actions/bootstrap/`), `harness` and `benchmark` (from `libraries/libharness/actions/`), and `wiki` (from `libraries/libwiki/actions/`). Repoint the `publish-actions.yml` matrix `prefix:` and `paths:` filters; the **sibling repo names** (`bootstrap`, `harness`, `benchmark`, `wiki`) and their consumer SHA pins are unchanged. |
| Libraries become pure | After the move, `libraries/libharness/` and `libraries/libwiki/` no longer contain an `actions/` directory; they are import-only libraries. |
| Bring-up narrative ownership | The bootstrap layer (now `products/gemba/actions/bootstrap/`, holding both `fit-install.sh` and `fit-bootstrap.sh` side by side) is framed as `Gemba`'s stand-it-up story in the product's overview and skill. |
| Generalize the bring-up script | Generalize `scripts/bootstrap.sh` into `fit-bootstrap.sh` and place it next to `fit-install.sh` in `products/gemba/actions/bootstrap/`. The two split the bring-up cleanly: `fit-install.sh` installs the tools and `fit-*` binaries, then `fit-bootstrap.sh` reconstitutes the workspace (install/codegen) and syncs the wiki. Generalizing means removing this repo's hardcoded assumptions so the script is repo-agnostic and publishable, exactly as `fit-install.sh` already is. The `bootstrap` action runs it via `bash "$GITHUB_ACTION_PATH/fit-bootstrap.sh"` (replacing the `./scripts/bootstrap.sh` step), and its other live callers (the `.claude/settings.json` Stop hook and `scripts/worktree-create.sh`) repoint to the new path. |
| Bootstrap path references | Because `bootstrap/` moves out of `.github/actions/`, every live local-path reference to it moves too: the `.claude/settings.json` SessionStart hook and the `justfile` `install-deps` recipe (both `bash …/bootstrap/fit-install.sh`), the `publish-binaries.yml` `sparse-checkout`/`sed` source for the released installer, and the ignore globs in `.rumdl.toml`, `biome.json`, `eslint.config.js`, and the two `.coaligned/invariants/*.rules.mjs` modules. `uses:` consumers are unaffected — no workflow references the action by local path (only the `forwardimpact/bootstrap` sibling pin). |
| Release-bundle coupling | `publish-binaries.yml` stamps and ships `fit-install.sh` under the **`gear`** release bundle (`bundle == 'gear'`). This spec keeps that coupling as-is — the installers stay on the Gear release train — repoints `fit-install.sh`'s source path, and **adds `fit-bootstrap.sh` to the same gate**: check it out, stamp it the same way, and stage it into `dist/release/` so it publishes as a co-versioned Release asset beside `fit-install.sh`. Re-homing either installer onto a Gemba release bundle is out of scope (see § Excluded). |
| Standard adopts the published script | Rewrite the Monorepo standard so the bring-up script *is* the published `fit-bootstrap.sh`, not a vendored root script. `MONOREPO.md` (§ Workspace and the bring-up description) and the `.claude/skills/monorepo-setup/` skill and references describe `fit-bootstrap.sh` as the bring-up step a repo fetches and runs; write them evergreen, as the end state, with no trace of the removed `scripts/bootstrap.sh` and no migration language. Repoint the explanatory comments in `.github/actions/bootstrap/action.yml`, `products/kata/actions/kata-agent/action.yml`, and `libraries/libwiki/src/util/wiki-dir.js` to match. |
| Gear refocus (clean break) | Remove the three runtime libraries from `products/gear/package.json`, and remove the operate-time promise ("chart agent metrics") from Gear's `jobs` entry, so Gear's promise is build-time primitives only. `svctrace` remains a Gear dependency. |
| Overview page | `websites/fit/gemba/index.md` — the cohesive "stand up and operate an agent team" story, organized by persona, presenting the CLIs and the CI actions as one runtime loop, with a Getting Started that names the bring-up layer. |
| Skill | `.claude/skills/fit-gemba/SKILL.md` describing when to hire the platform and how its capabilities compose (stand up → run → see → remember → measure). |
| Kata as reference implementation | The overview page and `KATA.md` name Kata as the platform's first tenant — the proof the substrate is generic and swappable — without moving any Kata code. |
| Generated context + counts | Regenerate the `JTBD.md` and `products/README.md` catalog blocks via the repo's context command, and update the hand-maintained product-count prose in the `products/README.md` intro, `CLAUDE.md` § Secondary Products, and the `sibling-composite-actions` enum / `.github/CLAUDE.md` action-home prose to reflect the new action homes and both products. |

### Excluded

| Item | Why |
| --- | --- |
| `svctrace` membership in `Gemba` | `svctrace` is an OTel gRPC ingestion service consumed by Guide, not the collector `fit-trace` reads from. It stays a Gear re-export; it never enters the runtime subset. |
| Renaming the sibling action repos | Only the monorepo `prefix:` (source path) moves; the published sibling repos (`bootstrap`, `harness`, `benchmark`, `wiki`) keep their names, so downstream `uses:` pins are untouched. |
| `fit-doc` / `libdoc` placement | Stays in Gear as a general infrastructure primitive; it fails the run-the-team test. Reopen only if the platform later claims a "publish team knowledge" verb. |
| `fit-rc` / `fit-svscan` placement | They operate a *service stack*, not an agent team; they remain Gear infrastructure. |
| Shared foundation packages | `libtelemetry`, `libutil` and the like are not part of the runtime subset; wherever Gear re-exports them today is untouched, and `Gemba` does not claim them. |
| Re-homing the released installers onto a Gemba bundle | `fit-install.sh` and `fit-bootstrap.sh` keep riding the `gear` release bundle in `publish-binaries.yml`; moving them to a Gemba-specific release train is a separate release-pipeline change, not this boundary move. |
| Moving or renaming any runtime *library* on disk | The libraries stay at their `libraries/` paths; only their `actions/` subdirectories move and only the re-export lists change. |
| A standalone CLI for the platform | Like Gear, the product is a meta-package; capabilities keep their own CLIs. |

## Deferred decisions

Named here as the single home for each, so they are tracked rather than silently
dropped. None blocks capturing the product; each is resolved in a later
iteration.

- **`fit-terrain` / `libterrain` home.** Its placement (Gemba vs Gear vs its
  own product) is entangled with the Map standard and the synthetic
  sub-libraries; decided after this product lands. Untouched here — it stays a
  Gear re-export for now.
- **`svcpathway` mis-filing.** `svcpathway` is the Pathway product's service and
  is arguably mis-listed in Gear today; a pre-existing Gear-hygiene item
  independent of this boundary. Flagged, not fixed here.

## Success criteria

Each references the product's contents and the Gear boundary. "Gemba's
`package.json`" means the single `package.json` under the new `products/gemba/`
directory created by this change.

| # | Claim | Verification |
| --- | --- | --- |
| 1 | The new meta-package re-exports exactly the three runtime libraries and nothing from the build-time set. | Static check: the new `package.json` `dependencies` are exactly `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`; no retrieval/contract/storage package and no `svctrace` appears. |
| 2 | Gear no longer re-exports any runtime-subset library. | Static check: `products/gear/package.json` `dependencies` contain none of `@forwardimpact/libharness`, `@forwardimpact/libwiki`, `@forwardimpact/libxmr`. |
| 3 | Each of the three runtime libraries is re-exported by exactly one meta-product. | Static check: no runtime-subset library appears in both `products/gear/package.json` and the new package's `dependencies`. |
| 4 | `svctrace` stays a Gear build-time dependency and never enters `Gemba`. | Static check: `@forwardimpact/svctrace` appears in `products/gear/package.json` `dependencies` and does not appear in the new package's `dependencies`. |
| 5 | Gear's job no longer promises any operate-time capability. | Static check: Gear's `jobs` `littleHire` no longer contains the "chart agent metrics" clause or any equivalent metrics/operate-a-team verb. |
| 6 | The four agent-run actions live under the product and the libraries are pure. | Static check: `products/gemba/actions/{bootstrap,harness,wiki,benchmark}/action.yml` exist; `libraries/libharness/actions/` and `libraries/libwiki/actions/` no longer exist; `.github/actions/bootstrap/` no longer exists. |
| 7 | The action move preserves publication: same sibling repos, repointed sources. | Static check: `publish-actions.yml` matrix `prefix:` entries for `bootstrap`/`harness`/`benchmark`/`wiki` point under `products/gemba/actions/`, the `repo:` names are unchanged, and the `paths:` filter matches the new sources. |
| 8 | The new product declares one Big Hire for the operate persona, distinct from Kata's job. | Static check: the new package's `jobs` array has exactly one entry whose `user` is `Teams Using Agents` and whose `goal` is not `Run a Continuously Improving Agent Team`. |
| 9 | The product has an overview page and a skill that name the bring-up layer and present the runtime loop as one workflow. | `websites/fit/gemba/index.md` and `.claude/skills/fit-gemba/SKILL.md` exist; each names the bootstrap layer and references `fit-harness`, `fit-wiki`, `fit-xmr`, and `fit-trace`, and presents the CI actions as the same loop. |
| 10 | Kata is documented as the platform's reference implementation, with no Kata code moved. | `KATA.md` and the overview page name Kata as a tenant of the platform; `git diff` shows no change under `products/kata/`. |
| 11 | Generated context and hand-maintained counts reflect both products and the new action homes. | After `bun run context:fix`, the `JTBD.md` and `products/README.md` catalog blocks list the new product and the refocused Gear; the `products/README.md` intro count, `CLAUDE.md` § Secondary Products, and the `sibling-composite-actions` action-home prose are updated; `bun run check` passes. |
| 12 | The remaining deferred decisions are recorded, not silently resolved. | § Deferred decisions names the `fit-terrain` and `svcpathway` items; `git diff` shows neither acted on (no `libterrain`/`svcpathway` dependency move). No runtime library, CLI, or sibling action repo is renamed (`git diff` shows library `package.json` `name`/`bin` fields and `publish-actions.yml` `repo:` values unchanged). |
| 13 | No local-path reference to the old `bootstrap` home dangles after the move. | Static check: `rg --hidden '\.github/actions/bootstrap' -g '!specs/**' -g '!.git/**'` returns no matches (the `--hidden` flag is required — rg skips dotfiles by default, which is where most of these references live); `.claude/settings.json`, `justfile`, `publish-binaries.yml`, `.rumdl.toml`, `biome.json`, `eslint.config.js`, and the two `.coaligned/invariants/*.rules.mjs` modules point at `products/gemba/actions/bootstrap/`; `bun run check` passes. |
| 14 | `fit-bootstrap.sh` exists beside `fit-install.sh`, is published, and the standard describes it as the bring-up script with no trace of the old `scripts/bootstrap.sh`. | Static check: `products/gemba/actions/bootstrap/fit-bootstrap.sh` exists; `scripts/bootstrap.sh` no longer exists; `publish-binaries.yml` has a `bundle == 'gear'` step that stamps and stages `fit-bootstrap.sh` into `dist/release/` alongside `fit-install.sh`; the `bootstrap` `action.yml` runs `$GITHUB_ACTION_PATH/fit-bootstrap.sh`; `MONOREPO.md` § Workspace and the `monorepo-setup` skill name `fit-bootstrap.sh` as the bring-up step; and `rg --hidden 'scripts/bootstrap\.sh' -g '!specs/**' -g '!.git/**'` returns no matches; `bun run check` passes. |

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
