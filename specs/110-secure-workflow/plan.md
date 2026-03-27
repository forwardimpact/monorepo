# Security Improvements Plan

## Context

The monorepo has no pre-commit hooks, no secret scanning, no security-focused
linting, unpinned GitHub Actions, no audit gates on publish workflows, and
duplicate/inconsistent dependencies. This plan addresses these gaps using simple
open-source tools with no additional infrastructure.

---

## 1. Pin GitHub Actions to SHA Hashes

All workflows use version tags (`@v4`) which are mutable. Pin to commit SHAs for
supply-chain safety. Add a comment with the version tag for readability.

**Files to modify:**
- `.github/workflows/check.yml`
- `.github/workflows/publish-npm.yml`
- `.github/workflows/publish-macos.yml`
- `.github/workflows/publish-skills.yml`
- `.github/workflows/website.yaml`

**Actions to pin (look up current SHAs at implementation time):**

| Action | Current | Pin to SHA |
|--------|---------|------------|
| `actions/checkout` | `@v4` | SHA + `# v4` comment |
| `actions/setup-node` | `@v4` | SHA + `# v4` comment |
| `denoland/setup-deno` | `@v2` | SHA + `# v2` comment |
| `softprops/action-gh-release` | `@v2` | SHA + `# v2` comment |
| `actions/configure-pages` | `@v5` | SHA + `# v5` comment |
| `actions/upload-pages-artifact` | `@v3` | SHA + `# v3` comment |
| `actions/deploy-pages` | `@v4` | SHA + `# v4` comment |

## 2. Add Least-Privilege Permissions to check.yml

`check.yml` has no `permissions` block — it inherits repo defaults. Add explicit
minimal permissions.

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

## 4. Add npm Audit Gate to Publish Workflow

Block npm publish if there are known vulnerabilities at high/critical severity.

**File:** `.github/workflows/publish-npm.yml`

Add step before the publish step:
```yaml
- name: Security audit
  run: npm audit --audit-level=high --workspaces
```

## 5. Add Gitleaks Secret Scanning

### 5a. CI check (GitHub Actions)

**File:** `.github/workflows/check.yml`

Add a new `secrets` job:
```yaml
secrets:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@{SHA} # v4
      with:
        fetch-depth: 0
    - uses: gitleaks/gitleaks-action@{SHA} # v2
      env:
        GITLEAKS_LICENSE: ""
```

Note: `gitleaks-action` v2 works without a license key for public repos. For
private repos, use a direct install approach instead:

```yaml
secrets:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@{SHA} # v4
      with:
        fetch-depth: 0
    - name: Install gitleaks
      run: |
        curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.24.3_linux_x64.tar.gz | tar xz
        sudo mv gitleaks /usr/local/bin/
    - name: Run gitleaks
      run: gitleaks detect --source . --verbose
```

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

Update the `quickstart` target to include `install-hooks`.

## 6. Add ESLint Security Plugin

Add `eslint-plugin-security` for detecting common security anti-patterns
(eval, non-literal RegExp, non-literal require, etc.).

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

The `yaml` package (v2) is the modern, actively maintained YAML parser. `js-yaml`
(v4) is legacy. Consolidate to `yaml` across the monorepo.

**Packages using `js-yaml`:**
- `libraries/libdoc/package.json` — `frontmatter.js` imports it
- `libraries/libtool/package.json` — `processor/tool.js` imports it
- `libraries/libagent/package.json` — listed as dep but **not imported anywhere**

**Changes:**
1. `libraries/libdoc/package.json`: Replace `js-yaml` with `yaml`
2. `libraries/libdoc/frontmatter.js`: Change `import yaml from "js-yaml"` →
   `import { parse } from "yaml"` and update API calls (`yaml.load()` →
   `parse()`)
3. `libraries/libtool/package.json`: Replace `js-yaml` with `yaml`
4. `libraries/libtool/processor/tool.js`: Same API migration
5. `libraries/libagent/package.json`: Remove unused `js-yaml` dependency

**API difference:** `js-yaml` uses `yaml.load(str)` / `yaml.dump(obj)`.
`yaml` package uses `parse(str)` / `stringify(obj)`.

## 8. Align Dependency Versions

Harmonize version ranges for shared dependencies:

| Package | Current ranges | Align to |
|---------|---------------|----------|
| `ajv` | ^8.12.0 (libsyntheticprose), ^8.17.1 (map) | ^8.17.1 |
| `ajv-formats` | ^2.1.1 (libsyntheticprose), ^3.0.1 (map) | ^3.0.1 |
| `marked` | ^14.1.4 (libdoc), ^15.0.12 (libformat) | ^15.0.12 |

