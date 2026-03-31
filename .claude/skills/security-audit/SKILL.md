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
defined in CONTRIBUTING.md § Security. During a security audit, additionally
verify:

- `.gitignore` covers all sensitive file patterns (`.env`, credentials, keys)
- `.gitleaks.toml` allowlist exists for known false positives (e.g.
  `.env.*.example` files)
- Secrets in GitHub Actions use `secrets.*` — no hardcoded values in workflow
  files

## 4. Static Analysis

ESLint security rules are defined in CONTRIBUTING.md § Security. During a
security audit, verify no security rules have been disabled in
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

CI check requirements (`bun run check`, `make audit`) are defined in
CONTRIBUTING.md § Before Submitting a PR. During a security audit, additionally
verify:

- Publish workflows block on audit failures (not just PR checks)
- CI and local developer workflows run the same checks (same Makefile target)

## 7. Focused Audit Strategy

Each audit run covers **one topic** in depth. This produces higher-quality
findings than a shallow pass over everything.

### Topic areas

| Topic                        | What to audit                                                          |
| ---------------------------- | ---------------------------------------------------------------------- |
| `actions-supply-chain`       | GitHub Actions SHA pins, permissions, third-party action usage         |
| `npm-dependencies`           | `npm audit`, duplicate deps, outdated packages, CVE triage             |
| `credential-leak-prevention` | `.gitignore`, `.gitleaks.toml`, secrets in workflows, pre-commit hooks |
| `static-analysis`            | ESLint security rules, disabled rules, lint config gaps                |
| `app-security-services`      | OWASP Top 10 in `services/` code (injection, SSRF, auth, etc.)         |
| `app-security-libraries`     | OWASP Top 10 in `libraries/` code                                      |
| `app-security-products`      | OWASP Top 10 in `products/` code                                       |
| `cicd-pipeline`              | CI/CD workflow integrity, publish gates, audit gates                   |

### Topic selection process

1. **Read memory** — At the start of the audit, read all files in the memory
   directory. Look for previous `security-engineer-*.md` entries to find which
   topics have been covered and when.

2. **Build a coverage map** — From memory, construct a list of topics with their
   last audit date. Topics never audited go to the top. Among audited topics,
   the oldest goes next.

3. **Revisit threshold** — If every topic has been covered within the last 4
   runs (approximately 8 days), revisit the oldest one. This ensures periodic
   re-examination as the codebase evolves.

4. **Announce your pick** — Before starting the audit, state which topic you
   selected and why (e.g., "Selecting `app-security-services` — never audited"
   or "Revisiting `actions-supply-chain` — last audited 2026-03-20, oldest
   topic").

5. **Go deep** — Audit the selected topic thoroughly. Read every relevant file,
   not just a sample. For application security topics, read the actual source
   files in the target directory, don't just grep for patterns.

### Cross-referencing teammate observations

When reading memory, also check entries from other agents. The improvement coach
may have noted security-relevant patterns in traces. The release engineer may
have flagged dependency issues during releases. Use these observations to inform
your audit focus within the selected topic.

### Memory: what to record for security audits

When writing your memory entry at the end of the run, include these
audit-specific fields in addition to the standard agent memory fields:

- **Topic audited** — Which topic area and why it was selected
- **Coverage map** — Updated table of all topics with their last audit date
  (copy from memory, update the row for today's topic)
- **Findings summary** — What you found, severity, and disposition (fixed,
  spec'd, or deferred)
- **Deferred work** — Issues that need follow-up in a future run, with enough
  context that your next run can pick them up without re-investigating
- CVEs evaluated and their severity/status
- Policy violations found and whether they were fixed or spec'd

## 8. Audit Checklist

How to perform the deep review for the selected topic:

- Run `make audit` locally and report findings.
- Review `.github/workflows/` for unpinned actions, missing permissions, exposed
  secrets.
- Review `package.json` files for unnecessary or duplicate dependencies.
- Review `.gitignore` and `.gitleaks.toml` for coverage gaps.
- Review `eslint.config.js` for disabled security rules.
- Grep for common vulnerability patterns: `eval(`, `child_process.exec(`,
  `innerHTML`, `dangerouslySetInnerHTML`, `new Function(`, unsanitized template
  literals in SQL/shell contexts.

## 9. Output Requirements

Every audit must produce **both** output categories when applicable:

1. **Incremental fixes** — Commit with `fix(security):` on a `fix/` branch and
   open a PR. Batch all small fixes into a single PR.
2. **Specs for structural findings** — Commit with `spec(security):` on a
   `spec/` branch and open a PR per finding. Use the `spec` skill to produce
   `specs/{NNN}-{name}/spec.md`.

Do not list structural findings in the fix PR body without also filing spec PRs.
Each PR must be on an independent branch from `main`.
