# Security Improvements Plan

## Context

The monorepo has no pre-commit hooks, no secret scanning, no security-focused
linting, unpinned GitHub Actions, no audit gates on publish workflows, and
duplicate/inconsistent dependencies. This plan addresses these gaps using simple
open-source tools with no additional infrastructure.

### Current State

- **Existing `make security` target** — runs
  `npm audit --audit-level=low --workspaces`. Will be replaced by `make audit`
  with higher severity threshold and gitleaks.
- **Permissions** — `check.yml` is the only workflow missing an explicit
  `permissions` block. The other four workflows already declare least-privilege
  permissions.
- **`.gitignore`** — Already covers `**/.env`, `**/.env.*` with allowlist for
  `.env.*.example`. No changes needed.

---

## 1. Reduce and Pin Third-Party GitHub Actions

### Supply chain assessment

| Action                          | Maintainer           | Risk       | Decision                           |
| ------------------------------- | -------------------- | ---------- | ---------------------------------- |
| `actions/checkout`              | GitHub (first-party) | Low        | **Keep** — pin to SHA              |
| `actions/setup-node`            | GitHub (first-party) | Low        | **Keep** — pin to SHA              |
| `actions/configure-pages`       | GitHub (first-party) | Low        | **Keep** — pin to SHA              |
| `actions/upload-pages-artifact` | GitHub (first-party) | Low        | **Keep** — pin to SHA              |
| `actions/deploy-pages`          | GitHub (first-party) | Low        | **Keep** — pin to SHA              |
| `denoland/setup-deno`           | Deno (official org)  | Low        | **Keep** — pin to SHA              |
| `softprops/action-gh-release`   | Personal maintainer  | **Medium** | **Remove** — replace with `gh` CLI |

**`softprops/action-gh-release`** is the only action not maintained by a
first-party org. It is a personal project (softprops = Doug Tangren). The usage
in `publish-macos.yml` is straightforward — create a release with a tag, name,
auto-generated notes, and one file attachment. The pre-installed `gh` CLI on
GitHub-hosted runners does this natively with zero third-party dependency:

```yaml
- name: Create GitHub Release
  run: |
    gh release create "${{ steps.meta.outputs.tag }}" \
      --title "Basecamp ${{ steps.meta.outputs.version }}" \
      --generate-notes \
      products/basecamp/${{ steps.verify.outputs.pkg_file }}
  env:
    GH_TOKEN: ${{ github.token }}
```

This eliminates the only non-org third-party action in the repo. The workflow
already has `permissions: { contents: write }` which is required for
`gh release create`.

### Actions to pin (look up current SHAs at implementation time)

After removing `softprops/action-gh-release`, only first-party and official org
actions remain:

**Files to modify:**

- `.github/workflows/check.yml`
- `.github/workflows/publish-npm.yml`
- `.github/workflows/publish-macos.yml`
- `.github/workflows/publish-skills.yml`
- `.github/workflows/website.yaml`

| Action                          | Current | Pin to SHA           |
| ------------------------------- | ------- | -------------------- |
| `actions/checkout`              | `@v4`   | SHA + `# v4` comment |
| `actions/setup-node`            | `@v4`   | SHA + `# v4` comment |
| `denoland/setup-deno`           | `@v2`   | SHA + `# v2` comment |
| `actions/configure-pages`       | `@v5`   | SHA + `# v5` comment |
| `actions/upload-pages-artifact` | `@v3`   | SHA + `# v3` comment |
| `actions/deploy-pages`          | `@v4`   | SHA + `# v4` comment |

## 2. Add Least-Privilege Permissions to check.yml

`check.yml` is the only workflow missing an explicit `permissions` block — it
inherits repo defaults. The other workflows (`publish-npm.yml`,
`publish-macos.yml`, `publish-skills.yml`, `website.yaml`) already declare
explicit permissions. Add minimal permissions to `check.yml`.

**File:** `.github/workflows/check.yml`

Add top-level:

```yaml
permissions:
  contents: read
```

## 3. Add Dependabot Configuration

Automate dependency update PRs for both GitHub Actions and npm.

**New file:** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      minor-and-patch:
        update-types: [minor, patch]
```

## 4. Add npm Audit Gate to Publish Workflows

Block npm publish if there are known vulnerabilities at high/critical severity.
The existing `make security` target uses `--audit-level=low` which is too noisy
for a gate — `high` catches actionable vulnerabilities without blocking on
low-severity advisories that often have no fix available.

**File:** `.github/workflows/publish-npm.yml`

Add step before the publish step:

```yaml
- name: Security audit
  run: npm audit --audit-level=high --workspaces
