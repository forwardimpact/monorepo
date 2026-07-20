# Monorepo Structure Standard

> "A system is a network of interdependent components that work together to try
> to accomplish the aim of the system. A system must have an aim. Without an
> aim, there is no system."
>
> — W. Edwards Deming, _The New Economics_

This standard defines the _shape_ of a repository shared by humans and coding
agents — the top-level directories and how the universal root files and jobs map
onto them. It builds on the
[Jidoka Instruction Architecture](JIDOKA.md), which defines the
instruction layers and the universal root files every co-aligned repository
carries (`CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, and the JTBD conventions).
This standard adds the directory shape those files live in.

Each job names the progress a persona seeks; each directory and file traces back
to a job it serves. Structure without aim is arbitrary — aim without structure
is invisible.

## Top-Level Directories

Three directories carry shippable code, each with its own `README.md` capturing
the jobs that directory exists to serve:

- **`products/`** — User-facing products. Each product has a `README.md` that
  names the personas it serves and the progress it helps them make.
- **`services/`** — Long-running services consumed by products. Each service
  has a `README.md` that captures the jobs it does for the products and
  platform builders that depend on it.
- **`libraries/`** — Shared code consumed by products and services. Each
  library has a `README.md` that captures the jobs it does for the platform
  builders that depend on it.

Three directories support the shippable code without being shipped themselves:

- **`websites/`** — Documentation hubs. The top-level `README.md` maps every
  guide to a Big Hire or Little Hire so documentation traces back to the jobs
  it serves.
- **`wiki/`** — Shared working memory. Where humans and agents record what
  they learn while working — observations, decisions, and context that help
  the team get better over time.
- **`infrastructure/`** — Deployment assets (Docker, gateway, database, load
  balancer). Subdirectories carry their own READMEs for the specific
  deployment concern they cover.

## Co-Developed Action Repositories

An optional concern beyond the six directories above. A repository that ships a
composite GitHub Action as its own published sibling repo may keep that action's
**canonical source in the monorepo**, co-located with the unit it belongs to,
and publish it verbatim to the sibling via a deterministic subtree split. The
contributor keeps the monorepo's context and quality gates when editing CI
actions, and the source is reachable in single-repo environments.

- **Home.** The action's source lives beside its owning unit — a library's
  action under `libraries/<lib>/actions/<name>/`, a product's under
  `products/<product>/actions/<name>/`. An action that is CI glue with no owning
  unit homes under `.github/actions/<name>/`. Each home mirrors the **whole
  sibling repo root** byte-for-byte, so the projection is faithful in both
  directions.
- **Publish.** A workflow splits each home to its sibling `main` with a pinned,
  deterministic splitter and a non-force push, so the sibling is always a
  projection of the monorepo and a divergent sibling `main` fails the push.
- **Consume.** Workflows keep SHA-pinning the published sibling; the split adds
  no gitlink and no second version reference.
- **Contribute back.** An external PR opened on the sibling is reviewed there
  but never merged there; it is replayed into the home as a normal monorepo PR
  and republished on the next split.

**Inclusion test.** Use this pattern **only** for a repo that has no other home
in the monorepo and needs no publish-time transform. Skill packs and npm
packages are excluded: they transform at publish (the skill-pack stage rewrites
layout) or already have a home under the directories above.

## Environment Bootstrap

Every agent session sets up its environment in two layers, in order:

1. **Toolchain — `fit-install.sh`.** Puts the pinned FIT toolchain on `PATH`
   (`apm`, `just`, `gh`, `rg`, `gitleaks`, `jidoka`, and any requested
   `fit-*` CLIs). It is a released, versioned, repo-agnostic artifact — the same
   bytes for every repository, installing binaries only. It never mutates a
   repository's working tree.
2. **Workspace — `scripts/bootstrap.sh`.** Uses that toolchain to reconstitute
   _this_ repository's tree: install dependencies with the repo's own package
   manager; run `apm install` to rebuild the APM skill packs and agent profiles
   when the repo carries an `apm.yml`; sync the `wiki/` working memory. It is
   repo-owned, because these steps are repo-specific.

Both entry points run **both layers, in the same order**. The CI bootstrap
action runs `fit-install.sh` then `scripts/bootstrap.sh`; the native
`.claude/settings.json` `SessionStart` hook does the same. That symmetry is the
contract — an agent gets the same tools, dependencies, skills, and memory
whether it runs in CI or a local session. **A step that must hold in both
places belongs in one of these two scripts, never in the CI-only composite
action**, which native sessions never invoke.

`scripts/bootstrap.sh` is mandatory: the CI bootstrap action invokes it by path
with no fallback, so a repo missing it fails every agent and check workflow at
that step with `exit 127`. Keep it to environment setup. Keeping the branch
current with the default branch, provisioning services, and seeding data are
separate concerns owned by whoever needs them, not folded into this entrypoint.

## Root Files

`CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` orient every contributor. Their
universal properties, the JTBD entry structure, and the `<job>` tagging
convention are defined by the [Jidoka standard](JIDOKA.md) (L1/L2). This
standard adds only the monorepo-specific placement: how jobs distribute across
the directory shape (below), and the tooling split `CLAUDE.md` spells out
(§ Internal Contributors vs External Users).

## Jobs Across the Directory Shape

Jobs distribute across the codebase so they live near the code that serves them
— the placement this repo's shape gives the Co-Aligned job conventions:

- **Big Hires** — the adoption decision per persona-outcome pair. Live in
  [JTBD.md](JTBD.md), using the full entry structure from the
  [Jidoka standard](JIDOKA.md).
- **Little Hires** — narrower, repeated daily jobs. Live in the `products/`,
  `services/`, and `libraries/` READMEs, in design docs, or near the code.

Each top-level directory's `README.md` captures the jobs that directory exists
to serve. Every job — Big or Little — is wrapped in a `<job>` tag and found with
`rg '<job '`, per [JIDOKA.md](JIDOKA.md).

## Internal Contributors vs External Users

The monorepo is open source but exists primarily for internal contributors.
External users consume products as published artifacts and never read the
source. Two consequences shape the structure:

- Internal-only conventions (build tooling, codegen, internal scripts) live in
  the monorepo and don't appear in published artifacts.
- Documentation aimed at external users lives where they can reach it
  (published packages, hosted sites), not in internal-only files.

`CLAUDE.md` is the canonical place to spell out the specific tooling split —
package manager, task runner, codegen.

## Ambient Dependencies and Collaborator Injection

Source modules under `libraries/*/src`, `products/*/src`, and `services/*/src`
do not reach for ambient node-runtime dependencies. They receive their
collaborators explicitly, so a reader learns a module's dependency surface from
its constructor signature and a test can substitute fakes without touching the
real filesystem, spawning subprocesses, or sleeping real wall-clock time.

### The four collaborator surfaces

One `runtime` bag — `{ fs, fsSync, proc, clock, subprocess, finder }` — flows
from each binary's entry point through libcli's `ctx.deps` slot into every
constructor and factory:

- **`clock`** — `now()` / `sleep(ms)` instead of `Date.now()`, `new Date()`,
  or `setTimeout(...)`.
- **`fs` / `fsSync`** — the async or sync filesystem surface a module actually
  uses, instead of importing `node:fs` / `node:fs/promises`. A module takes one
  surface, never both.
- **`proc`** — `cwd()`, `env`, `argv`, `stdin`, `stdout`/`stderr`, and `exit`
  instead of the global `process`. Handlers return a typed result and the bin
  shim translates it to an exit code; `process.exit` survives only in
  `bin/*.js`.
- **`subprocess`** — `run`/`spawn` (or a typed wrapper such as `GitClient` /
  `GhClient`) instead of importing `node:child_process`.

`libutil` owns the bag (`createDefaultRuntime`), the `Finder` refactor, and the
typed `GitClient` / `GhClient`. The canonical fakes live in libmock — see
[libmock § Collaborators](libraries/libmock/README.md#collaborators) — and
every test imports them from there.

### Enforcement

All of these run as declarative rule modules under
`.jidoka/invariants/`, executed by `jidoka invariants` via
`bun run invariants`.

- `ambient-deps.rules.mjs` flags any new src file that imports
  `node:fs` / `node:child_process`, calls `Date.now` / `new Date` /
  `setTimeout`, or reads `process.*` outside the allow-listed factories, bin
  shims, and libcli internals. A monotone deny-list grandfathers files still
  being migrated and shrinks as each unit converts.
- `subprocess-in-tests.rules.mjs` flags tests that spawn `node` or a
  project bin, exempting the one `*.integration.test.js` smoke test per binary.
- `libmock.rules.mjs` flags inline reimplementations of the canonical
  fakes.
- `collaborator-construction.rules.mjs` flags any module under
  `libraries/`, `products/`, or `services/` that constructs a leaf
  collaborator itself — `new Finder(...)`, `createDefaultProc(...)`,
  `createDefaultClock(...)`, or `createDefaultSubprocess(...)` — instead of
  receiving it off the injected `runtime` bag. Only `libutil` constructs them;
  `createDefaultRuntime(...)` (the composition-root factory) is exempt. There
  is no deny-list: the tree is clean, so any hit is a real regression.

These four enforce this policy. They are a subset of the invariant checks
chained under `bun run invariants` — the `invariants` script in the root
`package.json` is the authoritative list, and each check states its own rule
in its header comment. Authoring-facing rules (such as the
temporal-reference invariant) live in
[CONTRIBUTING.md § Invariants](CONTRIBUTING.md#invariants).
