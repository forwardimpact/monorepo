# Contributing

## Getting Started

    bun install
    just quickstart

`ANTHROPIC_API_KEY` is already set; `libconfig` reads it automatically.

## Core Rules

**READ-DO**: read each item, then do it. **DO-CONFIRM**: do from memory, then
confirm (Gawande, _Checklist Manifesto_ Ch. 6).

### Invariants

Architectural non-negotiables — the shape of the codebase.

- **OO+DI everywhere** — Classes accept collaborators via constructors. Factory
  functions (`createXxx`) wire implementations; composition roots (CLI `bin/`
  entry points) wire instances; tests inject mocks directly. No module-level
  singletons or inline dependency creation. Exempt — pure stateless functions
  need no DI: libskill, libui (functional DOM), libsecret (crypto), libtype
  (generated protobuf).
- **No frontend frameworks** — Vanilla JS, ESM modules only, no CommonJS.
- **FIT upstream of Kata** — FIT skills and docs (`fit-*`, `websites/fit/`,
  shared `libraries/`) must not reference the Kata Agent Team. Kata may
  reference FIT; the dependency points one way.
- **Explain WHY, not WHEN** — Comments, logs, and durable docs state the present
  contract: no spec/design/plan numbers, issue/PR references, or
  experiment/obstacle labels. Provenance lives in PR bodies and git history.
  `specs/`, `wiki/`, `benchmarks/`, `generated/` are exempt; rewrite, don't
  port, their content. Enforced by `bun run invariants`.

### READ-DO

Entry gate — read every item before starting.

<read_do_checklist goal="Internalize constraints before writing code">

- [ ] **Understand the task.** What is it asking? Which files will I
      touch, and which will I not?
- [ ] **Smallest plan.** No unrequested features, abstractions, or refactors.
- [ ] **Read the code** I'm about to change before writing.
- [ ] **Search shared libraries first.** Before writing any generic helper, scan
      [libraries/README.md](libraries/README.md). Use a library if one covers
      it; otherwise note that in the commit or plan.