```

**File:** `.github/workflows/publish-macos.yml`

Add step before the build step:

```yaml
- name: Security audit
  run: npm audit --audit-level=high --workspaces
```

This gates both publish pathways (npm packages and macOS installer).

## 5. Add Gitleaks Secret Scanning

### 5a. CI check (GitHub Actions)

**File:** `.github/workflows/check.yml`

Add a new `audit` job that runs `make audit` — the single Makefile target that
combines npm audit and gitleaks (see step 9). This keeps CI and local developer
workflows identical. The job runs in parallel with the existing `check` job (no
`needs:` dependency).

```yaml
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@{SHA} # v4
      with:
        fetch-depth: 0
    - uses: actions/setup-node@{SHA} # v4
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - name: Install gitleaks
      run: |
        GITLEAKS_VERSION="8.24.3"
        curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar xz
        sudo mv gitleaks /usr/local/bin/
    - name: Run audit
      run: make audit
```

**Notes:**

- `fetch-depth: 0` is required for gitleaks to scan full git history.
- The gitleaks version is pinned explicitly. Update it via Dependabot or
  manually when new versions ship.
- The download URL uses the versioned release path (not `/latest/download/`) to
  ensure reproducible installs.

The job installs gitleaks from the official release, then delegates to
`make audit` which runs both `npm audit` and `gitleaks detect`. One target, same
checks locally and in CI.

### 5b. Gitleaks config

**New file:** `.gitleaks.toml`

Minimal config to reduce false positives on example/template env files:

```toml
[allowlist]
  paths = [
    '''\.env\..*\.example$''',
    '''\.env\.example$''',
    '''config/.*\.example\..*''',
  ]
```

### 5c. Git pre-commit hook

**New file:** `scripts/install-hooks.sh`

Simple script to install a git pre-commit hook that runs gitleaks on staged
files. No husky dependency — just a shell script.

```sh
#!/bin/sh
# Install git hooks for this repo
HOOK=.git/hooks/pre-commit
cat > "$HOOK" << 'EOF'
#!/bin/sh
# Scan staged changes for secrets
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --verbose
  if [ $? -ne 0 ]; then
    echo "gitleaks: secrets detected in staged changes. Commit blocked."
    exit 1
  fi
else
  echo "Warning: gitleaks not installed, skipping secret scan"
fi
EOF
chmod +x "$HOOK"
echo "Pre-commit hook installed"
```

**File:** `Makefile` — Add target:

```makefile
install-hooks:  ## Install git pre-commit hooks
	@sh scripts/install-hooks.sh
```

Update the `quickstart` target to include `install-hooks`. Current definition:

```makefile
quickstart: env-setup generate-cached data-init codegen process-fast
```

Becomes:

```makefile
quickstart: env-setup generate-cached data-init codegen process-fast install-hooks
```

## 6. Add ESLint Security Plugin

Add `eslint-plugin-security` for detecting common security anti-patterns (eval,
non-literal RegExp, non-literal require, etc.).

**Install:** `npm install -D eslint-plugin-security`

**File:** `eslint.config.js`

Add the security plugin's recommended config:

```js
import security from "eslint-plugin-security";

