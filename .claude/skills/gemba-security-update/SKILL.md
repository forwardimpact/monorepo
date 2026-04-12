---
name: gemba-security-update
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

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical query shapes used in the steps below.

## Checklists

<do_confirm_checklist goal="Verify dependency PR meets repo policies">

- [ ] All CI checks pass.
- [ ] Actions pinned to SHA with version comment.
- [ ] No duplicate dependencies.
- [ ] Version ranges aligned across workspaces.
- [ ] `npm audit` clean (`--audit-level=high`).
- [ ] No unnecessary dependencies.
- [ ] First-party or official org actions only.
- [ ] Peer and transitive dependency compatibility verified.

</do_confirm_checklist>

### Policy failure dispositions

When a check fails, the disposition depends on the check. The table below maps
each check to its policy source and failure action — merge, fix, close, or skip.

| Check                    | Policy source                       | Failure action                                                |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------- |
| CI checks                | CONTRIBUTING.md § Before Submitting | **fix** if PR-caused; **skip** if pre-existing on main        |
| SHA-pinned actions       | CONTRIBUTING.md § Security          | **fix** — update all workflow files to the new SHA            |
| No duplicate deps        | CONTRIBUTING.md § Dependency Policy | **close** with explanation                                    |
| Aligned version ranges   | CONTRIBUTING.md § Dependency Policy | **fix** — align all workspace ranges                          |
| Clean npm audit          | CONTRIBUTING.md § Dependency Policy | **close** if update introduces vuln; **skip** if pre-exist    |
| No unnecessary deps      | CONTRIBUTING.md § Dependency Policy | **close** with explanation                                    |
| First-party actions only | gemba-security-audit § 1            | **close** with explanation                                    |
| Peer/transitive compat   | CONTRIBUTING.md § Dependency Policy | **close** until co-dependent packages release compat versions |

When evaluating the SHA-pinning check, verify the PR updates **all** workflow
files referencing the action. See `references/sha-inventory.md` for the full
action-to-workflow mapping.

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Extract previous triage outcomes and packages that
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

Run `bun pm ls` on the PR branch. Look for: **`invalid`** (close), **nested
duplicates** in `bun.lock` (close), or **`deduped` across mismatched majors**
(investigate before merging).

### Step 3: Take Action

**Merge** — all policies pass, CI green:

```sh
gh pr comment <number> --body "Dependabot triage: all policies pass, CI green. Merging."
gh pr merge <number> --squash --auto
```

**Fix on new branch** — minor policy violations fixable (Claude Code cannot push
to Dependabot branches):

```sh
git fetch origin <dependabot-branch>
git checkout -b fix/dependabot-<number> origin/<dependabot-branch>
# Make fixes, run bun run check && bun run test && just audit
git commit -m "fix(deps): <description for PR #number>"
git push -u origin fix/dependabot-<number>
gh pr create --title "chore(deps): <description> (fixed)" \
  --body "Fixes policy violations in Dependabot PR #<number>."
gh pr close <number> --comment "Superseded by #<new-pr> with policy fixes."
```

**Close** — policy violation cannot be fixed:

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

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **PR triage table** — Each PR with action, failed checks, and reason
- **Compatibility blockers** — Packages closed due to Check 8
- **Reverted merges** — PRs merged then reverted, with root cause
