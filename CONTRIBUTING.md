# Contributing

## Getting Started

```sh
bun install
just quickstart
```

## Core Rules

Organized by _when_ they apply, following Atul Gawande's _Checklist Manifesto_
(Ch. 6). **READ-DO**: read each item, then do it. **DO-CONFIRM**: do from
memory, then pause and confirm.

### Invariants

Architectural non-negotiables — the shape of the codebase, not per-contribution
checks.

- **OO+DI everywhere** — Constructor-injected dependencies. No module-level
  singletons, no inline dependency creation. Factory functions (`createXxx`)
  wire real implementations; tests inject mocks directly. See
  [CLAUDE.md § OO+DI Architecture](CLAUDE.md#oodi-architecture) for patterns and
  exceptions.
- **No frameworks** — Vanilla JS, ESM modules only, no CommonJS.

### READ-DO

Read every item before starting, and hold them while writing. Entry gate — don't
start until all are internalized.

- [ ] **Understand the task.** What is it actually asking? Which files will I
      touch, and which will I not?
- [ ] **Smallest plan.** No unrequested features, abstractions, or refactors. If
      it isn't asked for, don't add it.
- [ ] **Read the code** I'm about to change before writing.
- [ ] **Simple over easy.** Reduce complexity, don't relocate it. Three similar
      lines beat a premature abstraction. If tempted to extract a helper for a
      single use, inline it. If tempted to add configuration for a single
      consumer, hardcode it.
- [ ] **No defensive code.** Trust the architecture — let errors surface. No
      try/catch "just to be safe," no optional chaining on data that isn't
      optional.
- [ ] **Clean breaks.** Delete old code as you write new — in one commit. No
      shims, aliases, or feature flags for the old path. If there are no
      consumers yet, remove the old interface entirely.

### DO-CONFIRM

Before committing, verify every item. Exit gate — don't proceed until all are
confirmed.

- [ ] `bun run check` passes — format and lint, all file types.
- [ ] `bun run test` passes — new logic has tests.
- [ ] My diff only contains changes the task required — no unrequested
      refactors, no scope creep.
- [ ] Commit format: `type(scope): subject` (see § Git Conventions).

## Pull Request Workflow

All changes go through pull requests — never push directly to `main`.

**Always commit your work before finishing a task.**

**Exception:** The release engineer agent may push trivial CI fixes (formatting,
lint, lock file drift) directly to `main` to unblock releases. This is limited
to mechanical fixes that `bun run check:fix` can resolve — never logic, tests,
or feature changes. See
[.claude/agents/release-engineer.md](.claude/agents/release-engineer.md) for
the full scope constraints.

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

**Tag prefix** matches the directory name, not the package scope:

- `libraries/libfoo` → `libfoo@v0.1.5`
- `products/pathway` → `pathway@v0.25.0`
- `services/agent` → `svcagent@v0.1.110`

**Version rules** — pre-1.0 packages (`0.x.y`) bump patch for any change.
Post-1.0 packages use semver: breaking=major, feat=minor, fix/refactor=patch.

The release manager agent handles version bumps, tagging, and publishing. See
the [gemba-release-review skill](.claude/skills/gemba-release-review) for the full release
procedure.

## Quality Commands

```sh
bun run check                 # Format and lint — ALL file types (run before every commit)
bun run check:fix             # Auto-fix format and lint issues
bun run test                  # Unit tests (run before every commit)
bun run test:e2e              # Playwright E2E tests (requires generated data)
bunx fit-map validate         # Validate data files
bunx fit-map validate --shacl # Validate with SHACL syntax check
```

## Security

Security policies apply to all contributors — human and agent.

- **ESLint security rules** — `eslint-plugin-security` is enabled in
  [eslint.config.js](eslint.config.js) with all active rules set to `"error"`.
  Two high-noise, low-signal rules (`detect-object-injection`,
  `detect-non-literal-fs-filename`) are turned off. To suppress a security rule
  for a verified false positive, add an inline disable with an audit
  justification:
  ```js
  // eslint-disable-next-line security/detect-unsafe-regex -- <why this is safe>
  ```
  Never use block-level or file-level disables for security rules. Each
  suppression must explain why the flagged code is safe.
- **Vulnerability audit** — `npm audit --audit-level=high` runs in CI (via
  temporary lockfile generation) and gates publish workflows.
- **CI secret scanning** — Gitleaks runs on every push and pull request via the
  `audit` job in
  [.github/workflows/check-security.yml](.github/workflows/check-security.yml).
- **GitHub Actions** — All third-party actions are pinned to SHA hashes. Use
  `Dependabot` for updates. Never change a pin to a tag.
- **Reporting** — See [SECURITY.md](SECURITY.md). Contact
  `hi.security@senzilla.io`.

## Dependency Policy

- **Prefer built-ins.** Reach for Node.js built-ins before npm packages (`fetch`
  over `undici`, `crypto.randomUUID()` over `uuid`), and consolidate overlapping
  packages — one YAML parser, one markdown renderer.
- **Align versions.** Declare the same range across workspaces. Bun hoists
  packages at the same version to a single copy, which is fine — don't remove a
  runtime dep from a `package.json` just because bun deduplicates.
- **No nested duplicates.** The same package resolved at two major versions
  (e.g. `protobufjs@8` alongside `@grpc/proto-loader/protobufjs@7`) is not
  allowed. Before merging a major version bump, run `bun pm ls` and inspect
  `bun.lock` for `invalid` markers. If a bump forces co-installed packages onto
  a separate version, close the PR until dependents release compatible ranges.
- **Audit after changes.** Run `just audit-vulnerabilities` after adding or
  updating dependencies.

### Classification

Every dependency belongs in one category. Apply in order — first match wins.

| Category             | Rule                                                                                        | Field                                       | Examples                                         |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| **Always needed**    | Imported synchronously at load time, unconditionally                                        | `dependencies`                              | yaml, mustache, marked, hono, @grpc/grpc-js, ajv |
| **Backend-specific** | Only needed when a `process.env` value selects that backend; alternative backends exist     | `optionalDependencies` + dynamic `import()` | @aws-sdk/client-s3, @supabase/supabase-js        |
| **Feature-gated**    | Only loaded when the user explicitly enables a feature; core functionality works without it | `optionalDependencies` + dynamic `import()` | apache-arrow, parquet-wasm, @faker-js/faker      |
| **Build-tool**       | Used only by consumers who already have the tool installed (formatters, linters)            | `peerDependencies`                          | prettier                                         |
| **Build-time only**  | Used in `bin/` scripts or code generation, never by library consumers                       | `devDependencies`                           | protobufjs-cli, @grpc/proto-loader               |

### Optional Dependency Pattern

Backend-specific and feature-gated dependencies must use dynamic `import()` at
the point of use — never at the top of the module — wrapped in `try/catch` that
throws a descriptive error:

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

The error message **must** name the feature that triggered the need, the
package, and the exact install command. Never silently fall back or swallow the
error — let the caller decide.
