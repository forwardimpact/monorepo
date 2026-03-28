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

## Policy Checklist

Each PR is evaluated against existing policies. The table below lists the check,
where the canonical rule lives, and what triage action to take on failure.

| #   | Check                                      | Policy source                            | On failure                                                                                 |
| --- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | All CI checks pass                         | CONTRIBUTING.md § Before Submitting a PR | **Fix** if caused by the PR's changes. If pre-existing on main, skip and recommend rebase. |
| 2   | Actions pinned to SHA with version comment | CONTRIBUTING.md § Security; security-audit § 1 | **Fix** — update all workflow files to the new SHA.                                        |
| 3   | No duplicate dependencies                  | CONTRIBUTING.md § Dependency Policy      | **Close** with explanation.                                                                |
| 4   | Version ranges aligned across workspaces   | CONTRIBUTING.md § Dependency Policy      | **Fix** — align all workspace ranges.                                                      |
| 5   | npm audit clean (`--audit-level=high`)     | CONTRIBUTING.md § Dependency Policy      | **Close** if the update introduces the vulnerability. Skip if pre-existing.                |
| 6   | No unnecessary dependencies                | CONTRIBUTING.md § Dependency Policy      | **Close** with explanation.                                                                |
| 7   | First-party or official org actions only   | security-audit § 1                       | **Close** with explanation.                                                                |
| 8   | Peer and transitive dependency compat      | CONTRIBUTING.md § Dependency Policy      | **Close** until co-dependent packages release compatible versions.                         |

### GitHub Actions SHA Inventory

When evaluating check 2, verify the PR updates **all** workflow files that
reference the action — not just the one Dependabot found. Current usage:

| Action                          | Workflow files                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `actions/checkout`              | check.yml, publish-npm.yml, publish-macos.yml, publish-skills.yml, website.yaml |
| `actions/setup-node`            | check.yml, publish-npm.yml, website.yaml                                        |
| `actions/configure-pages`       | website.yaml                                                                    |
| `actions/upload-pages-artifact` | website.yaml                                                                    |
| `actions/deploy-pages`          | website.yaml                                                                    |
| `denoland/setup-deno`           | publish-macos.yml                                                               |

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

Classify the PR and determine which checks apply. Check 1 (CI passes) applies to
every PR. Additional checks depend on the update type:

- **npm update** — labels include `javascript`. Also evaluate checks 3, 4, 5,
  6, 8.
- **GitHub Actions update** — labels include `github_actions`. Also evaluate
  checks 2, 7.
- **Both** — Evaluate all checks.

Determine the update type from the PR title and body:

- **Patch** (`x.y.Z`) — Low risk. Merge if all checks pass.
- **Minor** (`x.Y.0`) — Low risk. Merge if all checks pass.
- **Major** (`X.0.0`) — Requires closer review. Check changelogs for breaking
  changes, scope changes, and new transitive dependencies.

#### Check 8: Peer and Transitive Dependency Compatibility (npm major updates)

For every npm major version bump, verify the updated package does not break
co-installed packages. Run `npm ls <package>` on the PR branch and check for:

- **`invalid`** — a resolved version violates another package's declared range
  (peer or regular dependency). The major bump cannot land until those packages
  release compatible versions.
- **`deduped` across mismatched majors** — if the same package resolves to
  multiple major versions in the tree, the update may cause subtle runtime
  issues (e.g. type mismatches, duplicate registrations). Investigate before
  merging.

If the tree is clean (single version, no `invalid` markers), the check passes.

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
