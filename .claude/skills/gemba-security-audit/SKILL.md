---
name: gemba-security-audit
description: >
  Perform a holistic security review of the monorepo. Assess GitHub Actions
  supply chain, dependency hygiene, credential leak controls, CI audit gates,
  and application-level vulnerabilities. Use when reviewing PRs for security
  impact, auditing the repo posture, or investigating a reported vulnerability.
---

# Security Audit

## When to Use

- Scheduled audit of the monorepo's security posture (one topic per run)
- Reviewing a PR for security impact
- Investigating a reported vulnerability

## Checklists

<do_confirm_checklist goal="Confirm audit topic was thoroughly checked">

- [ ] Ran `just audit` locally and reported findings.
- [ ] Read every file in the topic's audit scope — not just grep results.
- [ ] Each finding cites a specific file path and line number.
- [ ] Each finding categorized: trivial fix, structural (spec), or observation.
- [ ] Coverage map updated with today's date for the audited topic.

</do_confirm_checklist>

## Audit Areas

Reference material for each topic. The process selects one area per run and goes
deep.

### 1. Supply Chain — GitHub Actions

- All third-party actions pinned to full SHA with version comment (`# v4`).
- Only first-party (`actions/*`) or official org actions permitted.
- All workflows must declare explicit `permissions` with least privilege.
- Dependabot configured to propose updates to action SHAs.

### 2. Supply Chain — npm Dependencies

Dependency policy in CONTRIBUTING.md § Dependency Policy. Additionally verify:

- Publish workflows gate on `npm audit` results
- No packages with known CVEs remain unpatched

### 3. Credential & Secret Leak Prevention

Rules in CONTRIBUTING.md § Security. Additionally verify:

- `.gitignore` covers sensitive patterns (`.env`, credentials, keys)
- `.gitleaks.toml` allowlist exists for known false positives
- Secrets in workflows use `secrets.*` — no hardcoded values

### 4. Static Analysis

Verify no security rules disabled in `eslint.config.js` without inline
justification.

### 5. Application Security (OWASP Top 10)

Check for: injection (shell, SQL, template), broken auth, sensitive data
exposure, security misconfiguration (CORS, headers), vulnerable components
(`npm audit`), insufficient logging, SSRF, insecure deserialization (untrusted
YAML/JSON without schema validation).

### 6. CI/CD Security

Verify publish workflows block on audit failures and CI/local workflows run the
same checks.

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Find last audit dates per topic in the coverage map.

### Step 1: Select Topic

Each run covers **one topic** in depth.

#### Topic areas

| Topic                        | What to audit                                               |
| ---------------------------- | ----------------------------------------------------------- |
| `actions-supply-chain`       | SHA pins, permissions, third-party action usage             |
| `npm-dependencies`           | `npm audit`, duplicates, outdated packages, CVE triage      |
| `credential-leak-prevention` | `.gitignore`, `.gitleaks.toml`, secrets in workflows, hooks |
| `static-analysis`            | ESLint security rules, disabled rules, config gaps          |
| `app-security-services`      | OWASP Top 10 in `services/` code                            |
| `app-security-libraries`     | OWASP Top 10 in `libraries/` code                           |
| `app-security-products`      | OWASP Top 10 in `products/` code                            |
| `cicd-pipeline`              | Workflow integrity, publish gates, audit gates              |

#### Topic selection

1. Build coverage map — never-audited topics go first, then oldest.
2. Revisit threshold — if all topics covered within last 4 runs, revisit oldest.
3. Announce your pick and why before starting.
4. Go deep — read every relevant file, not just grep for patterns.

### Step 2: Audit the Topic

Go deep on the selected topic using the audit area reference above. Read every
relevant file — do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Every audit must produce both categories when applicable — incremental fixes on
a `fix/` branch and specs for structural findings on `spec/` branches. Branch
naming, commit conventions, and independence rules are defined in the agent
profile.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Topic audited** — Which topic and why selected
- **Coverage map** — Updated table of all topics with last audit date
- **Findings summary** — What found, severity, disposition
  (fixed/spec'd/deferred)
- **Deferred work** — Issues needing follow-up with enough context to resume
- CVEs evaluated and their status
- Policy violations found and whether fixed or spec'd
