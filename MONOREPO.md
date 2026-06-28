# Monorepo Structure Standard

> "A system is a network of interdependent components that work together to try
> to accomplish the aim of the system. A system must have an aim. Without an
> aim, there is no system."
>
> — W. Edwards Deming, _The New Economics_

This standard defines the structure of a repository shared by humans and coding
agents — the top-level directories, the root files, and the way jobs are
captured and discovered. Everything else builds on this shape.

The Jobs To Be Done conventions described below supply that aim. Each job names
the progress a persona seeks; each directory and file traces back to a job it
serves. Structure without aim is arbitrary — aim without structure is invisible.

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

## Root Files

Three root files orient every contributor. Each has one job; none restates
another.

### Project Identity (CLAUDE.md)

Orients every contributor on every run. Answers _what_ the project is, _who_ it
serves, and _where_ to find things.

#### Properties of a Good Project Identity

1. **Orients, doesn't govern.** Answers what, who, where. Rules and policies
   belong in `CONTRIBUTING.md`.
2. **Navigation hub.** Points to everything, restates nothing. A link is
   cheaper than a duplicate.
3. **Stable.** Changes rarely — frequent churn means content belongs elsewhere.
4. **Budget-conscious.** Every line loads on every run. If a section is only
   relevant to one workflow, push it deeper.
5. **Surfaces tagging conventions.** Briefly explains how jobs are tagged and
   how to discover them with `rg`.

### Contribution Standards (CONTRIBUTING.md)

Read on demand. Governs _how_ contributors work — invariants, technical rules,
git workflow, security policies.

#### Properties of Good Contribution Standards

1. **Rules, not procedures.** What to do and what not to do — step-by-step
   sequencing belongs closer to the work.
2. **Universal scope.** Every item applies to every contribution. Workflow-
   specific rules belong with the workflow that owns them.
3. **Verifiable.** Each rule should be checkable — by a human, a script, or a
   list. Aspirational guidance that can't be verified drifts.

### Jobs To Be Done (JTBD.md)

The canonical catalogue of "Big Hires" — one entry per persona-outcome pair.
Captures _what progress each persona seeks_ from the products in this repo.

#### Entry Structure

Each entry follows a fixed structure. The first five elements are required for
all entries. _Forces_ and _Fired When_ are required for **products** but
omitted for **services** and **libraries**.

- **User** — persona hiring the product (`##` heading).
- **Goal** — high-level progress sought (`###` heading).
- **Trigger** — a specific moment that creates the job, not a role
  description.
- **Big Hire** — "{progress}." — the adoption decision; why this gets hired
  over the alternatives. Rendered as "Help me {progress}." with a product
  arrow.
- **Little Hire** — "{progress}." — the repeated daily use; what brings the
  user back each time. Rendered the same way.
- **Competes With** — what currently gets hired instead; semicolon-delimited.
- **Forces** — Four forces: _Push_ (status quo pain), _Pull_ (desired future
  state, not features), _Habit_ (current behavior resisting change), _Anxiety_
  (fear blocking adoption).
- **Fired When** — Conditions under which the product gets abandoned; include
  at least one environmental shift beyond product failure.

#### Properties of Good JTBD Entries

Drawing from Christensen and Moesta's methodology:

1. **Progress, not features.** "Help me make staffing decisions I can defend"
   is a job. "Help me run what-if staffing scenarios" is a feature request
   wearing job syntax. If removing the product arrow makes the statement
   meaningless, the job is too solution-shaped.
2. **Trigger is a moment, not a role.** "Starting the third project that
   needs the same plumbing" is a moment. "Building systems consumed by both
   humans and agents" is a role description. A good trigger answers "what
   just happened?"
3. **Competing hires include nonconsumption.** Every Competes With list must
   include a "hire nothing" option. Nonconsumption is usually the real
   incumbent.
4. **Pull describes a desired future, not a feature list.** "Confidence that
   a staffing change strengthens the team" is a future state. "System-level
   team views and what-if scenarios" is a feature list.
5. **Forces are asymmetric.** One force often dominates. If all four feel
   equally weighted, the analysis was filled in from a template rather than
   reconstructed from a decision story.
6. **Fired When includes the world, not just the product.** Products get
   abandoned when the environment shifts — a reorg, a budget cut, a tool ban.
7. **Field-validated, not desk-authored.** JTBD entries are hypotheses until
   confirmed by customer struggle stories. An entry that surprises the product
   team is more likely correct than one that confirms existing assumptions.

## Jobs: Big Hires and Little Hires

Jobs are distributed across the codebase so they live near the code that
serves them:

- **Big Hires** — the adoption decision per persona-outcome pair. Live in
  [JTBD.md](JTBD.md). Use the full entry structure above.
- **Little Hires** — narrower, repeated daily jobs. Live wherever they fit
  best: product, service, and library READMEs; design docs; nearby code.

### `<job>` Tagging Convention

Wrap every job — Big or Little — in a semantic tag so it can be discovered
without knowing where it lives:

```markdown
<job user="Engineering Leaders" goal="Staff Teams to Succeed">

**Trigger:** A post-mortem surfaces the same skill gap that caused the last
incident.

**Big Hire:** Help me make staffing decisions I can defend with evidence, not
intuition. → **Summit**

**Little Hire:** Help me spot capability gaps before someone gets set up to
fail. → **Summit**

</job>
```

- Tag attributes (`user`, `goal`) make search results self-describing — each
  match shows purpose without opening the file.
- Keep the full opening tag on one line within 74 characters so `rg` output
  stays coherent.

Discover jobs from anywhere in the repo:

```sh
rg '<job '  # all jobs
```

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
`.coaligned/invariants/`, executed by `coaligned invariants` via
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
