# Contributing

## Getting Started

    bun install
    just quickstart

`ANTHROPIC_API_KEY` is already set. `libconfig` reads it automatically.

## Invariants

Architectural non-negotiables define the shape of the codebase.

- **OO+DI everywhere** — Classes take collaborators through constructors.
  Factories (`createXxx`) wire implementations. Composition roots (CLI `bin/`)
  wire instances. Tests inject mocks. Never use module-level singletons or
  create dependencies inline. Exempt (pure stateless): libskill, libui
  (functional DOM), libsecret (crypto), libtype (generated protobuf).
- **No frontend frameworks** — Vanilla JS, ESM modules only, no CommonJS.
- **FIT upstream of Kata** — FIT skills and docs (`fit-*`, `websites/fit/`,
  shared `libraries/`) must not reference the Kata Agent Team. Kata may
  reference FIT. The dependency is one-way.
- **Explain WHY. Never WHEN.** — Comments, logs, and durable docs state the
  present contract: no spec/design/plan numbers, issue/PR references, or
  experiment/obstacle labels. Provenance lives in PR bodies and git history.
  `specs/`, `wiki/`, `benchmarks/`, `generated/` are exempt. Rewrite them. Never
  port them. `bun run invariants` enforces this.

The mechanically checkable subset lives in `.jidoka/invariants/*.rules.mjs`.
`bun run invariants` runs it inside `bun run check`. Add rules with the
[jidoka-invariant](.claude/skills/jidoka-invariant/SKILL.md) skill.
[JIDOKA.md](JIDOKA.md) defines the instruction layers these checks protect.

## Checklists

<read_do_checklist goal="Internalize constraints before writing code">

- [ ] **Understand the task.** State what it asks. List the files I will and
      will not touch.
- [ ] **Smallest plan.** No unrequested features, abstractions, or refactors.
- [ ] **Read the code** I'm about to change before I write.
- [ ] **Search shared libraries first.** Scan
      [libraries/README.md](libraries/README.md) before I write a generic
      helper. Use one if it covers the need. Otherwise note that in the commit
      or plan.
