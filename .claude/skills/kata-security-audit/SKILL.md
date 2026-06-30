---
name: kata-security-audit
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

- [ ] Ran the repository's security audit command locally and reported
      findings.
- [ ] Read every file in the topic's audit scope — not just grep results.
- [ ] Each finding cites a specific file path and line number.
- [ ] Each finding categorized: mechanical fix, structural (spec), or
      observation.
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

### 4. Application Security (OWASP Top 10)

Check for: injection (shell, SQL, template), broken auth, sensitive data
exposure, security misconfiguration (CORS, headers), vulnerable components
(`npm audit`), insufficient logging, SSRF, insecure deserialization (untrusted
YAML/JSON without schema validation).

### 5. CI/CD Security

Verify publish workflows block on audit failures and CI/local workflows run the
same checks.

### 6. Local Audit Invariants

Libraries and services may declare audit-time invariants in their local
CLAUDE.md. When the selected topic covers that code, or when reviewing a PR
that touches it, read the local CLAUDE.md and apply every invariant it
declares.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot --agent <self>` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and (when this skill reads
Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Find
last audit dates per topic in the coverage map. Canonical topic-rotation runs
(audit topics under § Audit Areas) write only to the wiki and never open a PR —
do **not** `fit-wiki claim` for them; the claim contract applies only when this
skill is invoked from `kata-security-update` or otherwise opens a PR (see
[memory-protocol § Claims](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-memory-protocol.md#claims)).

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

1. Build coverage map — never-audited topics go first, then oldest.
2. Revisit threshold — if all topics covered within last 4 runs, revisit oldest.
3. Announce your pick and why before starting.
4. Go deep — read every relevant file, not just grep for patterns.

#### Topic-rotation budget rule

PR-review work is high-priority but displaces canonical topic rotation. After
two consecutive runs displaced by PR review (check this skill's recent
metrics rows), reserve the next run for topic rotation — unless a critical
vulnerability is open or `main` CI is red, in which case handle the safety
issue first and defer rotation to the following run.

### Step 2: Audit the Topic

Go deep on the selected topic using the audit area reference above. Read every
relevant file — do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Every audit must produce all applicable categories of output. Classify each
finding with
[work-definition.md § Classification tests](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-work-definition.md#classification-tests)
(mechanical fix vs structural spec vs unsettled Discussion). Security-specific:
a cross-team policy question goes to a Discussion **before** any spec or fix
that depends on the answer.

Branch naming, commit conventions, and independence rules are defined in the
agent profile.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Topic audited** — Which topic and why selected
- **Coverage map** — Updated table of all topics with last audit date
- **Findings summary** — What found, severity, disposition
  (fixed/spec'd/deferred)
- **Deferred work** — Issues needing follow-up with enough context to resume
- CVEs evaluated and their status
- Policy violations found and whether fixed or spec'd
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-coordination-protocol.md)):

- **Discussion** — Policy questions surfaced from audit (e.g. "should we relax
  SHA-pinning for `actions/*`?") that need cross-team input before a spec.

[Citation integrity](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-citation-integrity.md):
every cited SHA must resolve on its referenced repo, or the body is not
published.