export default [
  js.configs.recommended,
  security.configs.recommended,
  prettierConfig,
  // ... rest unchanged
];
```

## 7. Consolidate Duplicate YAML Parsers

The `yaml` package (v2) is the modern, actively maintained YAML parser.
`js-yaml` (v4) is legacy. Consolidate to `yaml` across the monorepo.

**Packages using `js-yaml`:**

- `libraries/libdoc/package.json` (`^4.1.1`) — `frontmatter.js` imports it
- `libraries/libtool/package.json` (`^4.1.0`) — `processor/tool.js` imports it
- `libraries/libagent/package.json` (`^4.1.1`) — listed as dep but **not
  imported anywhere** (confirmed via grep — zero import/require statements)

**Changes:**

1. `libraries/libdoc/package.json`: Replace `js-yaml` with `yaml`
2. `libraries/libdoc/frontmatter.js`: Change `import yaml from "js-yaml"` →
   `import { parse } from "yaml"` and update API calls (`yaml.load()` →
   `parse()`)
3. `libraries/libtool/package.json`: Replace `js-yaml` with `yaml`
4. `libraries/libtool/processor/tool.js`: Same API migration
5. `libraries/libagent/package.json`: Remove unused `js-yaml` dependency

**API difference:** `js-yaml` uses `yaml.load(str)` / `yaml.dump(obj)`. `yaml`
package uses `parse(str)` / `stringify(obj)`.

## 8. Align Dependency Versions

Harmonize version ranges for shared dependencies:

| Package       | Current ranges                             | Align to | Risk                                              |
| ------------- | ------------------------------------------ | -------- | ------------------------------------------------- |
| `ajv`         | ^8.12.0 (libsyntheticprose), ^8.17.1 (map) | ^8.17.1  | Minor bump, same major — low risk                 |
| `ajv-formats` | ^2.1.1 (libsyntheticprose), ^3.0.1 (map)   | ^3.0.1   | **Major version bump** — verify API compatibility |
| `marked`      | ^14.1.4 (libdoc), ^15.0.12 (libformat)     | ^15.0.12 | **Major version bump** — verify API compatibility |

**Files to modify:**

- `libraries/libsyntheticprose/package.json`: bump ajv to ^8.17.1, ajv-formats
  to ^3.0.1
- `libraries/libdoc/package.json`: bump marked to ^15.0.12

**Important:** `ajv-formats` ^2 → ^3 and `marked` ^14 → ^15 are major version
bumps. Before committing:

1. Check the changelogs for breaking changes
2. Review how each library uses the affected API (`ajvFormats(ajv)` call
   pattern, `marked.parse()` options)
3. Run tests for the affected packages:
   `npm test --workspace=@forwardimpact/libsyntheticprose --workspace=@forwardimpact/libdoc`

After changes: `npm install` to regenerate lockfile, then run full tests.

## 9. Rename and Centralize `make audit`

Rename the existing `make security` target (currently runs
`npm audit --audit-level=low --workspaces`) to `make audit` and expand it to run
both npm audit and gitleaks in a single command. Raise the audit level from
`low` to `high` to match the publish gate threshold. This is the single source
of truth for security checks — CI runs `make audit`, developers run
`make audit`, the pre-commit hook runs gitleaks directly (staged files only).

**File:** `Makefile`

Replace the existing target:

```makefile
.PHONY: audit
audit:  ## Run security audit (npm vulnerabilities + secret scanning)
	@npm audit --audit-level=high --workspaces
	@echo ""
	@if command -v gitleaks >/dev/null 2>&1; then \
		gitleaks detect --source . --verbose; \
	else \
		echo "Warning: gitleaks not installed, skipping secret scan"; \
	fi
