---
name: security-update
description: >
  Apply security updates to the repository. Triage open Dependabot PRs against
  repository policies, review npm audit findings, and action dependency
  vulnerabilities. Merge PRs that pass all checks, fix minor issues on a new
  branch, or close PRs that violate policy.
---

# Security Update

Apply security updates to the repository — dependency bumps, vulnerability
remediation, and Dependabot PR triage — against the repository's dependency and
security policies.

## When to Use

- Reviewing and actioning open Dependabot PRs
- Batch-processing accumulated Dependabot PRs
- Addressing npm audit findings or CVE advisories
- Applying security patches to dependencies

## Prerequisites

The `gh` CLI must be installed and authenticated. Verify with `gh auth status`.

## Policy Checklist

| #   | Check                                      | Policy source                                  | On failure                                                                   |
| --- | ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | All CI checks pass                         | CONTRIBUTING.md § Before Submitting a PR       | **Fix** if caused by PR. If pre-existing on main, skip and recommend rebase. |
| 2   | Actions pinned to SHA with version comment | CONTRIBUTING.md § Security; security-audit § 1 | **Fix** — update all workflow files to the new SHA.                          |
| 3   | No duplicate dependencies                  | CONTRIBUTING.md § Dependency Policy            | **Close** with explanation.                                                  |
| 4   | Version ranges aligned across workspaces   | CONTRIBUTING.md § Dependency Policy            | **Fix** — align all workspace ranges.                                        |
| 5   | npm audit clean (`--audit-level=high`)     | CONTRIBUTING.md § Dependency Policy            | **Close** if update introduces vulnerability. Skip if pre-existing.          |
| 6   | No unnecessary dependencies                | CONTRIBUTING.md § Dependency Policy            | **Close** with explanation.                                                  |
| 7   | First-party or official org actions only   | security-audit § 1                             | **Close** with explanation.                                                  |
| 8   | Peer and transitive dependency compat      | CONTRIBUTING.md § Dependency Policy            | **Close** until co-dependent packages release compatible versions.           |

### GitHub Actions SHA Inventory

When evaluating check 2, verify the PR updates **all** workflow files that
reference the action:

| Action                          | Workflow files                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`              | check-quality.yml, check-test.yml, check-security.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml, website.yaml |
| `actions/setup-node`            | check-quality.yml, check-test.yml, check-security.yml, publish-npm.yml, website.yaml                                        |
| `actions/configure-pages`       | website.yaml                                                                                                                |
| `actions/upload-pages-artifact` | website.yaml                                                                                                                |
| `actions/deploy-pages`          | website.yaml                                                                                                                |
| `denoland/setup-deno`           | publish-macos.yml                                                                                                           |

## Process

### Step 0: Read Memory

Read all memory files. Extract previous triage outcomes and packages that
repeatedly fail Check 8.

### Step 1: List Open Dependabot PRs

```sh
gh pr list --author 'app/dependabot' --state open \
  --json number,title,headRefName,labels,createdAt
```

### Step 2: Evaluate Each PR

```sh
gh pr view <number> --json title,body,headRefName,files,commits,statusCheckRollup,mergeable,mergeStateStatus
gh pr diff <number>
```

Determine update type from title: **patch** (low risk), **minor** (low risk),
**major** (check changelogs for breaking changes and transitive deps).

#### Check 8: Peer/Transitive Compatibility (npm major updates)

Run `bun pm ls` on the PR branch. Look for:

- **`invalid`** — resolved version violates another package's range. Close.
- **Nested duplicates in `bun.lock`** — lockfile creates nested entry for old
  major. Close until co-dependents release compatible ranges.
- **`deduped` across mismatched majors** — investigate before merging.

### Step 3: Take Action

#### Merge — all policies pass, CI green:

```sh
gh pr comment <number> --body "Dependabot triage: all policies pass, CI green. Merging."
gh pr merge <number> --squash --auto
```

#### Fix on new branch — minor policy violations fixable:

Claude Code cannot push to Dependabot branches. Create a new branch:

```sh
git fetch origin <dependabot-branch>
git checkout -b fix/dependabot-<number> origin/<dependabot-branch>
# Make fixes, run bun run check && just audit
git commit -m "fix(deps): <description for PR #number>"
git push -u origin fix/dependabot-<number>
gh pr create --title "chore(deps): <description> (fixed)" \
  --body "Fixes policy violations in Dependabot PR #<number>."
gh pr close <number> --comment "Superseded by #<new-pr> with policy fixes."
```

#### Close — policy violation cannot be fixed:

```sh
gh pr close <number> --comment "Dependabot triage: closing because <reason>. Policy: <which>."
```

### Step 4: Summary

```
| PR  | Title                          | Action | Reason                     |
| --- | ------------------------------ | ------ | -------------------------- |
| #67 | bump protobufjs 7.5.4 to 8.0.0 | close  | Check 8: peer incompatible |
| #61 | bump upload-pages-artifact ...  | fix    | Missing SHA pins           |
```

### Memory: what to record

Include these fields in addition to standard agent memory fields:

- **PR triage table** — Each PR with action, failed checks, and reason
- **Compatibility blockers** — Packages closed due to Check 8
- **Reverted merges** — PRs merged then reverted, with root cause
