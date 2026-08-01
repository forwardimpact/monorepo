---
name: kata-security-audit
description: >
  Perform a holistic security review of the repository. Assess GitHub Actions
  supply chain, dependency hygiene, credential leak controls, CI audit gates,
  and application-level vulnerabilities. Use when you review PRs for security
  impact, audit the repo posture, or investigate a reported vulnerability.
---

# Security Audit

## When to Use

- Audit the repository's security posture on a schedule (one topic per run)
- Review a PR for security impact
- Investigate a reported vulnerability

## Checklists

<do_confirm_checklist goal="Confirm audit topic was thoroughly checked">

- [ ] Ran the repository's security audit command locally. Reported the
      findings.
- [ ] Read every file in the topic's audit scope. Did not rely on grep results
      alone.
- [ ] Each finding cites a specific file path and line number.
- [ ] Each finding carries a category: mechanical fix, structural (spec), or
      observation.
- [ ] The coverage map shows today's date for the audited topic.

</do_confirm_checklist>

## Audit Areas

This section is reference material for each topic. The process selects one area
per run. It goes deep.

### 1. Supply Chain — GitHub Actions

- Every third-party action has a full SHA pin and a version comment (`# v4`).
- Workflows use only first-party (`actions/*`) or official org actions.
- All workflows must declare explicit `permissions` with least privilege.
- Dependabot is configured to propose updates to action SHAs.

### 2. Supply Chain — npm Dependencies

CONTRIBUTING.md § Dependency Policy holds the dependency policy. Also verify:

- Publish workflows gate on `npm audit` results
- No packages with known CVEs remain unpatched

### 3. Credential & Secret Leak Prevention

CONTRIBUTING.md § Security holds the rules. Also verify:

- `.gitignore` covers sensitive patterns (`.env`, credentials, keys)
- `.gitleaks.toml` allowlist exists for known false positives
- Secrets in workflows use `secrets.*`, with no hardcoded values

### 4. Application Security (OWASP Top 10)

Check for: injection (shell, SQL, template), broken auth, sensitive data
exposure, security misconfiguration (CORS, headers), vulnerable components
(`npm audit`), insufficient logging, SSRF, insecure deserialization (untrusted
YAML/JSON without schema validation).

### 5. CI/CD Security

Verify that publish workflows block on audit failures. Verify that CI/local
workflows run the same checks.

### 6. Local Audit Invariants

Libraries and services may declare audit-time invariants in their local
CLAUDE.md. Read the local CLAUDE.md when the selected topic covers that code.
Read it also when you review a PR that touches it. Apply every invariant it
declares.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Find the last audit date per topic in the coverage map. Canonical
topic-rotation runs (audit topics under § Audit Areas) write only to the wiki.
They never open a PR. Do **not** `gemba-wiki claim` for them. The claim contract
applies only when a caller invokes this skill from `kata-security-update`, or
when the run opens a PR (see
[memory-protocol § Active Claims](../../agents/x-memory-protocol.md#active-claims)).

### Step 1: Select Topic

Each run covers **one topic** in depth.

#### Topic areas

| Topic                        | What to audit                                               |
| ---------------------------- | ----------------------------------------------------------- |
| `actions-supply-chain`       | SHA pins, permissions, third-party action usage             |
| `npm-dependencies`           | `npm audit`, duplicates, outdated packages, CVE triage      |
| `credential-leak-prevention` | `.gitignore`, `.gitleaks.toml`, secrets in workflows, hooks |
| `app-security-services`      | OWASP Top 10 in `services/` code                            |
| `app-security-libraries`     | OWASP Top 10 in `libraries/` code                           |
| `app-security-products`      | OWASP Top 10 in `products/` code                            |
| `cicd-pipeline`              | Workflow integrity, publish gates, audit gates              |

#### Topic selection

1. Build the coverage map. Never-audited topics go first, then the oldest.
2. Apply the revisit threshold. If you covered all topics within the last 4
   runs, revisit the oldest.
3. Announce your pick and why before you start.
4. Go deep. Read every relevant file. Do not rely on a grep for patterns.

#### Topic-rotation budget rule

PR-review work is high-priority, but it displaces canonical topic rotation.
Check this skill's recent metrics rows. After PR review displaces two
consecutive runs, reserve the next run for topic rotation. Skip that
reservation if a critical vulnerability is open, or if `main` CI is red. Then
handle the safety issue first. Defer rotation to the following run.

### Step 2: Audit the Topic

Go deep on the selected topic with the audit area reference above. Read every
relevant file. Do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Every audit must produce all applicable categories of output. Classify each
finding with
[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests)
(mechanical fix vs structural spec vs unsettled Discussion). One
security-specific rule applies. A cross-team policy question goes to a
Discussion **before** any spec or fix that depends on the answer.

The agent profile defines branch names, commit conventions, and independence
rules.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Topic audited** — Which topic you chose and why
- **Coverage map** — Updated table of all topics with last audit date
- **Findings summary** — What you found, the severity, and the disposition
  (fixed/spec'd/deferred)
- **Deferred work** — Issues that need follow-up, with enough context to resume
- CVEs evaluated and their status
- Policy violations you found, and whether you fixed or spec'd them
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **Discussion** — Policy questions from the audit (e.g. "should we relax
  SHA-pinning for `actions/*`?") that need cross-team input before a spec.

Hold every published body to
[citation integrity](../../agents/x-citation-integrity.md).