```

Delete the old `security` target entirely — clean break, no alias. Update any
references to `make security` in documentation or skills.

## 10. Create SECURITY.md

**New file:** `SECURITY.md`

A standard security policy file that GitHub surfaces in the repo's Security tab.

Contents:

- **Supported Versions** — Only the latest major version of each published
  package is supported. No backports to older major versions.
- **Reporting a Vulnerability** — Email `hi.security@senzilla.io` with a
  description, reproduction steps, and impact assessment. Acknowledge receipt
  within 3 business days, target resolution within 30 days for critical issues.
- **Scope** — Covers all packages published under `@forwardimpact/*` on npm and
  the GitHub releases (macOS installer).
- **Out of Scope** — Self-hosted instances running unsupported/modified
  versions, issues in upstream dependencies (report those upstream).

Keep it short and direct — no legal boilerplate.

## 11. Create CONTRIBUTING.md

**New file:** `CONTRIBUTING.md`

A developer-facing guide covering how to contribute safely. References existing
tooling and the new security checks:

- **Getting Started** — `npm install`, `make quickstart`
- **Development Workflow** — Branch, code, `npm run check`, commit, push
- **Security Workflows** — Pre-commit secret scanning (gitleaks), ESLint
  security rules, `npm audit`, CI secret scanning
- **Before Submitting a PR** checklist:
  - `npm run check` passes (format, lint, test, validate)
  - `make audit` passes (npm audit)
  - No secrets or credentials in commits
  - Dependencies: use existing packages (e.g. `yaml` not `js-yaml`), align
    version ranges with existing usage
- **Dependency Policy** — Minimize external dependencies, consolidate parsers,
  align version ranges across workspaces
- **Reporting Security Issues** — Link to SECURITY.md

Keep it concise — link to CLAUDE.md for detailed architecture/style rules rather
than duplicating them.

## 12. Update CLAUDE.md and Claude Skills

### 12a. Add Security section to CLAUDE.md

**File:** `CLAUDE.md`

Add a new `## Security` section after the `## Code Style` section. Contents:

```markdown
## Security

- **Secret scanning** — Never commit `.env` files, API keys, tokens, or
  credentials. The CI runs gitleaks on every PR.
- **Audit** — `make audit` runs npm audit and gitleaks in one command. The same
  target runs in CI and locally. Publish workflows block on audit failures.
- **ESLint security** — `eslint-plugin-security` is enabled. Do not disable
  security rules without justification.
- **Dependency policy** — Minimize external dependencies. Use `yaml` (not
  `js-yaml`). Align version ranges across workspaces. Check for existing
  packages before adding new ones.
- **GitHub Actions** — All third-party actions are pinned to SHA hashes. Use
  `Dependabot` for updates. Never change a pin to a tag.
- **Reporting** — See `SECURITY.md`. Contact `hi.security@senzilla.io`.
```

### 12b. Update "Before Committing" checklist in CLAUDE.md

**File:** `CLAUDE.md`

Add to the existing "Before Committing" numbered list (after step 3):

```markdown
4. Run `make audit` to check for vulnerabilities and leaked secrets
```

(Renumber subsequent steps accordingly.)

### 12c. Update relevant Claude skills

Skills that deal with dependencies or infrastructure should reference the
security workflows.

**File:** `.claude/skills/libs-system-utilities/SKILL.md`

Add a security note to the skill referencing:

- Secret generation uses `libsecret` — never hardcode secrets
- `make audit` for npm audit + gitleaks secret scanning

**File:** `.claude/skills/libs-web-presentation/SKILL.md`

Add a dependency note:

- Use `yaml` package (not `js-yaml`) for YAML parsing
- Use `marked` ^15.x for markdown parsing
- Run `npm audit` after adding dependencies

No changes needed to other skills — the CLAUDE.md security section covers the
general rules that all skills inherit.

## 13. Create `security-audit` Claude Skill

**New file:** `.claude/skills/security-audit/SKILL.md`

A skill that guides Claude to perform a holistic security review of the
monorepo. Unlike the other skills (which are about building specific products or
using specific libraries), this skill articulates security principles and tells
the agent what to look for — not how to fix it.

The skill should be principle-driven, not prescriptive. It defines what "secure"
means for this repo and lets the agent reason about violations.

### Frontmatter

```yaml
---
name: security-audit
description: >
  Perform a holistic security review of the monorepo. Assess GitHub Actions
  supply chain, dependency hygiene, credential leak controls, CI audit gates,
  and application-level vulnerabilities. Use when reviewing PRs for security
  impact, auditing the repo posture, or investigating a reported vulnerability.
---
```

### Content structure

The skill body should cover the following areas as **principles with
check-items**, not step-by-step instructions:

**1. Supply Chain — GitHub Actions**

- All third-party actions must be pinned to full SHA hashes with a version
  comment (`# v4`). Tag-only references (`@v4`) are not acceptable.
- Only first-party (GitHub `actions/*`) or official org actions are permitted.
  Personal-maintainer actions must be replaced with CLI equivalents (e.g.
  `gh release create` instead of `softprops/action-gh-release`).
- All workflows must declare explicit `permissions` with least privilege.
- Dependabot must be configured to propose updates to action SHAs.

**2. Supply Chain — npm Dependencies**

- Minimize the number of external dependencies. Before adding a new package,
  check if an existing dependency or Node.js built-in can serve the same
  purpose.
- No duplicate packages serving the same purpose (e.g. two YAML parsers, two
  markdown renderers). Consolidate to one.
- Version ranges for the same package must be aligned across all workspaces.
- `npm audit --audit-level=high` must pass. Publish workflows must gate on audit
  results.

**3. Credential & Secret Leak Prevention**

- `.env` files, API keys, tokens, and credentials must never be committed.
  `.gitignore` must cover all sensitive file patterns.
- Gitleaks must be configured with a `.gitleaks.toml` allowlist for known false
  positives (e.g. `.env.*.example` files).
- A pre-commit hook must run gitleaks on staged changes.
- CI must run gitleaks on every push and pull request.
- Secrets in GitHub Actions must use `secrets.*` — never hardcode values in
  workflow files.

**4. Static Analysis**

- ESLint must include `eslint-plugin-security` recommended rules.
- Security rules must not be disabled without explicit justification in a
  comment.

**5. Application Security (OWASP Top 10)**

When reviewing application code, check for:

- **Injection** — Unsanitized user input in shell commands (`child_process`),
  database queries, or template rendering. Prefer parameterized APIs.
- **Broken Authentication** — Hardcoded credentials, weak token generation,
  missing token expiry.
- **Sensitive Data Exposure** — Secrets logged to console or trace output, error
  messages leaking internal paths or stack traces to clients.
- **Security Misconfiguration** — Overly permissive CORS, missing security
  headers, debug mode enabled in production configs.
- **Vulnerable Components** — Dependencies with known CVEs (`npm audit`),
  outdated packages with unpatched vulnerabilities.
- **Insufficient Logging** — Security-relevant events (auth failures, access
  denied, config changes) not logged.
- **Server-Side Request Forgery (SSRF)** — User-controlled URLs passed to
  `fetch`/`undici` without validation.
- **Insecure Deserialization** — Untrusted YAML/JSON parsed without schema
  validation (all YAML data should be validated against JSON Schema via
  `fit-map validate`).

**6. CI/CD Security**

- The `make audit` target must be the single source of truth for security
  checks, running both npm audit and gitleaks.
- Publish workflows must not run if audit checks fail.
- CI and local developer workflows must run the same checks (same Makefile
  target).

**7. Audit Workflow**

Provide guidance on how to perform a review:

- Run `make audit` locally and report findings.
- Review `.github/workflows/` for unpinned actions, missing permissions, exposed
  secrets.
- Review `package.json` files for unnecessary or duplicate dependencies.
- Review `.gitignore` and `.gitleaks.toml` for coverage gaps.
- Review `eslint.config.js` for disabled security rules.
- Grep for common vulnerability patterns: `eval(`, `child_process.exec(`,
  `innerHTML`, `dangerouslySetInnerHTML`, `new Function(`, unsanitized template
  literals in SQL/shell contexts.

---

## Risks and Mitigations

| Risk                                                                | Impact                  | Mitigation                                                                                     |
| ------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `ajv-formats` ^2→^3 breaks libsyntheticprose                        | Build failure           | Test before committing; review changelog for breaking changes                                  |
| `marked` ^14→^15 breaks libdoc                                      | Build failure           | Test before committing; review changelog for breaking changes                                  |
| `eslint-plugin-security` flags existing code                        | Lint failures           | Run `npm run lint` early (step 2); fix or disable with justification                           |
| Gitleaks flags false positives in history                           | CI audit job fails      | Tune `.gitleaks.toml` allowlist; use `--no-git` for path-only scan if history is too noisy     |
| SHA pins go stale                                                   | Missed security updates | Dependabot auto-proposes updates weekly                                                        |
| `npm audit --audit-level=high` blocks publish on unfixable advisory | Cannot publish          | Temporarily add advisory to `.npmrc` `audit-ignore` or lower threshold; document the exception |

## Verification

After all changes:

1. `npm install` — Regenerate lockfile with consolidated deps
2. `npm run check:fix` — Fix any formatting/lint issues from eslint changes
3. `npm run check` — Ensure lint, format, test, validate all pass
4. `gitleaks detect --source . --verbose` — Verify no existing leaks flagged
5. Review each modified workflow file for correct SHA pins
6. Test pre-commit hook:
   `sh scripts/install-hooks.sh && echo "test" > .env.test && git add .env.test`
   — should warn about potential secret
7. Verify `make audit` runs both npm audit and gitleaks
8. Verify `js-yaml` no longer appears in any `package.json`

## Order of Operations

Each numbered step is one logical commit. Run `npm run check` at gates marked
with ✓ to catch breakage early.

1. **Dependency consolidation** — Replace `js-yaml` with `yaml` in libdoc,
   libtool; remove unused `js-yaml` from libagent; align ajv, ajv-formats,
   marked versions; `npm install` ✓
2. **ESLint security plugin** — Install `eslint-plugin-security`, update
   `eslint.config.js`; `npm run check:fix` ✓
3. **GitHub Actions hardening** — Pin all actions to SHA, add permissions to
   `check.yml`, replace `softprops/action-gh-release` with `gh` CLI, add audit
   gate to publish workflows
4. **Dependabot config** — Add `.github/dependabot.yml`
5. **Gitleaks + pre-commit hook** — Add `.gitleaks.toml`,
   `scripts/install-hooks.sh`
6. **Makefile updates** — Rename `security` → `audit` (npm audit + gitleaks),
   add `install-hooks` target, add to `quickstart`
7. **CI audit job** — Add `audit` job to `check.yml` (runs `make audit`)
8. **Documentation** — Create `SECURITY.md`, `CONTRIBUTING.md`
9. **CLAUDE.md + skills** — Add Security section, update Before Committing
   checklist, update libs-system-utilities and libs-web-presentation skills
10. **Security audit skill** — Create `.claude/skills/security-audit/SKILL.md`
11. **Final verification** — `npm run check` + `make audit` ✓
