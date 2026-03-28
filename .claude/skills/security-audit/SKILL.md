---
name: security-audit
description: >
  Perform a holistic security review of the monorepo. Assess GitHub Actions
  supply chain, dependency hygiene, credential leak controls, CI audit gates,
  and application-level vulnerabilities. Use when reviewing PRs for security
  impact, auditing the repo posture, or investigating a reported vulnerability.
---

# Security Audit

## 1. Supply Chain — GitHub Actions

- All third-party actions must be pinned to full SHA hashes with a version
  comment (`# v4`). Tag-only references (`@v4`) are not acceptable.
- Only first-party (GitHub `actions/*`) or official org actions are permitted.
  Personal-maintainer actions must be replaced with CLI equivalents (e.g.
  `gh release create` instead of `softprops/action-gh-release`).
- All workflows must declare explicit `permissions` with least privilege.
- Dependabot must be configured to propose updates to action SHAs.

## 2. Supply Chain — npm Dependencies

Dependency policy rules (minimize deps, no duplicates, align version ranges, npm
audit) are defined in CONTRIBUTING.md § Dependency Policy. During a security
audit, additionally verify:

- Publish workflows gate on `npm audit` results (not just CI)
- No packages with known CVEs remain unpatched (see § 5 Vulnerable Components)

## 3. Credential & Secret Leak Prevention

Pre-commit hooks, CI secret scanning, and the "no secrets in commits" rule are
defined in CONTRIBUTING.md § Security. During a security audit,
additionally verify:

- `.gitignore` covers all sensitive file patterns (`.env`, credentials, keys)
- `.gitleaks.toml` allowlist exists for known false positives (e.g.
  `.env.*.example` files)
- Secrets in GitHub Actions use `secrets.*` — no hardcoded values in workflow
  files

## 4. Static Analysis

ESLint security rules are defined in CONTRIBUTING.md § Security.
During a security audit, verify no security rules have been disabled in
`eslint.config.js` without an inline justification comment.

## 5. Application Security (OWASP Top 10)

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

## 6. CI/CD Security

CI check requirements (`npm run check`, `make audit`) are defined in
CONTRIBUTING.md § Before Submitting a PR. During a security audit, additionally
verify:

- Publish workflows block on audit failures (not just PR checks)
- CI and local developer workflows run the same checks (same Makefile target)

## 7. Audit Workflow

How to perform a review:

- Run `make audit` locally and report findings.
- Review `.github/workflows/` for unpinned actions, missing permissions, exposed
  secrets.
- Review `package.json` files for unnecessary or duplicate dependencies.
- Review `.gitignore` and `.gitleaks.toml` for coverage gaps.
- Review `eslint.config.js` for disabled security rules.
- Grep for common vulnerability patterns: `eval(`, `child_process.exec(`,
  `innerHTML`, `dangerouslySetInnerHTML`, `new Function(`, unsanitized template
  literals in SQL/shell contexts.
