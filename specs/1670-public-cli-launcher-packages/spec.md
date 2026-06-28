# Spec 1670 — Public fit-* CLIs resolve from npm under their invoked names

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The Kata agent team's own automation invokes first-party CLIs by name (`fit-trace`, `fit-wiki`, `fit-xmr`). When a run executes those outside a warm workspace, resolution falls through to the registry and 404s — failing the job. The `kata-storyboard` run on 2026-06-08 ([run 27133534559, job 80080166294](https://github.com/forwardimpact/monorepo/actions/runs/27133534559/job/80080166294)) ended after Q4 (never reached Q5) and the job hard-failed at `error: GET https://registry.npmjs.org/fit-trace - 404`, with participant agents visibly unable to resolve their CLIs mid-session (falling back to `find`, `bun install`, and direct file paths). |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | Gear's promise is that humans and agents share capabilities "through the same interface … installed via `npx fit-*`". An external builder who runs a documented Gear command such as `npx fit-rc` or `npx fit-xmr` gets a 404, because no package by that name is published. |
| Empowered Engineers | [Equip Aligned Agent Teams](../../JTBD.md#empowered-engineers-see-whats-expected-of-humans-and-agents) | The product getting-started guides instruct engineers to run `npx fit-landmark`, `npx fit-map`, `npx fit-summit`, `npx fit-pathway`, `npx fit-guide`, `npx fit-outpost` as the documented first step. Because the published package names differ from these invoked names, each command resolves to no registry package and fails for any user who is not inside the monorepo workspace. |

## Problem

The documented and assumed way to run a first-party CLI is `npx fit-<name>` /
`bunx fit-<name>`. [CLAUDE.md](../../CLAUDE.md) states the distribution model
as *"npm packages — `fit-*` and `kata-*` CLIs and libraries, installed via
`npx fit-*`."* That contract is not backed by reality: **no package is
published under any `fit-*` name.** Every CLI ships only as a `bin` entry
inside a differently-named scoped package, and the bin name never equals the
package name.

| Invoked name (docs / skills / actions) | Actually published as | `npx <name>` resolution |
|---|---|---|
| `fit-trace`, `fit-eval`, `fit-benchmark` | `@forwardimpact/libeval` | no such package |
| `fit-wiki` | `@forwardimpact/libwiki` | no such package |
| `fit-xmr` | `@forwardimpact/libxmr` | no such package |
| `fit-doc` | `@forwardimpact/libdoc` | no such package |
| `fit-rc` | `@forwardimpact/librc` | no such package |
| `fit-map` | `@forwardimpact/map` | no such package |
| `fit-guide`, `fit-landmark`, `fit-summit`, `fit-pathway`, `fit-outpost` | `@forwardimpact/{guide,landmark,summit,pathway,outpost}` | no such package |

The scoped packages themselves are published and resolve — only the **names
users actually type** are absent from the registry. A multi-bin package makes
the mismatch structural rather than cosmetic: `@forwardimpact/libeval` carries
four bins (`fit-eval`, `fit-trace`, `fit-benchmark`, `fit-selfedit`), so a
single package cannot be renamed to satisfy even one of the invoked names.

The defect is masked for internal contributors because `bun install` links
every workspace package's bin into `node_modules/.bin`, so a bare
`bunx fit-map` resolves the *local* bin. Resolution therefore appears to work
in local dev and warm-cache CI, and only fails where there is no workspace bin
on the resolution path:

- **Published composite actions** — the `fit-eval@v1` trace step and
  `fit-wiki@v1` ran `bunx fit-trace` / `bunx fit-wiki` and 404'd after the
  agent run (the failure above). This investigation applied a narrower
  resolution fix to those actions (in their sibling repos); this spec removes
  the underlying cause so that workaround is no longer load-bearing.
- **In-session agents** invoking `bunx fit-wiki` / `bunx fit-xmr` once the
  workspace bin drifted from `package.json`.
- **Every external user** following the getting-started guides.

The current publish pipeline never tests the contract: its smoke step installs
the scoped tarball and checks that the bin *file* exists (`test -f
node_modules/$NPM_NAME/$BIN` in `publish-npm.yml`), but never verifies that
`npx <invoked-name>` resolves. So the gap is unguarded and silently widens as
new CLIs are added.

## Scope

### Public-CLI set (the unit of work)

A CLI is **public** — and therefore in scope — if and only if it satisfies
**both**:

1. It is invoked by name as `npx`/`bunx fit-<name>` in at least one of:
   external product or library docs under `websites/fit/docs`; a **published**
   skill pack under `.claude/skills` (excluding internal, never-published
   skills); or a published composite action.
2. That exact name resolves to a real `bin` entry in a **non-private**
   workspace package.

Classification is **per bin, not per package**: a multi-bin package
contributes only the bins that meet the rule (so `@forwardimpact/libeval`
contributes `fit-eval`, `fit-trace`, `fit-benchmark`, but not `fit-selfedit`,
which no doc, skill, or action invokes).

The set is the rule's output, not a hand-maintained list: the implementation
regenerates membership from the rule, and the enumeration below is the current
result, recorded so membership is auditable. Applying the rule today yields
these 22 CLIs:

| CLI | Source package | CLI | Source package |
|---|---|---|---|
| `fit-benchmark` | `@forwardimpact/libeval` | `fit-query` | `@forwardimpact/libgraph` |
| `fit-codegen` | `@forwardimpact/libcodegen` | `fit-rc` | `@forwardimpact/librc` |
| `fit-doc` | `@forwardimpact/libdoc` | `fit-search` | `@forwardimpact/libvector` |
| `fit-eval` | `@forwardimpact/libeval` | `fit-subjects` | `@forwardimpact/libgraph` |
| `fit-guide` | `@forwardimpact/guide` | `fit-summit` | `@forwardimpact/summit` |
| `fit-landmark` | `@forwardimpact/landmark` | `fit-terrain` | `@forwardimpact/libterrain` |
| `fit-map` | `@forwardimpact/map` | `fit-trace` | `@forwardimpact/libeval` |
| `fit-outpost` | `@forwardimpact/outpost` | `fit-unary` | `@forwardimpact/librpc` |
| `fit-pathway` | `@forwardimpact/pathway` | `fit-wiki` | `@forwardimpact/libwiki` |
| `fit-process-graphs` | `@forwardimpact/libgraph` | `fit-xmr` | `@forwardimpact/libxmr` |
| `fit-process-resources` | `@forwardimpact/libresource` | `fit-process-vectors` | `@forwardimpact/libvector` |

### In scope

| Component | What changes |
|---|---|
| Each CLI in the public set above. | Becomes resolvable from the npm registry under the exact name it is invoked with, so `npx <cli>` / `bunx <cli>` runs that CLI from a clean environment with no monorepo workspace present, executing the same implementation at the same version as the scoped source package it is published alongside. |
| The npm publish pipeline (`publish-npm.yml` and the release procedure it serves). | Gains a contract gate: a release does not complete unless every public CLI it ships resolves and runs under its invoked name from a clean environment at the version shipped in that release. Publishing a public CLI and its implementation is atomic within a release. |
| The CLI distribution statement in `CLAUDE.md` and the getting-started guides. | The documented `npx fit-*` contract becomes true by construction; a future reader can trace the contract to this spec. No instruction is changed away from `npx fit-*` — the instructions become correct rather than rewritten. |

### Out of scope

- **`kata-*`.** No `kata-*` CLI bins exist; `kata-skills` / `fit-skills`
  distribute as skill packs via `npx skills add forwardimpact/<repo>`, a
  separate mechanism unaffected by this defect.
- **Bins that the rule does not select** — service bins (`fit-svc*`) and real
  bins no doc/skill/action invokes (`fit-selfedit`, `fit-storage`,
  `fit-logger`, `fit-svscan`, `fit-visualize`, `fit-download-bundle`,
  `fit-tiktoken`, `coaligned`). These remain invocable only via their scoped
  package; `npx fit-svcmap` continuing to fail is acceptable.
- **Doc references to names with no bin** (`fit-graph`, `fit-vector` appear in
  prose but back no `bin`). Correcting those doc references is a separate fix.
- **The already-shipped `--package=` resolution fix** in the `fit-eval@v1` and
  `fit-wiki@v1` sibling actions. It stays as defense-in-depth; this spec
  neither depends on nor reverts it.
- **`scripts/bootstrap.sh` workspace-cache drift** (the cache-hit path skips
  `bun install`). A separate fragility; this spec removes the
  registry-resolution failure regardless of workspace state.
- **Renaming or unscoping any existing implementation package**, and **changing
  any CLI's commands, flags, or behaviour.** Only the name under which each CLI
  is reachable from the registry changes.

## Directed approach (non-binding)

This spec fixes only the observable contract in § Success Criteria; the
mechanism is the design's to own
([`kata-design`](../../.claude/skills/kata-design/SKILL.md)), which must weigh
alternatives and prior art. As **non-binding** context, the originating
investigation favours publishing each public CLI under its invoked name via a
thin package that delegates to its scoped implementation (a launcher per public
CLI), pinned to and published atomically with that implementation. The design
may adopt or reject this; nothing in the Success Criteria depends on the
mechanism being a launcher.

## Success Criteria

| Claim | Verification |
|---|---|
| Every CLI in the public set (the 22 enumerated above) resolves and runs under its invoked name from an environment with no monorepo workspace. | In a temporary directory with no `node_modules` and no FIT lockfile, run `npx --yes <cli> --help` for each of the 22 names; observe exit 0 and output that identifies that CLI (for multi-bin sources, the banner names the specific bin, not a sibling). |
| Bare `bunx fit-trace`, `bunx fit-wiki`, and `npx fit-xmr` — the invocations that failed in the originating run — succeed from a clean directory. | From a clean temp dir, run each; observe exit 0 and the matching CLI banner, with no `registry.npmjs.org/<name>` resolution error. |
| Every `npx fit-*` invocation printed in the external getting-started guides resolves. | Extract each distinct `npx fit-*` command from `websites/fit/docs/getting-started`; run each from a clean temp dir; observe none returns a registry resolution failure. |
| A public CLI invoked from the registry runs its scoped source package's implementation at the version released alongside it — not a wrapper's own version. | Install the published CLI name into a clean project; observe the implementation it executes resolves to the scoped source package, and the version it reports is that scoped package's released version (the authoritative value is the scoped package's version, not any wrapper version). |
| The published public-CLI set equals the rule's output — no member missing, none extra. | Regenerate the set from the rule (invoked-name sources ∩ non-private bins, classified per bin) and compare to the set of published invoked-names; observe the two are identical. |
| The publish pipeline refuses to complete a release in which any public CLI fails to resolve-and-run under its invoked name, and never leaves an invoked name published without its working implementation at that version. | Inspect the pipeline's contract gate and exercise it against a release where one public CLI's invoked name is unresolved or version-skewed; observe the gate fails the release before it completes and no invoked name is published without its matching implementation. |
| Bins outside the public set are not published under bare names. | From a clean temp dir, run `npx --yes fit-svcmap`, `npx --yes fit-selfedit`, and `npx --yes fit-logger`; observe each does not resolve as a bare name — the published set equals the rule's output, no more. |
| The `CLAUDE.md` distribution statement and getting-started instructions are backed by published packages. | Read the CLI distribution statement and each getting-started `npx fit-*` step; observe every named CLI resolves from the registry and the contract traces to this spec. |
