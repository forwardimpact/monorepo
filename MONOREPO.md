# Monorepo Structure Standard

> "A system is a network of interdependent components that work together to try
> to accomplish the aim of the system. A system must have an aim. Without an
> aim, there is no system."
>
> — W. Edwards Deming, _The New Economics_

This standard defines the _shape_ of a repository that humans and coding agents
share. The shape covers the top-level directories. It also covers how the
universal root files and jobs map onto them. This standard builds on the
[Jidoka Instruction Architecture](JIDOKA.md). Jidoka defines the instruction
layers. Jidoka also defines the universal root files that every repository
carries when it adopts the standard (`CLAUDE.md`, `CONTRIBUTING.md`,
`JTBD.md`, and the JTBD conventions). This standard adds the directory shape
those files live in.

Each job names the progress a persona seeks. Each directory and file traces
back to a job it serves. Structure without aim is arbitrary. Aim without
structure is invisible.

## Top-Level Directories

Three directories carry shippable code. Each one has its own `README.md` that
captures the jobs the directory exists to serve:

- **`products/`** — User-facing products. Each product has a `README.md` that
  names the personas it serves and the progress it helps them make.
- **`services/`** — Long-running services that products consume. Each service
  has a `README.md` that captures the jobs it does for the products and
  platform builders that depend on it.
- **`libraries/`** — Shared code that products and services consume. Each
  library has a `README.md` that captures the jobs it does for the platform
  builders that depend on it.

Three directories support the shippable code and never ship themselves:

- **`websites/`** — Documentation hubs. The top-level `README.md` maps every
  guide to a Big Hire or Little Hire so documentation traces back to the jobs
  it serves.
- **`wiki/`** — Shared working memory. Humans and agents record what they learn
  as they work. The wiki holds observations, decisions, and context that help
  the team get better over time.
- **`infrastructure/`** — Deployment assets (Docker, gateway, database, load
  balancer). Subdirectories carry their own READMEs for the specific
  deployment concern they cover.

## Co-Developed Action Repositories

An optional concern beyond the six directories above. Some repositories ship a
composite GitHub Action as their own published sibling repo. Such a repository
may keep that action's **canonical source in the monorepo**, co-located with
the unit it belongs to. It may then publish the action verbatim to the sibling
with a deterministic subtree split. The contributor keeps the monorepo's
context and quality gates when they edit CI actions. The source also stays
reachable in single-repo environments.

- **Home.** The action's source lives beside the unit that owns it. A library's
  action lives under `libraries/<lib>/actions/<name>/`. A product's action
  lives under `products/<product>/actions/<name>/`. An action that is CI glue
  with no owner homes under `.github/actions/<name>/`. Each home mirrors the
  **whole sibling repo root** byte-for-byte, so the projection is faithful in
  both directions.
- **Publish.** A workflow splits each home to its sibling `main`. The workflow
  uses a pinned, deterministic splitter and a non-force push. So the sibling is
  always a projection of the monorepo. A divergent sibling `main` fails the
  push.
- **Consume.** Workflows continue to SHA-pin the published sibling. The split
  adds no gitlink and no second version reference.
- **Contribute back.** An external contributor opens a PR on the sibling. The
  team reviews it there. The team never merges it there. The team replays the
  PR into the home as a normal monorepo PR. The next split republishes it.

**Inclusion test.** Use this pattern **only** for a repo that has no other home
in the monorepo and needs no publish-time transform. This pattern excludes
skill packs and npm packages. They transform at publish (the skill-pack stage
rewrites layout), or they already have a home under the directories above.

## Environment Bootstrap

Every agent session sets up its environment in two layers, in order:

1. **Toolchain — `fit-install.sh`.** It puts the pinned FIT toolchain on `PATH`
   (`apm`, `just`, `gh`, `rg`, `gitleaks`, `jidoka`, and any requested
   `fit-*` CLIs). It is a released, versioned, repo-agnostic artifact. It is
   the same bytes for every repository. It installs binaries only. It never
   mutates a repository's working tree.
2. **Workspace — `scripts/bootstrap.sh`.** It uses that toolchain to
   reconstitute _this_ repository's tree. It installs dependencies with the
   repo's own package manager. It runs `apm install` to rebuild the APM skill
   packs and agent profiles when the repo carries an `apm.yml`. It syncs the
   `wiki/` working memory. It is repo-owned, because these steps are
   repo-specific.

Both entry points run **both layers, in the same order**. The CI bootstrap
action runs `fit-install.sh` then `scripts/bootstrap.sh`. The native
`.claude/settings.json` `SessionStart` hook does the same. That symmetry is the
contract. An agent gets the same tools, dependencies, skills, and memory
whether it runs in CI or a local session. **A step that must hold in both
places belongs in one of these two scripts, never in the CI-only composite
action.** Native sessions never invoke that action.

`scripts/bootstrap.sh` is mandatory. The CI gemba-bootstrap action invokes it by path
with no fallback. A repo without it fails every agent and check workflow at
that step with `exit 127`. Keep it to environment setup. Other tasks are
separate concerns: keep the branch current with the default branch, provision
services, and seed data. Whoever needs each task owns it. Do not fold these
tasks into this entrypoint.

