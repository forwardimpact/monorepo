# Spec 2280: Gemba-Prefixed Actions and the gemba-skills Pack

**Classification:** product-aligned. The change lands on the Gemba product
surface (`products/gemba/actions/`), on its published skill distribution, and
on the documentation of those surfaces.

**Persona and job:** Teams Using Agents → Stand Up and Operate an Agent Team
(Gemba's Big Hire in JTBD.md).

## Problem

Gemba ships one runtime loop on two surfaces (spec 2250). The command surface
carries the product name: `gemba-harness`, `gemba-trace`, `gemba-wiki`,
`gemba-xmr`, `gemba-benchmark`, `gemba-selfedit`. The action surface does not.
The skill surface ships inside another product's pack. The setup skill still
teaches names from two naming generations ago. A team that hires the platform
must decode all three inconsistencies before the first workflow runs.

### The platform actions do not carry the product name

The monorepo publishes seven composite actions to sibling repos. The Kata and
Jidoka actions carry their product prefix. The four Gemba actions do not.

| Product | Action homes under `products/<product>/actions/` | Sibling repos |
| ------- | ------------------------------------------------ | ------------- |
| Kata | `kata-agent`, `kata-interview` | `forwardimpact/kata-agent`, `forwardimpact/kata-interview` |
| Jidoka | `jidoka` | `forwardimpact/jidoka` |
| Gemba | `benchmark`, `bootstrap`, `harness`, `wiki` | `forwardimpact/benchmark`, `forwardimpact/bootstrap`, `forwardimpact/harness`, `forwardimpact/wiki` |

The bare names cost consumers three ways:

- A consumer cannot attribute `uses: forwardimpact/harness` to a product. The
  name `forwardimpact/wiki` reads as the organization's wiki, not as a memory
  action.
- The action name does not mirror the CLI it fronts. The `harness` action runs
  `gemba-harness`. The `wiki` action runs `gemba-wiki`. The pairing is
  invisible in a workflow file.
- The Gemba overview page must explain that four generically named repos form
  one platform surface.

Two prior decisions produced this state, and both premises are now gone. Spec
2140 debranded the `fit-*` action repos to bare names. It kept `kata-agent`
because a bare `agent` is too generic. It dropped CLI-to-action name parity
because the CLIs were `fit-*` and no product owned the actions. Spec 2250 then
created the Gemba product and moved the action homes under it. It excluded
sibling renames because the product name was still a deferred decision. The
name is now resolved. By spec 2140's own retention test, all four bare names
fail: each is generic, and a named product owns each one.

### The platform skills ship inside the fit-skills pack

- The skill-pack publish workflow stages two prefixes (`fit gemba`) into
  `forwardimpact/fit-skills` and stamps the result with Gear's package version.
- Kata and Jidoka own product packs (`kata-skills`, `jidoka-skills`, each
  versioned by its product package). Gemba does not. Root CLAUDE.md maps
  "Gemba — `fit-skills`".
- A team that wants the six platform skills (`gemba` plus five `gemba-*`
  capability skills) must install every `fit-*` skill (seventeen today) aimed
  at a different persona, Platform Builders.
- A Kata installation gets no platform skills at all. The kata-setup
  prerequisite installs `forwardimpact/kata-skills` only. Downstream agents
  run the `gemba-wiki`, `gemba-trace`, and `gemba-xmr` CLIs with no installed
  skill that teaches them.

### The setup skill teaches superseded names

The kata-setup dispatch template pins the platform actions through
placeholders named `{{FIT_BOOTSTRAP_REF}}`, `{{FIT_HARNESS_REF}}`, and
`{{FIT_WIKI_REF}}`. Those tokens carry the `fit-` names that spec 2140
retired. One generated file shows three naming generations at once: `fit-`
placeholder tokens, bare sibling repos on the `uses:` lines, and `gemba-*` CLI
names in the `clis:` input.

### Who is affected

| Who | How |
| --- | --- |
| Teams Using Agents | The job's trigger is "the team must reverse-engineer it from CI plumbing". Unattributable action names and a skill pack hidden inside another product are that plumbing. |
| Kata installations | Setup omits the platform skills and generates workflows that teach retired names. |
| Internal contributors | Docs, enum fences, and the org repo list mix three naming generations. |

## Proposal

Bring the platform's published distribution under the product's name.

1. **Rename the four platform actions to `gemba-*`.** The monorepo homes
   become `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, and
   `gemba-wiki`. The sibling repos take the same names. GitHub repo renames
   preserve redirects, tags, and commit SHAs, so existing downstream pins keep
   resolving (the mechanism spec 2140 shipped).
2. **Publish a `forwardimpact/gemba-skills` pack.** It carries the `gemba`
   product skill and the `gemba-*` capability skills, versioned by the Gemba
   product package, installed with `apm install forwardimpact/gemba-skills`.
   The fit-skills pack returns to `fit-*` skills only.
3. **Update the kata-setup skill.** Generated templates and ref resolution
   name the `gemba-*` actions. Placeholder tokens follow. The prerequisites
   install `forwardimpact/gemba-skills` beside `forwardimpact/kata-skills`, so
   Kata agents get the platform skills with the platform.

**Compatibility stance:** clean break. Every authored reference moves in one
change. No shims, no alias repos, no dual publishing. External consumers keep
resolving only through GitHub's built-in rename redirects. Old-path removal is
a success criterion.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| Action homes under the Gemba product | The four directories rename to `gemba-*`. Contents stay byte-faithful whole-root mirrors. |
| Published sibling repos | GitHub renames the four repos to `gemba-*` (operator action; redirects retained). |
| Action publish workflow | Matrix prefixes, sibling repo names, and path filters follow the renames. |
| Monorepo workflow consumers | Every SHA-pinned `uses:` line repoints to the renamed sibling at the same SHA. |
| Sibling-internal references | The kata-agent and kata-interview actions, the Jidoka action's docs, and the benchmark action's reusable workflow repoint their `uses:` lines and self-references. |
| Skill-pack publish workflow | The fit leg stages `fit` only. A new leg publishes `gemba-skills` (prefix `gemba`, versioned by the Gemba package). |
| New sibling repo `forwardimpact/gemba-skills` | Created empty; the publishing App's installation covers it (operator action). |
| kata-setup skill | Prerequisites add the gemba-skills install. Templates, ref-resolution instructions, and placeholder tokens use the `gemba-*` names. |
| monorepo-setup skill | The pack install line adds `forwardimpact/gemba-skills`. |
| Gemba skills and product docs | The `gemba` product skill, the `gemba-benchmark` skill, the Gemba overview page, and the benchmark CI-workflow guide name the renamed actions and the pack install. |
| CLI documentation parity | The benchmark CLI's `documentation` entry and its golden help output follow the skill's renamed link text. |
| Enum and contributor docs | The action table in `.github/CLAUDE.md` (the `sibling-composite-actions` enum source), the reseeded fences in CLAUDE.md and KATA.md, the Distribution Model pack list, and the Gemba pack mapping update together. |
| Repo-local path references | The session hook, the justfile installer recipe, and the binaries publish workflow follow the bootstrap directory rename. |

### Excluded

| Item | Why |
| ---- | --- |
| CLI names, npm packages, launchers | Already `gemba-*`. Unchanged. |
| The `fit-install.sh` file name | It is a released asset that external docs and pinned curl commands consume. Renaming it is a separate decision (spec 2250 deferred it). Only its directory moves. |
| `kata-agent`, `kata-interview`, `jidoka` action names | Already product-prefixed. Only their internal `uses:` lines change. |
| Local `.github/actions/*` CI glue | Unpublished. Outside the sibling naming standard. |
| Benchmark family fixtures (`benchmarks/*`) | Eval fixtures with their own naming. Adding or renaming families is eval work, not distribution naming. |
| Outpost pack template | It declares `fit-skills` and uses no gemba skill. The pack split does not affect it. |
| Historical records | Prior `specs/**` documents and changelog entries that name old actions are immutable records. |
| Pack mechanics | `fit-pack` staging and the APM layout are reused unchanged. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The four action homes carry the product prefix. | `ls products/gemba/actions/` lists exactly `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`. |
| 2 | The action publish matrix targets only `gemba-*` sibling repos for the platform actions. | `.github/workflows/publish-actions.yml` maps each `products/gemba/actions/gemba-*` prefix to the matching `gemba-*` repo. |
| 3 | No authored reference to the bare sibling names remains. | `rg -n 'forwardimpact/(benchmark|bootstrap|harness|wiki)\b' --glob '!specs/**' --glob '!**/CHANGELOG.md'` returns nothing. |
| 4 | The gemba skills ship as their own pack. | `.github/workflows/publish-skills.yml` carries a `gemba-skills` leg with prefix `gemba` versioned by `products/gemba/package.json`, and the fit leg's prefix is `fit` alone. |
| 5 | kata-setup teaches the platform names. | `rg -n 'FIT_(BOOTSTRAP|HARNESS|WIKI)_REF' .claude/skills/kata-setup/` returns nothing; the skill's prerequisites and templates name `forwardimpact/gemba-skills` and `forwardimpact/gemba-*` actions. |
| 6 | The enum fences list the renamed actions. | The `sibling-composite-actions` fences list `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`, `jidoka`, `kata-agent`, `kata-interview`. |
| 7 | The product docs name the pack and the renamed actions. | The Gemba overview's actions table and Getting Started name `forwardimpact/gemba-*` and `apm install forwardimpact/gemba-skills`; root CLAUDE.md maps Gemba to `gemba-skills` and lists the pack among the synced siblings. |
| 8 | Repository checks and tests stay green. | `bun run check` and `bun run test` pass. |
| 9 | The renamed siblings and the new pack publish green. | After the operator renames the four repos and creates `gemba-skills` with App access, the next `main` publish runs of `publish-actions.yml` and `publish-skills.yml` succeed on every renamed leg. |

## Relationship to other specs

- **Spec 2140 (subtree-split actions).** It established monorepo-canonical
  action sources and the rename-with-redirects mechanism. It also set the
  retention test this spec applies: a bare name survives only when it is not
  generic. This spec reuses the mechanism and reverses the bare names by that
  same test.
- **Spec 2250 (agent-platform product).** It created Gemba and deferred the
  sibling renames pending the name decision. This spec completes the naming it
  deferred.
- **Spec 2260 (Jidoka product reframe).** Precedent: a product action
  published under the product's name and a pack versioned by the product
  package.
- **Spec 2160 (bootstrap apm install).** The bootstrap action provisions the
  packs a consumer declares. The gemba-skills pack reaches downstream
  installations through that same path once declared.
