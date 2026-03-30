# Contributing

## Getting Started

```sh
npm install
make quickstart
make install-hooks
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
- **Testing**: Node.js test runner (`node --test`), fixtures mirror YAML

## Pull Request Workflow

All changes go through pull requests — never push directly to `main`.

1. Create a branch from `main`
2. Make your changes
3. Auto-fix formatting and lint: `npm run check:fix`
4. Verify all checks pass: `npm run check`
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

**Tag prefix mapping** — tag prefix matches the directory name, not the npm
scope:

| Directory          | Tag prefix | Example tag         |
| ------------------ | ---------- | ------------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`     |
| `products/pathway` | `pathway`  | `pathway@v0.25.0`   |
| `services/agent`   | `svcagent` | `svcagent@v0.1.110` |

**Version rules** — pre-1.0 packages (`0.x.y`) bump patch for any change.
Post-1.0 packages use semver: breaking=major, feat=minor, fix/refactor=patch.

**Finding changed packages:**

```sh
# For each package, compare latest tag to HEAD:
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
git log "${latest}..HEAD" --oneline -- "${directory}"
```

**Release steps:**

1. Commit all pending code changes first (version bumps go in a separate commit)
2. Bump `version` in each changed `package.json`
3. Update cross-workspace deps when bumping a major version (e.g. pathway's dep
   on libskill: `^3.0.0` → `^4.0.0`)
4. Run `npm install --package-lock-only` to sync `package-lock.json`
5. Run `npm run check:fix` to ensure formatting and lint pass
6. Commit: `chore({pkg}): bump to {version}` (or batch:
   `chore: bump versions for release`)
7. Tag at the final commit: `git tag {pkg}@v{version}`
8. Push commits, then push each tag individually (not `--tags`)
9. Verify each workflow: `gh run list --limit <n>`

## Quality Commands

```sh
npm run check                 # Format, lint, test, validate (run before pushing)
npm run check:fix             # Auto-fix format and lint issues
npm run format                # Check Prettier formatting
npm run format:fix            # Auto-fix Prettier formatting
npm run lint                  # Check ESLint linting
npm run lint:fix              # Auto-fix ESLint issues
npm run test                  # Unit tests (node --test)
npm run test:e2e              # Playwright E2E tests (requires generated data)
npx fit-map validate          # Validate data files
npx fit-map validate --shacl  # Validate with SHACL syntax check
```

## Security

Security policies apply to all contributors — human and agent.

- **Pre-commit hooks** — `make install-hooks` installs a hook that auto-formats
  staged files and scans for secrets via gitleaks.
- **ESLint security rules** — `eslint-plugin-security` is enabled in
  `eslint.config.js`. Do not disable security rules without justification.
- **npm audit** — `npm audit --audit-level=high` runs in CI and gates publish
  workflows.
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
  version bumps — run `npm ls <package>` and confirm no `invalid` markers
- Run `npm audit --audit-level=high` after adding or updating dependencies

## Policy Ownership

Each policy area has one canonical location. Other files reference it instead of
restating the rules. Update the canonical location only.

| Policy area                          | Canonical location                   |
| ------------------------------------ | ------------------------------------ |
| Core rules & architecture            | CLAUDE.md                            |
| Development workflow & practices     | CONTRIBUTING.md                      |
| Environment, services, tasks         | `website/docs/internals/operations/` |
| Security workflows (hooks, scanning) | CONTRIBUTING.md § Security           |
| Dependency hygiene                   | CONTRIBUTING.md § Dependency Policy  |
| GitHub Actions SHA pinning           | CONTRIBUTING.md § Security           |
| Supply chain & app security          | `.claude/skills/security-audit`      |
| Dependabot triage process            | `.claude/skills/dependabot-triage`   |