- [ ] **Reuse libmock; inject collaborators.** Before writing a mock or fixture,
      check `libraries/libmock/src/index.js` and reuse it. New src takes
      injected `fs`/`proc`/`clock`/`subprocess`, not ambient globals — see
      [MONOREPO.md § Ambient Dependencies](MONOREPO.md#ambient-dependencies-and-collaborator-injection).
- [ ] **Simple over easy.** Reduce complexity, don't relocate it. Three similar
      lines beat a premature abstraction. Inline single-use helpers; hardcode
      single-consumer configuration.
- [ ] **No defensive code.** Trust the architecture — let errors surface. No
      try/catch "just to be safe," no optional chaining on data that isn't
      optional.
- [ ] **Clean breaks.** Delete old code as you write new — in one commit. No
      shims, aliases, fallbacks, or flags for the old path; update every call
      site and remove the old interface.

</read_do_checklist>

### DO-CONFIRM

Exit gate — verify every item before committing.

<do_confirm_checklist goal="Verify quality and publish before finishing">

- [ ] `bun run check` passes — format, lint, jsdoc, invariants, context.
- [ ] `bun run test` passes — new logic has tests.
- [ ] No new inline mock/fixture helpers that libmock already provides.
      Touched test files import from `@forwardimpact/libmock` instead of
      redefining `createMock*`, `make*`, or `stubQueries`.
- [ ] My diff only contains changes the task required — no unrequested
      refactors or scope creep.
- [ ] Commit format: `type(scope): subject` (see § Git Conventions).
- [ ] If the run produced commits: branch pushed with `git push -u origin` and
      PR URL captured in output. Exception: release engineer's direct-to-`main`
      CI fixes.
- [ ] Outputs routed per `coordination-protocol.md`; wiki writes per
      `memory-protocol.md` — prefer `fit-wiki` subcommands over hand-edits.
      None of § Common mis-routings apply.

</do_confirm_checklist>

## Structure

### Monorepo layout

    .claude/       # agents and skills, edited via `bunx fit-selfedit`
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
    kata/

<!-- /enum -->

Git tracks `*.example.*` templates in `config/`; live files are gitignored.

### Per-package layout

Every package follows the same on-disk shape: source under `src/`, no `.js`
or `.ts` files at the package root.

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
Published `exports` point at `src/`; consumers import via subpath aliases. No
build step or root-level proxy file.

### Services — the one exception

Services keep `index.js` and `server.js` at the package root (loaded by fixed
path from `config/config.example.json`), plus `proto/`, `src/`, `test/`,
`package.json`. No `bin/`, no `src/index.js`.

### `.claude/` — agent configuration

`Edit` and `Write` are denied on `.claude/**`. Use
[`bunx fit-selfedit`](.claude/agents/x-self-improvement.md) instead.

## Pull Request Workflow

All changes go through pull requests — never push directly to `main`. Commit,
push, and open a PR before finishing; on an ephemeral runner the PR URL is the
only valid "done" signal.

**Exception:** the release engineer may push trivial CI fixes (format, lint,
lockfile drift) that `bun run check:fix` resolves directly to `main`. See
[release-engineer.md](.claude/agents/release-engineer.md).

## Git Conventions

Format: `type(scope): subject`

- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `spec`
- **Scope**: package name (`map`, `libui`, `pathway`), or `security` for specs
- **Breaking**: add `!` after scope

`spec` = new specification documents in `specs/`.

### Releasing

Tag prefix matches the directory: `libraries/libfoo` → `libfoo@v0.1.5`,
`services/graph` → `svcgraph@v0.1.60`.

Pre-1.0 packages bump patch for any change. Post-1.0: semver (breaking=major,
feat=minor, fix/refactor=patch). The release engineer handles bumps, tags, and
publishing — see [kata-release-cut](.claude/skills/kata-release-cut).

Tags go only on commits already on `main`. PRs land by squash-merge, so a
reviewed branch's commits never reach `main` — its version bump arrives as one
new squash commit. Merge that first, then tag the resulting `main` commit;
never tag a feature-branch SHA, or the tag strands on a commit absent from
`main` and the publish pipeline builds orphaned code. The `Release: Tag`
workflow enforces this: it refuses any SHA not reachable from `main`.

**Composite actions** release on a separate tag space: append-only `v1.0.x`
tags on the sibling repos, with `v1` a moving major alias for external
consumers. A push to `main` mirrors each action to its sibling by subtree
split; the publish path, SHA-pin policy, and `v1`-move constraints live in
[`.github/CLAUDE.md`](.github/CLAUDE.md).

Some changes span more than one tag. A new or renamed binary, for example, is
reachable only after every tier that carries it ships. Release producer before
consumer, bottom-up, confirming each tier resolves before tagging the next:

1. the compiled binary or bundle;
2. the `fit-install.sh` installer that fetches it, co-versioned with the bundle;
3. the sibling repos' actions and workflows that run it;
4. this repo's pins to those siblings.

A consumer pinned ahead of its producer fails closed: a missing binary has no
`bunx`/`npx` fallback.

## Quality Commands

    bun run check                 # All quality gates (run before every commit)
    bun run check:fix             # Auto-fix format and lint issues
    bun run test                  # Unit tests, bun runner (local/PR loop)
    bun run test:gate             # The blocking gate (see Test-runner strategy)
    bun run test:e2e              # Playwright E2E tests
    bunx fit-map validate         # Validate data files
    bunx fit-map validate --shacl # Validate with SHACL syntax check

### Test-runner strategy

Settled per surface. `node --test` (`bun run test:gate`) is the blocking gate:
reference-correct, since `describe`-inside-`test` is valid where bun throws
([bun#5090](https://github.com/oven-sh/bun/issues/5090)). `bun test`
(`bun run test`) is the fast, non-required loop. Never import `bun:test` — node
cannot resolve `bun:`; `scripts/check-bun-test-imports.mjs` reddens on any.
Import from `node:test` and `@forwardimpact/libmock/expect`.

## Security

Security policies apply to all contributors — human and agent.

- **Vulnerability audit** — `npm audit --audit-level=high` runs in CI and
  gates publish workflows.
- **CI secret scanning** — Gitleaks runs on every push and PR — see
  [check-security.yml](.github/workflows/check-security.yml).
- **GitHub Actions** — All third-party actions, including `forwardimpact/*`
  siblings, are SHA-pinned on `uses:` lines. Use `Dependabot`; never
  change a pin to a tag.
- **Vendored trace fixtures** — vendor byte-exact only after a security
  reviewer reads the result prose in full; sensitive prose forces documented
  redaction or synthesis. Widening fixture exclusions in
  `.coaligned/invariants/` or any security scan requires security review.
- **Reporting** — See [SECURITY.md](SECURITY.md). Contact
  `hi.security@senzilla.io`.

## Dependency Policy

- **Prefer built-ins.** Use Node built-ins over npm (`fetch` not `undici`);
  consolidate overlapping packages.
- **Align versions.** Declare the same range across workspaces. Bun hoists
  matched versions; don't drop a runtime dep just because it deduplicates.
- **No nested duplicates.** The same package at two major versions is
  forbidden. Before a major bump, run `bun pm ls` and inspect `bun.lock` for
  `invalid` markers; close the PR if dependents lack compatible ranges.
- **Audit after changes.** Run `just audit-vulnerabilities` after adding or
  updating deps.
- **No `jsdom`** (its `css-tree` breaks `bun --compile`) — use `linkedom` for
  parsing, `happy-dom` for browser-env tests.

### Classification

Every dependency belongs in one category. Apply in order — first match wins.

- **Always needed** — imported synchronously at load time → `dependencies`
- **Backend-specific** — selected by env var, alternatives exist →
  `optionalDependencies` + dynamic `import()`
- **Feature-gated** — user opts in, core works without it →
  `optionalDependencies` + dynamic `import()`
- **Build-tool** — consumers already have it → `peerDependencies`
- **Build-time only** — `bin/` scripts or codegen only → `devDependencies`

### Optional Dependency Pattern

Backend-specific and feature-gated deps use dynamic `import()` at the call site
(never at module top), wrapped in `try/catch` that throws naming the feature,
package, and install command. Never silently fall back.
