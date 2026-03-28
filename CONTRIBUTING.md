# Contributing

## Getting Started

```sh
npm install
make quickstart
make install-hooks
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run `npm run check` (format, lint, test, validate)
4. Run `make audit` (npm audit + gitleaks secret scanning)
5. Commit and push

See `CLAUDE.md` for detailed architecture, style rules, and conventions.

## Security Workflows

- **Pre-commit hooks** — `make install-hooks` installs a gitleaks hook that
  scans staged changes for secrets before every commit.
- **ESLint security rules** — `eslint-plugin-security` is enabled in
  `eslint.config.js`. Do not disable security rules without justification.
- **npm audit** — `npm audit --audit-level=high` runs in CI and gates publish
  workflows.
- **CI secret scanning** — Gitleaks runs on every push and pull request via the
  `audit` job in `check.yml`.

## Before Submitting a PR

- [ ] `npm run check` passes (format, lint, test, validate)
- [ ] `make audit` passes (npm audit + secret scanning)
- [ ] No secrets or credentials in commits
- [ ] Dependencies: use existing packages (e.g. `yaml` not `js-yaml`), align
      version ranges with existing usage

## Dependency Policy

- Minimize external dependencies — check if an existing package or Node.js
  built-in can serve the same purpose before adding a new one (e.g. use `yaml`
  not `js-yaml`)
- Consolidate packages serving the same purpose (one YAML parser, one markdown
  renderer)
- Align version ranges for the same package across all workspaces
- Run `npm audit --audit-level=high` after adding or updating dependencies

## Reporting Security Issues

See [SECURITY.md](SECURITY.md).