- [ ] **Reuse libmock. Inject collaborators.** Reuse
      `libraries/libmock/src/index.js` before I write a mock or fixture. New
      src takes injected `fs`/`proc`/`clock`/`subprocess`. It takes no ambient
      globals. See
      [MONOREPO.md § Ambient Dependencies](MONOREPO.md#ambient-dependencies-and-collaborator-injection).
- [ ] **Simple over easy.** Reduce complexity. Never relocate it. Three similar
      lines beat a premature abstraction. Inline single-use helpers.
      Hardcode single-consumer configuration.
- [ ] **No defensive code.** Trust the architecture. Let errors surface. Add no
      try/catch "just to be safe," and no optional chaining on non-optional
      data.
- [ ] **Clean breaks.** Delete old code as I write new, in one commit. Add no
      shims, aliases, fallbacks, or flags for the old path. Update every call
      site. Remove the old interface.

</read_do_checklist>

<do_confirm_checklist goal="Verify quality and publish before finishing">

- [ ] `bun run check` passes: format, lint, jsdoc, invariants, context.
- [ ] `bun run test` passes. New logic has tests.
- [ ] No new inline mock/fixture helpers libmock already provides. Touched
      test files import from `@forwardimpact/libmock` and never redefine
      `createMock*`, `make*`, or `stubQueries`.
- [ ] My diff contains only changes the task required. No scope creep.
- [ ] Commit format: `type(scope): subject` (see § Git Conventions).
- [ ] If the run produced commits, I pushed the branch with
      `git push -u origin` and captured the PR URL in output. Exception:
      release engineer's direct-to-`main` CI fixes.
- [ ] I routed outputs per `coordination-protocol.md`, wiki writes per
      `memory-protocol.md`. Prefer `gemba-wiki` subcommands over hand-edits.
      None of § Common mis-routings apply.

</do_confirm_checklist>

## Structure

### Monorepo layout

    .claude/       # agents and skills, edited via `bunx gemba-selfedit`
    products/      # one directory per product — see the products list below
    libraries/
      lib*/        # shared libraries
    services/
      <name>/      # one per service — see config/config.json
    config/
      config.json  # service definitions
    data/
      synthetic/   # synthetic data DSL and artifacts
    specs/
      {feature}/   # specifications and plans
    wiki/          # GitHub wiki — shared agent memory
    design/        # design language and brand implementations
    websites/      # public sites — fit/ → forwardimpact.team, kata/ → kata.team

The `products/` directory holds one directory per product:

<!-- enum:products-tree:list -->

    map/
    pathway/
    guide/
    landmark/
    summit/
    outpost/
    gear/
    gemba/
    jidoka/
    kata/

<!-- /enum -->

Git tracks `*.example.*` templates in `config/`. Git ignores live files.

### Per-package layout

Every package shares one on-disk shape: source under `src/`, no `.js`/`.ts` at
the package root.

    <package>/
      package.json     Required
      justfile         Per-package task runner (optional)
      src/             All source (index.js + domain subdirs)
      bin/             Thin CLI entry points, one per binary
      config/          Checked-in configuration (optional)
      macos/           macOS app bundle (optional)
      pkg/             Packaging artifacts, non-source (optional)
      proto/           Protobuf source (optional)
      schema/          Published schemas (optional)
      starter/         Starter data installed to a consumer (optional)
      supabase/        Supabase edge project (optional)
      templates/       Runtime template files (optional)
      test/            Test files

Subcommand handlers live under `src/commands/`, helpers under `src/lib/`.
Published `exports` point at `src/`. Consumers import through subpath aliases.
No build step or root-level proxy file.

### Services — the one exception

Services keep `index.js` and `server.js` at the package root (loaded by fixed
path from `config/config.example.json`), plus `proto/`, `src/`, `test/`,
`package.json`. No `bin/`, no `src/index.js`.

### `.claude/` — agent configuration

Settings deny `Edit` and `Write` on `.claude/**`. Use
[`bunx gemba-selfedit`](.claude/agents/x-self-improvement.md) instead.

## Pull Request Workflow

All changes go through pull requests. Never push directly to `main`. Commit and
push. Open a PR before you finish. On an ephemeral runner the PR URL is the only
valid "done" signal.

**Exception:** the release engineer may push trivial CI fixes (format, lint,
lockfile drift) that `bun run check:fix` resolves directly to `main`. See
[release-engineer.md](.claude/agents/release-engineer.md).

## Git Conventions

Format: `type(scope): subject`

- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `spec`
- **Scope**: package name (`map`, `libui`, `pathway`), or `security` for specs
- **Breaking**: add `!` after scope

`spec` = new specification documents in `specs/`.

## Releasing

Tag prefix matches the directory: `libraries/libfoo` → `libfoo@v0.1.5`,
`services/graph` → `svcgraph@v0.1.60`.

Pre-1.0 packages bump patch for any change. Post-1.0: semver (breaking=major,
feat=minor, fix/refactor=patch). The release engineer bumps versions, tags, and
publishes. See [kata-release-cut](.claude/skills/kata-release-cut).

**Create tags with the `Release: Tag` workflow. Never tag with `git push`.**
The release-cut environment cannot push tags. Dispatch
[`release-tag.yml`](.github/workflows/release-tag.yml) with a `tags` list,
optional `repo`, and `sha` (default: the target's default-branch tip). `repo`
takes any org repo the kata App is on, so it tags sibling action repos too.
Through [`release-tagger`](.github/actions/release-tagger/action.yml), the
workflow pushes each tag from CI with an App token instead of `GITHUB_TOKEN`.
So publish pipelines still fire. Tags are append-only. An action release's
`v<major>` alias tracks the latest release. Only default-branch-reachable
commits are taggable. Squash-merge leaves a branch's commits off `main`. Merge
first, then tag the `main` commit.

**Composite actions** use a separate tag space: append-only `v1.0.x` on the
siblings, `v1` an alias for the latest release. Dispatch `Release: Tag` with
`repo: <sibling>` and the `v1.0.x` tag. A push to `main` mirrors each action to
its sibling by subtree split. Publish path and `v1`-move policy live in
[`.github/CLAUDE.md`](.github/CLAUDE.md).

Some changes span tags: a new binary is reachable only after every tier ships.
Release producer before consumer, bottom-up: (1) the compiled binary/bundle;
(2) the co-versioned `fit-install.sh`; (3) the sibling actions; (4) this repo's
pins. A consumer pinned ahead of its producer fails closed, with no
`bunx`/`npx` fallback.

## Quality Commands

    bun run check                 # All quality gates (run before every commit)
    bun run check:fix             # Auto-fix format and lint issues
    bun run test                  # Unit tests, bun runner (local/PR loop)
    bun run test:gate             # The blocking gate (see Testing)
    bun run test:e2e              # Playwright E2E tests
    bunx fit-map validate         # Validate data files
    bunx fit-map validate --shacl # Validate with SHACL syntax check

## Testing

Test behavior. Never test structure guarded elsewhere.

- **Test behavior** — outputs, responses, error paths. Unit-test pure logic.
  Integration-test the wiring.
- **Don't test the shape of declarative artifacts** — Never assert that a
  workflow, action, `SKILL.md`, or generated file holds a given key, step, or
  string. That re-encodes the file as a brittle test that proves nothing ran.
  Enforce structure with an invariant (`.jidoka/invariants/`), or let the
  consumer runtime fail.
- **Don't duplicate an enforcement** — an invariant that gates CI is the test.
  Never re-run its rule over the same tree in a unit test. A test of a complex
  pure helper inside a rule is fine.

Runner strategy. Bun is the default runtime:

- **Gate on `node --test`** (`bun run test:gate`) — the last node surface
  ([bun#5090](https://github.com/oven-sh/bun/issues/5090)).
- **Everything else on `bun test`**, benchmark hidden checks included.
- **Import from `node:test` and `@forwardimpact/libmock/expect`**, never
  `bun:test`. `scripts/check-bun-test-imports.mjs` reddens on any.

## Security

Security policies apply to all contributors, human and agent.

- **Vulnerability audit** — `npm audit --audit-level=high` runs in CI and
  gates publish workflows.
- **CI secret scanning** — Gitleaks runs on every push and PR. See
  [check-security.yml](.github/workflows/check-security.yml).
- **GitHub Actions** — All third-party actions, including `forwardimpact/*`
  siblings, are SHA-pinned on `uses:` lines. Use `Dependabot`. Never
  change a pin to a tag.
- **Vendored trace fixtures** — vendor byte-exact only after a security
  reviewer reads the result prose in full. Sensitive prose forces documented
  redaction or synthesis. To widen fixture exclusions in
  `.jidoka/invariants/` or any security scan, get security review.
- **Vulnerability reports** — See [SECURITY.md](SECURITY.md). Contact
  `hi.security@senzilla.io`.

## Dependency Policy

- **Prefer built-ins.** Use Node built-ins over npm (`fetch` not `undici`).
  Consolidate packages that overlap.
- **Align versions.** Declare the same range across workspaces. Bun hoists
  matched versions. Never drop a runtime dep just because it deduplicates.
- **No nested duplicates.** No package at two major versions. Before a major
  bump, run `bun pm ls` and inspect `bun.lock` for `invalid` markers. Close the
  PR if dependents lack compatible ranges.
- **Audit after changes.** Run `just audit-vulnerabilities` after dep changes.
- **No `jsdom`** (its `css-tree` breaks `bun --compile`). Use `linkedom` to
  parse, and `happy-dom` for browser-env tests.

### Classification

Every dependency belongs in one category. Apply in order. First match wins.

- **Always needed** — imported synchronously at load time → `dependencies`
- **Backend-specific** — selected by env var, alternatives exist →
  `optionalDependencies` + dynamic `import()`
- **Feature-gated** — user opts in, core works without it →
  `optionalDependencies` + dynamic `import()`
- **Build-tool** — consumers already have it → `peerDependencies`
- **Build-time only** — `bin/` scripts or codegen only → `devDependencies`

### Optional Dependency Pattern

Backend-specific and feature-gated deps use dynamic `import()` at the call site,
never at module top. Wrap it in `try/catch` that throws and names the feature,
package, and install command. Never silently fall back.
