---
name: dependabot-triage
description: >
  Triage open Dependabot PRs by applying repository policies from
  CONTRIBUTING.md. Merge PRs that pass all checks and policies, fix minor
  issues on a new branch, or close PRs that violate policy.
---

# Dependabot Triage

Triage all open Dependabot pull requests against the repository's dependency and
security policies, then take action: merge, fix, or close each PR.

## When to Use

- Reviewing and actioning open Dependabot PRs
- Ensuring dependency updates comply with CONTRIBUTING.md and security policies
- Batch-processing accumulated Dependabot PRs

## Prerequisites

The `gh` CLI must be installed and authenticated. See the `gh-cli` skill for
installation instructions. Verify with:

```sh
gh auth status
```

## Policies

These policies are derived from CONTRIBUTING.md, CLAUDE.md, and the
security-audit skill. Every Dependabot PR must be evaluated against **all** of
them.

### Policy 1: CI Checks Pass

All CI checks (lint, format, test, e2e, audit) must pass. A PR with any failing
check cannot be merged.

**Action if violated:** If the failure is in the PR's own changes (e.g. a
breaking API change needs a code fix), attempt to fix it on a new branch. If the
failure is environmental or unrelated to the PR's changes (e.g. a flaky test or
a pre-existing audit failure on main), note it in the triage report but do not
close the PR — recommend a rebase after main is fixed.

### Policy 2: GitHub Actions Pinned to SHA

From CLAUDE.md Security section: "All third-party actions are pinned to SHA
hashes. Use Dependabot for updates. Never change a pin to a tag."

When Dependabot updates a GitHub Action, verify:

- The `uses:` line is pinned to a full 40-character SHA hash
- A version comment (e.g. `# v5`) follows the SHA on the same line
- The SHA is **not** replaced with a tag reference (e.g. `@v5`)

The current pinned actions in the repository are:

| Action                          | Workflow files using it                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `actions/checkout`              | check.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml, website.yaml |
| `actions/setup-node`            | check.yml, publish-npm.yml, website.yaml                                        |
| `actions/configure-pages`       | website.yaml                                                                    |
| `actions/upload-pages-artifact` | website.yaml                                                                    |
| `actions/deploy-pages`          | website.yaml                                                                    |
| `denoland/setup-deno`           | publish-macos.yml                                                               |

When a GitHub Actions PR updates one action, **all workflow files** that
reference that action must be updated to the same new SHA. If Dependabot only
updated some files, that is a fixable issue.

**Action if violated:** Fix on a new branch — update all workflow files to use
the new SHA with the correct version comment.

### Policy 3: No Duplicate Dependencies

From CONTRIBUTING.md: "Consolidate packages serving the same purpose (one YAML
parser, one markdown renderer)."

A new dependency (or a major version bump that changes a package's scope) must
not introduce overlap with existing packages.

**Action if violated:** Close the PR with a comment explaining the conflict.

### Policy 4: Version Range Alignment

From CONTRIBUTING.md: "Align version ranges for the same package across all
workspaces."

If the updated package appears in multiple `package.json` files, all must use
compatible version ranges after the update.

**Action if violated:** Fix on a new branch — align all workspace version
ranges.

### Policy 5: npm Audit Clean

From CONTRIBUTING.md: "Run npm audit after adding dependencies" and
`npm audit --audit-level=high` must pass.

**Action if violated:** If the update itself introduces a high-severity
vulnerability, close the PR. If the audit failure is pre-existing and unrelated,
note it but do not block the PR on it.

### Policy 6: No Unnecessary Dependencies

From CONTRIBUTING.md: "Minimize external dependencies. Use existing packages."

Major version bumps that pull in significant new transitive dependencies should
be scrutinised. Check `npm ls <package>` and the changelog for scope changes.

**Action if violated:** Close the PR with a comment explaining why.

### Policy 7: First-Party or Official Actions Only

From the security-audit skill: "Only first-party (GitHub `actions/*`) or
official org actions are permitted."

A Dependabot PR that introduces a new action from a personal maintainer account
must be closed.

**Action if violated:** Close the PR with a comment.

## Process

### Step 1: List Open Dependabot PRs

```sh
gh pr list --author 'app/dependabot' --state open \
  --json number,title,headRefName,labels,createdAt
```

### Step 2: Evaluate Each PR

For each open PR, gather details:

```sh
gh pr view <number> --json title,body,headRefName,files,commits,statusCheckRollup,mergeable,mergeStateStatus
gh pr diff <number>
```

Classify the PR:

- **npm update** — labels include `javascript`. Check policies 3, 4, 5, 6.
- **GitHub Actions update** — labels include `github_actions`. Check policies
  2, 7.
- **Both** — Check all policies.

Determine the update type from the PR title and body:

- **Patch** (`x.y.Z`) — Low risk. Merge if all checks pass.
- **Minor** (`x.Y.0`) — Low risk. Merge if all checks pass.
- **Major** (`X.0.0`) — Requires closer review. Check changelogs for breaking
  changes, scope changes, and new transitive dependencies.

### Step 3: Check CI Status

```sh
gh pr checks <number>
```

All five checks must pass: lint, format, test, e2e, audit.

If checks are failing, determine whether the failure is caused by the PR's
changes or is pre-existing on main. Compare with:

```sh
gh run list --branch main --limit 1 --json conclusion
```

### Step 4: Take Action

For each PR, take exactly one action:

#### Merge

When **all policies pass** and **all CI checks are green**:

```sh
gh pr merge <number> --squash --auto
```

Add a brief comment before merging:

```sh
gh pr comment <number> --body "Dependabot triage: all policies pass, CI green. Merging."
```

#### Fix on New Branch

When minor policy violations can be fixed (e.g. missing SHA pins in some
workflow files, version range misalignment):

1. Claude Code **cannot push to Dependabot branches** (branches not initiated by
   itself). Create a new branch from the Dependabot branch:

```sh
git fetch origin <dependabot-branch>
git checkout -b fix/dependabot-<number> origin/<dependabot-branch>
```

2. Make the necessary fixes (update workflow files, align versions, etc.)
3. Run `npm run check` and `make audit` to verify fixes
4. Commit and push the fix branch:

```sh
git add <changed-files>
git commit -m "fix(deps): <description of fix for PR #number>"
git push -u origin fix/dependabot-<number>
```

5. Create a new PR from the fix branch targeting `main`:

```sh
gh pr create \
  --title "chore(deps): <original update description> (fixed)" \
  --body "$(cat <<'EOF'
## Summary

Fixes policy violations in Dependabot PR #<number> and incorporates the
dependency update.

- Original PR: #<number>
- Fixes applied: <list fixes>

## Test plan

- [ ] All CI checks pass
- [ ] Policy compliance verified
EOF
)"
```

6. Close the original Dependabot PR:

```sh
gh pr close <number> --comment "Superseded by #<new-pr-number> which includes fixes for policy violations."
```

#### Close

When a policy violation cannot be fixed or the update is undesirable:

```sh
gh pr close <number> --comment "Dependabot triage: closing because <reason>. Policy: <which policy>."
```

### Step 5: Report

After processing all PRs, produce a summary table:

```
| PR  | Title                          | Action | Reason                     |
| --- | ------------------------------ | ------ | -------------------------- |
| #67 | bump protobufjs 7.5.4 to 8.0.0 | merge  | All policies pass, CI green |
| #61 | bump upload-pages-artifact ...  | fix    | Missing SHA pins in ...    |
| #58 | bump configure-pages ...        | close  | Introduces tag reference   |
```

Include any PRs that were skipped (e.g. waiting for main to be fixed) with a
note explaining why.
