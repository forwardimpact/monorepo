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

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run `npm run check` (format, lint, test, validate)
4. Run `make audit` (npm audit + gitleaks secret scanning)
5. Commit and push

## Git Workflow

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`
**Scope**: package name (`map`, `libskill`, `libui`, `pathway`, `basecamp`).
**Breaking**: add `!` after scope.

### Before Committing

1. Review with `git diff`
2. Group related changes into logical, atomic commits
3. Follow the PR checklist below
   - `npm run check:fix` auto-fixes formatting and lint issues
4. Assess version impact (breaking=major, feat=minor, other=patch)
5. Stage and commit: `git commit -m "type(scope): subject"`
6. Push all commits to remote

**Always commit your work before finishing a task.**

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

## Environment Management

Environment is configured via layered `.env` files, loaded by `scripts/env.sh`:

```sh
# Load order (later files override earlier):
.env                      # Base: API credentials, service secrets
.env.{ENV}                # Network: local (localhost) or docker (container DNS)
.env.storage.{STORAGE}    # Storage: local, minio (S3), or supabase
.env.auth.{AUTH}           # Auth: none, gotrue, or supabase
```

Three variables control the environment stack:

| Variable  | Values                       | Default |
| --------- | ---------------------------- | ------- |
| `ENV`     | `local`, `docker`            | `local` |
| `STORAGE` | `local`, `minio`, `supabase` | `local` |
| `AUTH`    | `none`, `gotrue`, `supabase` | `none`  |

All `make` targets automatically load the correct env files. Pass overrides:

```sh
make rc-start                              # local env, local storage, no auth
make rc-start ENV=docker STORAGE=minio     # docker networking, MinIO storage
```

### Environment Setup

```sh
make env-setup     # Reset from examples, generate secrets and storage creds
make env-reset     # Reset .env* and config files from *.example counterparts
make env-secrets   # Generate SERVICE_SECRET, JWT_SECRET, JWT_ANON_KEY
make env-storage   # Generate storage backend credentials
make env-github    # GitHub token utility (LLM_TOKEN, LLM_BASE_URL)
```

`LLM_TOKEN` and `LLM_BASE_URL` are always set in the environment (provided by
the hosting platform or `.env`). Any code using `libconfig` to access LLM
credentials works out of the box.

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- **`init.services`** — Ordered list of services for `fit-rc` to supervise (tei,
  trace, vector, graph, llm, memory, tool, agent, web)
- **`init.log_dir`** / **`init.shutdown_timeout`** — Logging and shutdown
- **`service.*`** — Per-service settings (model, temperature, max_tokens, tool
  filter thresholds, tool endpoints)
- **`evals`** — Evaluation models and judge model

`config/tools.yml` — Tool endpoint definitions (purpose, parameters, evaluation
criteria) used by the tool service.

`config/agents/*.agent.md` — Agent prompt files (planner, researcher, editor,
eval_judge). Reset from examples with `make config-reset`.

## Service Management

Services are supervised by `fit-rc` (via `libraries/librc/`). The service list
is defined in `config/config.json` under `init.services`.

```sh
npx fit-rc start              # Start all services (or: make rc-start)
npx fit-rc stop               # Graceful shutdown    (or: make rc-stop)
npx fit-rc restart            # Restart all          (or: make rc-restart)
npx fit-rc status             # Show service status  (or: make rc-status)
npx fit-rc start tei          # Start a single service
```

Services run on localhost in local mode (ports 3002–3008 for gRPC, 3001 for web,
8090 for TEI embeddings). Port mapping is in `.env.local`.

TEI (Text Embeddings Inference) provides local embeddings:

```sh
make tei-install              # Install via cargo (first time)
make tei-start                # Start TEI service (downloads model on first run)
```

## Common Tasks

### Bootstrap (First Run)

```sh
npm install                   # Install all workspace dependencies
make quickstart               # Full bootstrap: env, generate, data, codegen, process
make rc-start                 # Start services (supabase/tei skipped if not installed)
```

### Generation

```sh
make generate                 # Cached prose (default, no LLM needed)
make generate-update          # Generate new prose via LLM and update cache
make generate-no-prose        # Structural only, no prose (minimal data)
```

Generation uses cached prose by default from `.prose-cache.json`. Use
`make generate-update` to call the LLM and refresh the cache. The `no-prose`
mode produces minimal structural data without prose content.

### Development

```sh
npm run dev                   # Development server
npx fit-pathway dev           # Pathway dev server
npx fit-pathway build --url=X # Static site + install bundle
npx fit-basecamp --init ~/Dir # Initialize knowledge base
npx fit-basecamp --daemon     # Run scheduler
```

### Processing & Services

```sh
make process                  # Process all resources (agents, tools, vectors, graphs)
make process-fast             # Process without vectors (no TEI required)
make rc-start                 # Start all services
make rc-stop                  # Stop all services
make rc-status                # Service health check
```

### Quality

```sh
npm run check                 # Format, lint, test, validate (run before committing)
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

### Infrastructure

```sh
make codegen                  # Generate types, services, clients from proto/
make env-setup                # Initialize environment from examples
make data-init                # Create data dirs, copy example data to data/knowledge/
make config-reset             # Reset config files from examples
```

See each product's skill file for full CLI reference.

## Security

Security policies apply to all contributors — human and agent.

- **Pre-commit hooks** — `make install-hooks` installs a gitleaks hook that
  scans staged changes for secrets before every commit.
- **ESLint security rules** — `eslint-plugin-security` is enabled in
  `eslint.config.js`. Do not disable security rules without justification.
- **npm audit** — `npm audit --audit-level=high` runs in CI and gates publish
  workflows.
- **CI secret scanning** — Gitleaks runs on every push and pull request via the
  `audit` job in `check.yml`.
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

## Before Submitting a PR

- [ ] `npm run check` passes (format, lint, test, validate)
- [ ] `make audit` passes (npm audit + secret scanning)
- [ ] No secrets or credentials in commits
- [ ] Dependencies: use existing packages, align version ranges with existing
      usage

## Policy Ownership

Each policy area has one canonical location. Other files reference it instead of
restating the rules. Update the canonical location only.

| Policy area                          | Canonical location                       |
| ------------------------------------ | ---------------------------------------- |
| Core rules & architecture            | CLAUDE.md                                |
| Development workflow & practices     | CONTRIBUTING.md                          |
| Security workflows (hooks, scanning) | CONTRIBUTING.md § Security               |
| Dependency hygiene                   | CONTRIBUTING.md § Dependency Policy      |
| PR checklist                         | CONTRIBUTING.md § Before Submitting a PR |
| GitHub Actions SHA pinning           | CONTRIBUTING.md § Security               |
| Supply chain & app security          | `.claude/skills/security-audit`          |
| Dependabot triage process            | `.claude/skills/dependabot-triage`       |
