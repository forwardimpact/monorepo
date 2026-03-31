# Contributing

## Getting Started

```sh
bun install
make quickstart
```

## Core Rules

1. **Clean breaks** — Fully replace, never leave old and new coexisting. Delete
   old code, update all call sites, remove unused imports in one commit.
2. **No backward compatibility** — No shims, aliases, or feature flags for the
   old path. If there are no consumers yet, remove the old interface entirely —
   don't build bridges to code that doesn't exist.
3. **No defensive code** — Trust the architecture, let errors surface. No
   optional chaining for non-optional data, no try-catch "just to be safe."
4. **Simple over easy** — Reduce complexity, don't relocate it. Prefer explicit
   over implicit, direct solutions over clever abstractions, fewer layers.
5. **OO+DI everywhere** — Constructor-injected dependencies. No module-level
   singletons, no inline dependency creation. Factory functions (`createXxx`)
   wire real implementations. Tests inject mocks directly via constructors. See
   CLAUDE.md § OO+DI Architecture for patterns and examples.
6. **JSDoc types** — All public functions (`@param`, `@returns`)
7. **Test coverage** — New logic requires tests
8. **No frameworks** — Vanilla JS only, ESM modules only
9. **Co-located files** — All entities have `human:` and `agent:` sections

## Code Style

- **ESM only**, no CommonJS. JSDoc on all public functions.
- **Naming**: files `kebab-case`, functions `camelCase`, constants
  `UPPER_SNAKE_CASE`, YAML IDs `snake_case`
- **Testing**: Node.js test runner (`bun run node --test`), fixtures mirror YAML

## Pull Request Workflow

All changes go through pull requests — never push directly to `main`.

**Exception:** The release engineer agent may push trivial CI fixes (formatting,
lint, lock file drift) directly to `main` to unblock releases. This is limited
to mechanical fixes that `bun run check:fix` can resolve — never logic, tests,
or feature changes. See `.claude/agents/release-engineer.md` for the full scope
constraints.

1. Create a branch from `main`
2. Make your changes
3. Auto-fix formatting and lint: `bun run check:fix` (applies to all file types)
4. Verify all checks pass: `bun run check` (required for code **and** docs)
5. Run security audit: `make audit`
6. Commit: `git commit -m "type(scope): subject"`
7. Push and open a pull request against `main`

**Always commit your work before finishing a task.**

The pre-commit hook auto-formats staged files and scans for secrets. If the hook
reformats files, it re-stages them automatically — just re-run your commit.

## Git Conventions

Format: `type(scope): subject`

- **Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`,
  `perf`, `spec`
- **Scope**: package name (`map`, `libskill`, `libui`, `pathway`, `basecamp`),
  or domain area (`security`) for specs
- **Breaking**: add `!` after scope

`spec` is for new specification documents in `specs/`. Use when proposing a
change that requires design review before implementation (e.g.
`spec(security): Supabase edge function hardening`).

### Releasing

**Tag prefix mapping** — tag prefix matches the directory name, not the package
scope:

| Directory          | Tag prefix | Example tag         |
| ------------------ | ---------- | ------------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`     |
| `products/pathway` | `pathway`  | `pathway@v0.25.0`   |
| `services/agent`   | `svcagent` | `svcagent@v0.1.110` |

**Version rules** — pre-1.0 packages (`0.x.y`) bump patch for any change.
Post-1.0 packages use semver: breaking=major, feat=minor, fix/refactor=patch.

The release engineer agent handles version bumps, tagging, and publishing. See
`.claude/skills/release-review` for the full release procedure.

## Quality Commands

```sh
bun run check                 # Format, lint, test, validate — ALL file types (run before every commit)
bun run check:fix             # Auto-fix format and lint issues
bun run format                # Check Prettier formatting
bun run format:fix            # Auto-fix Prettier formatting
bun run lint                  # Check ESLint linting
bun run lint:fix              # Auto-fix ESLint issues
bun run test                  # Unit tests (bun run node --test)
bun run test:e2e              # Playwright E2E tests (requires generated data)
bunx fit-map validate         # Validate data files
bunx fit-map validate --shacl # Validate with SHACL syntax check
```

## Security

Security policies apply to all contributors — human and agent.

- **ESLint security rules** — `eslint-plugin-security` is enabled in
  `eslint.config.js`. Do not disable security rules without justification.
- **Vulnerability audit** — `npm audit --audit-level=high` runs in CI (via
  temporary lockfile generation) and gates publish workflows.
- **CI secret scanning** — Gitleaks runs on every push and pull request via the
  `audit` job in `check-security.yml`.
- **GitHub Actions** — All third-party actions are pinned to SHA hashes. Use
  `Dependabot` for updates. Never change a pin to a tag.
- **Reporting** — See `SECURITY.md`. Contact `hi.security@senzilla.io`.

## Dependency Policy

- Minimize external dependencies — check if an existing package or Node.js
  built-in can serve the same purpose before adding a new one (e.g. use `yaml`
  not `js-yaml`)
- Consolidate packages serving the same purpose (one YAML parser, one markdown
  renderer)
- Align version ranges for the same package across all workspaces
- Verify peer and transitive dependency compatibility before merging major
  version bumps — run `bun pm ls` and confirm no `invalid` markers. Also inspect
  `bun.lock` for **nested duplicates** (the same package resolved at two
  different major versions, e.g. a top-level `protobufjs@8` alongside
  `@grpc/proto-loader/protobufjs@7`). A major bump that forces co-installed
  packages onto a separate version violates this policy — close the PR until all
  dependents release compatible ranges
- Run `make audit-vulnerabilities` after adding or updating dependencies
  (generates a temporary lockfile for `npm audit --audit-level=high`)
