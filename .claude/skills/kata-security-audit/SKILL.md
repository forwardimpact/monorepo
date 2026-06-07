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

- [ ] Ran `just audit` locally and reported findings.
- [ ] Read every file in the topic's audit scope — not just grep results.
- [ ] Each finding cites a specific file path and line number.
- [ ] Each finding categorized: mechanical fix, structural (spec), or observation.
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

### 6. Library Audit Invariants (libbridge audit-time)

Apply the bridge-parity and timing-parity invariants when the selected topic is `app-security-libraries` or when reviewing any libbridge PR. Both codify SE's audit-time check; structural adoption stays in staff-engineer's lane.

- **Bridge-parity invariant** — For each surface added to `BEGIN_ALLOWED_SURFACES` beyond `github-discussions`, verify the bridge invokes `prepareLinkResume` + `putPendingDispatch` with the same `(link_token, surface, surface_user_id, discussion_id)` shape OR documents an explicit opt-out rationale in the bridge README; flag any surface that falls through to a `PutPendingDispatch`-less path while still issuing dispatch.
- **Timing-parity convention** (libbridge-wide) — Any new `CallbackRegistry` (or sibling registry) lookup method that scans a stored collection MUST maintain a secondary index keyed on the lookup field so hits and misses share an O(1) path, OR carry an explicit `scan-by-design` comment with security review of response-shape parity.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Find last audit dates per topic in the coverage map. Canonical topic-rotation runs (audit topics under § Audit Areas) write only to the wiki and never open a PR — do **not** `fit-wiki claim` for them; the claim contract applies only when this skill is invoked from `kata-security-update` or otherwise opens a PR (see [memory-protocol § Claims](../../agents/references/memory-protocol.md#claims)).

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

PR-review work is high-priority but displaces canonical topic rotation. The
budget rule restores rotation cadence without breaching PR-review turnaround.

**Rule**: After **2 consecutive PR-review-displacement slots** in the same
vocabulary class (PR-review note vs canonical-topic note), the next SE Assess
invocation reserves the slot for canonical topic rotation unless a critical-PR
safety carve-out applies.

**Counter mechanics** — derived live from
`wiki/metrics/kata-security-audit/2026.csv`, walking rows backward from latest:

| `note` shape                       | Effect on counter                                  |
| ---------------------------------- | -------------------------------------------------- |
| matches `*-pass[0-9]+$`            | **STOP** (reset to 0)                              |
| matches `*-pr-review-*`            | **+1**                                             |
| matches `^storyboard-*` (non-pass) | **+1**                                             |
| matches `*-off-cadence*`           | **+1**                                             |
| matches `*-ci-red-defer-*`         | **neutral** (safety-deferral does not punish rule) |

Rule fires when counter ≥ 2 at next Assess.

**Safety carve-outs** — rule does NOT fire if any apply:

- **CRITICAL Dependabot PR open** — vulnerability with CVSS ≥ 7.0 in any open
  Dependabot PR.
- **Main CI red** — at least one required check on `origin/main` HEAD has
  `conclusion=failure` (per
  `gh api repos/forwardimpact/monorepo/commits/<sha>/check-runs`).
- **Plan-phase PR covers a live security finding** (class rule) — PR branch
  matches `plan/NNN-*` AND the spec body cites an open security Issue, an
  active kill-switch, or a HIGH-severity SE audit finding; carve-out remains
  time-bounded by the release-cut window noted in plan-a § Atomic release
  coupling. *Replaces case-by-case enumeration of plan-phase PRs covering live
  security findings — predicate matching means future qualifying plan PRs
  inherit the carve-out without a SKILL.md amendment.*

**Collision contingency** (main CI red AND reserved rotation slot on the same
day):

- SE is canonical repair-owner only for `secret-scanning` failures. If
  root cause = secret-scanning → rule yields, SE repairs, records
  `note=*-ci-red-secret-scanning-repair`.
- Otherwise (RE/Staff repair-owner) → rule defers rotation 24h on safety
  grounds. Assess records `note=*-ci-red-defer-<reason>`.

### Step 2: Audit the Topic

Go deep on the selected topic using the audit area reference above. Read every
relevant file — do not rely on grep alone. Ground findings in specific file
paths and line numbers.

### Step 3: Act on Findings

Every audit must produce all applicable categories of output. Classify each
finding with
[work-definition.md § Classification tests](../../agents/references/work-definition.md#classification-tests)
(mechanical fix vs structural spec vs unsettled Discussion). Security-specific:
a cross-team policy question goes to a Discussion **before** any spec or fix
that depends on the answer.

Branch naming, commit conventions, and independence rules are defined in the
agent profile.

## Memory: what to record

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
[coordination-protocol.md](../../agents/references/coordination-protocol.md)):

- **Discussion** — Policy questions surfaced from audit (e.g. "should we relax
  SHA-pinning for `actions/*`?") that need cross-team input before a spec.