**Files to modify:**
- `libraries/libsyntheticprose/package.json`: bump ajv to ^8.17.1, ajv-formats
  to ^3.0.1
- `libraries/libdoc/package.json`: bump marked to ^15.0.12

After changes: `npm install` to regenerate lockfile, then run tests.

## 9. Update Makefile Security Target

Enhance the existing `make security` target and add it to `check`.

**File:** `Makefile`

```makefile
security:  ## Run security audit
	@npm audit --audit-level=high --workspaces
```

Change from `--audit-level=low` to `--audit-level=high` to focus on actionable
vulnerabilities.

## 10. Create SECURITY.md

**New file:** `SECURITY.md`

A standard security policy file that GitHub surfaces in the repo's Security tab.

Contents:
- **Supported Versions** — Only the latest major version of each published
  package is supported. No backports to older major versions.
- **Reporting a Vulnerability** — Email `hi.security@senzilla.io` with a
  description, reproduction steps, and impact assessment. Acknowledge receipt
  within 3 business days, target resolution within 30 days for critical issues.
- **Scope** — Covers all packages published under `@forwardimpact/*` on npm
  and the GitHub releases (macOS installer).
- **Out of Scope** — Self-hosted instances running unsupported/modified
  versions, issues in upstream dependencies (report those upstream).

Keep it short and direct — no legal boilerplate.

## 11. Create CONTRIBUTING.md

**New file:** `CONTRIBUTING.md`

A developer-facing guide covering how to contribute safely. References existing
tooling and the new security checks:

- **Getting Started** — `npm install`, `make quickstart`, `make install-hooks`
- **Development Workflow** — Branch, code, `npm run check`, commit, push
- **Security Workflows** — Pre-commit secret scanning (gitleaks), ESLint
  security rules, `npm audit`, CI secret scanning
- **Before Submitting a PR** checklist:
  - `npm run check` passes (format, lint, test, validate)
  - `make security` passes (npm audit)
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

- **Pre-commit hooks** — Run `make install-hooks` after cloning. Gitleaks scans
  staged changes for secrets before every commit.
- **Secret scanning** — Never commit `.env` files, API keys, tokens, or
  credentials. The CI runs gitleaks on every PR.
- **npm audit** — `make security` runs `npm audit --audit-level=high`. Publish
  workflows block on audit failures.
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
4. Run `make security` to check for known vulnerabilities
```

(Renumber subsequent steps accordingly.)

### 12c. Update relevant Claude skills

Skills that deal with dependencies or infrastructure should reference the
security workflows.

**File:** `.claude/skills/libs-system-utilities/SKILL.md`

Add a security note to the skill referencing:
- Pre-commit hooks: `make install-hooks`
- Secret generation uses `libsecret` — never hardcode secrets
- `make security` for audit checks

**File:** `.claude/skills/libs-web-presentation/SKILL.md`

Add a dependency note:
- Use `yaml` package (not `js-yaml`) for YAML parsing
- Use `marked` ^15.x for markdown parsing
- Run `npm audit` after adding dependencies

No changes needed to other skills — the CLAUDE.md security section covers the
general rules that all skills inherit.

---

## Verification

After all changes:

1. `npm install` — Regenerate lockfile with consolidated deps
2. `npm run check:fix` — Fix any formatting/lint issues from eslint changes
3. `npm run check` — Ensure lint, format, test, validate all pass
4. `gitleaks detect --source . --verbose` — Verify no existing leaks flagged
5. Review each modified workflow file for correct SHA pins
6. Test pre-commit hook: `sh scripts/install-hooks.sh && echo "test" > .env.test && git add .env.test` — should warn about potential secret

## Order of Operations

1. Dependency consolidation (YAML parsers, version alignment) + `npm install`
2. ESLint security plugin install + config update
3. `npm run check:fix` + `npm run check` (ensure green)
4. GitHub Actions hardening (SHA pins, permissions, audit gate)
5. Dependabot config
6. Gitleaks config + CI job + pre-commit hook script
7. Makefile updates (install-hooks, security target)
8. Create SECURITY.md
9. Create CONTRIBUTING.md
10. Update CLAUDE.md (Security section + Before Committing checklist)
11. Update Claude skills (libs-system-utilities, libs-web-presentation)
12. Final `npm run check` + commit