## Root Files

`CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md` orient every contributor. The
[Jidoka standard](JIDOKA.md) (L1/L2) defines their universal properties, the
JTBD entry structure, and the convention for `<job>` tags. This
standard adds only the monorepo-specific placement: how jobs distribute across
the directory shape (below), and the tooling split `CLAUDE.md` spells out
(§ Internal Contributors vs External Users).

## Jobs Across the Directory Shape

Jobs distribute across the codebase so they live near the code that serves
them. This repo's shape gives that placement to the Jidoka job conventions:

- **Big Hires** — the adoption decision per persona-outcome pair. They live in
  [JTBD.md](JTBD.md) with the full entry structure from the
  [Jidoka standard](JIDOKA.md).
- **Little Hires** — narrower, repeated daily jobs. They live in the
  `products/`, `services/`, and `libraries/` READMEs, in design docs, or near
  the code.

Each top-level directory's `README.md` captures the jobs that directory exists
to serve. Wrap every job, Big or Little, in a `<job>` tag. Find every job with
`rg '<job '`, per [JIDOKA.md](JIDOKA.md).

## Internal Contributors vs External Users

The monorepo is open source but exists primarily for internal contributors.
External users consume products as published artifacts and never read the
source. Two consequences shape the structure:

- Internal-only conventions (build tools, codegen, internal scripts) live in
  the monorepo and don't appear in published artifacts.
- Documentation for external users lives where they can reach it
  (published packages, hosted sites). It does not live in internal-only files.

`CLAUDE.md` is the canonical place to spell out the specific tooling split:
package manager, task runner, codegen.

## Ambient Dependencies and Collaborator Injection

Source modules under `libraries/*/src`, `products/*/src`, and `services/*/src`
do not reach for ambient node-runtime dependencies. They receive their
collaborators explicitly. A reader then learns a module's dependency surface
from its constructor signature. A test can also substitute fakes. The test does
not touch the real filesystem. It does not spawn subprocesses. It does not
sleep real wall-clock time.

### The four collaborator surfaces

One `runtime` bag holds `{ fs, fsSync, proc, clock, subprocess, finder }`. It
flows from each binary's entry point through libcli's `ctx.deps` slot into
every constructor and factory:

- **`clock`** — `now()` / `sleep(ms)` instead of `Date.now()`, `new Date()`,
  or `setTimeout(...)`.
- **`fs` / `fsSync`** — the async or sync filesystem surface a module actually
  uses. The module does not import `node:fs` / `node:fs/promises`. A module
  takes one surface, never both.
- **`proc`** — `cwd()`, `env`, `argv`, `stdin`, `stdout`/`stderr`, and `exit`
  instead of the global `process`. Handlers return a typed result. The bin
  shim translates that result to an exit code. `process.exit` survives only in
  `bin/*.js`.
- **`subprocess`** — `run`/`spawn`, or a typed wrapper such as `GitClient` /
  `GhClient`. The module does not import `node:child_process`.

`libutil` owns the bag (`createDefaultRuntime`), the `Finder` refactor, and the
typed `GitClient` / `GhClient`. The canonical fakes live in libmock. See
[libmock § Collaborators](libraries/libmock/README.md#collaborators). Every
test imports the fakes from there.

### Enforcement

All of these run as declarative rule modules under
`.jidoka/invariants/`. `jidoka invariants` executes them. Run it with
`bun run invariants`.

- `ambient-deps.rules.mjs` flags any new src file that imports
  `node:fs` / `node:child_process`, calls `Date.now` / `new Date` /
  `setTimeout`, or reads `process.*` outside the allow-listed factories, bin
  shims, and libcli internals. A monotone deny-list grandfathers files that are
  not yet migrated. The deny-list shrinks as each unit converts.
- `subprocess-in-tests.rules.mjs` flags tests that spawn `node` or a
  project bin. It exempts the one `*.integration.test.js` smoke test per
  binary.
- `libmock.rules.mjs` flags inline reimplementations of the canonical
  fakes.
- `collaborator-construction.rules.mjs` flags any module under
  `libraries/`, `products/`, or `services/` that constructs a leaf
  collaborator itself. The leaf collaborators are `new Finder(...)`,
  `createDefaultProc(...)`, `createDefaultClock(...)`, and
  `createDefaultSubprocess(...)`. The module takes the collaborator off the
  injected `runtime` bag instead. Only `libutil` constructs them.
  `createDefaultRuntime(...)` (the composition-root factory) is exempt. There
  is no deny-list. The tree is clean, so any hit is a real regression.

These four enforce this policy. They are a subset of the invariant checks
chained under `bun run invariants`. The `invariants` script in the root
`package.json` is the authoritative list. Each check states its own rule
in its header comment. Authoring-facing rules (such as the
temporal-reference invariant) live in
[CONTRIBUTING.md § Invariants](CONTRIBUTING.md#invariants).
