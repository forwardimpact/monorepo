# Contributing

## Getting Started

```sh
bun install
just quickstart
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

**Exception:** The release manager agent may push trivial CI fixes (formatting,
lint, lock file drift) directly to `main` to unblock releases. This is limited
to mechanical fixes that `bun run check:fix` can resolve — never logic, tests,
or feature changes. See `.claude/agents/release-manager.md` for the full scope
constraints.

1. Create a branch from `main`
2. Make your changes
3. Auto-fix formatting and lint: `bun run check:fix` (applies to all file types)
4. Verify all checks pass: `bun run check` (required for code **and** docs)
5. Run security audit: `just audit`
6. Commit: `git commit -m "type(scope): subject"`
7. Push and open a pull request against `main`

**Always commit your work before finishing a task.**

The pre-commit hook auto-formats staged files and scans for secrets. If the hook
reformats files, it re-stages them automatically — just re-run your commit.

## Git Conventions

Format: `type(scope): subject`

- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `spec`
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

The release manager agent handles version bumps, tagging, and publishing. See
`.claude/skills/release-review` for the full release procedure.

## Quality Commands

```sh
bun run check                 # Format, lint, test, validate — ALL file types (run before every commit)
bun run check:fix             # Auto-fix format and lint issues
bun run test                  # Unit tests (bun run node --test)
bun run test:e2e              # Playwright E2E tests (requires generated data)
bunx fit-map validate         # Validate data files
bunx fit-map validate --shacl # Validate with SHACL syntax check
```

## Security

Security policies apply to all contributors — human and agent.

- **ESLint security rules** — `eslint-plugin-security` is enabled in
  `eslint.config.js` with all active rules set to `"error"`. Two high-noise,
  low-signal rules (`detect-object-injection`, `detect-non-literal-fs-filename`)
  are turned off. To suppress a security rule for a verified false positive, add
  an inline disable with an audit justification:
  ```js
  // eslint-disable-next-line security/detect-unsafe-regex -- <why this is safe>
  ```
  Never use block-level or file-level disables for security rules. Each
  suppression must explain why the flagged code is safe.
- **Vulnerability audit** — `npm audit --audit-level=high` runs in CI (via
  temporary lockfile generation) and gates publish workflows.
- **CI secret scanning** — Gitleaks runs on every push and pull request via the
  `audit` job in `check-security.yml`.
- **GitHub Actions** — All third-party actions are pinned to SHA hashes. Use
  `Dependabot` for updates. Never change a pin to a tag.
- **Reporting** — See `SECURITY.md`. Contact `hi.security@senzilla.io`.

## Dependency Policy

- Minimize external dependencies — prefer existing packages and Node.js
  built-ins over new ones, and consolidate packages that serve the same purpose
  (e.g. one YAML parser, one markdown renderer)
- Align version ranges for the same package across all workspaces
- Verify peer and transitive dependency compatibility before merging major
  version bumps — run `bun pm ls` and confirm no `invalid` markers. Also inspect
  `bun.lock` for **nested duplicates** (the same package resolved at two
  different major versions, e.g. a top-level `protobufjs@8` alongside
  `@grpc/proto-loader/protobufjs@7`). A major bump that forces co-installed
  packages onto a separate version violates this policy — close the PR until all
  dependents release compatible ranges
- Run `just audit-vulnerabilities` after adding or updating dependencies

### Dependency Classification

Every external dependency must be classified into one of these categories. Apply
the decision rules in order — the first match wins.

| Category             | Rule                                                                                        | Field                                       | Examples                                         |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| **Always needed**    | Imported synchronously at load time, unconditionally                                        | `dependencies`                              | yaml, mustache, marked, hono, @grpc/grpc-js, ajv |
| **Backend-specific** | Only needed when a `process.env` value selects that backend; alternative backends exist     | `optionalDependencies` + dynamic `import()` | @aws-sdk/client-s3, @supabase/supabase-js        |
| **Feature-gated**    | Only loaded when the user explicitly enables a feature; core functionality works without it | `optionalDependencies` + dynamic `import()` | apache-arrow, parquet-wasm, @faker-js/faker      |
| **Build-tool**       | Used only by consumers who already have the tool installed (formatters, linters)            | `peerDependencies`                          | prettier                                         |
| **Build-time only**  | Used in `bin/` scripts or code generation, never by library consumers                       | `devDependencies`                           | protobufjs-cli, @grpc/proto-loader               |

**Rules:**

1. Code that uses a backend-specific or feature-gated dependency **must** use
   dynamic `import()` and handle the missing-module error gracefully.
2. A dependency that appears in multiple workspaces at the same pinned version
   is fine — bun hoists it to one copy. Do not remove it from a published
   package just to "deduplicate" if that package needs it at runtime.
3. Prefer Bun/Node.js built-ins over npm packages (e.g. `fetch` with `proxy`
   option over `undici`, `crypto.randomUUID()` over `uuid`).

### Optional Dependency Pattern

When a dependency is backend-specific or feature-gated, follow this pattern:

1. List the package in `optionalDependencies` in `package.json`.
2. Use dynamic `import()` at the point of use — never at the top of the module.
3. Wrap the import in `try/catch` and throw a descriptive error naming the
   missing package and the install command:

```js
let createClient;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch {
  throw new Error(
    "--load requires @supabase/supabase-js. Install with: bun add @supabase/supabase-js",
  );
}
```

The error message **must** include: what feature triggered the need, the package
name, and the exact install command. Do not silently fall back or swallow the
error — let the caller decide how to handle it.
