---
name: kata-security-update
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
- [ ] Root `overrides` cover every bumped workspace range (applies to **any** `*/package.json` diff — Dependabot, agent-authored, or direct human edits).

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
| Clean npm audit          | CONTRIBUTING.md § Dependency Policy | **close** if new vuln; **skip** if pre-existing               |
| No unnecessary deps      | CONTRIBUTING.md § Dependency Policy | **close** with explanation                                    |
| First-party actions only | kata-security-audit § 1             | **close** with explanation                                    |
| Peer/transitive compat   | CONTRIBUTING.md § Dependency Policy | **close** until co-dependent packages release compat versions |
| Override-range shadowing | CONTRIBUTING.md § Dependency Policy | **fix** — open follow-up override-bump PR before merging      |

When evaluating the SHA-pinning check, verify the PR updates **all** workflow
files referencing the action. See `references/sha-inventory.md` for the full
action-to-workflow mapping.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot` (per [Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md#on-boot-read-set)). The boot digest's `owned_priorities`, `claims`, and (when this skill reads Tier-2 surfaces) `storyboard_items` seed the rest of this skill's Process. Extract previous triage outcomes and packages that
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

#### Check 9: Override-Range Shadowing

Bun's resolver **replaces** (does not intersect) workspace ranges with root
`overrides`. A workspace `package.json` bump can be silently shadowed by a
stale override floor; a root override below a workspace range silently floors
that workspace under the policy minimum.

**Scope.** Fire on **any** PR whose diff touches `*/package.json` or root
`package.json` — Dependabot, agent-authored, or direct human edits. Originally
piloted on Dependabot bundles; widened to all vectors after a non-Dependabot
case (a floor-shadow on an agent-authored bump) tripped the same hazard.

**Procedure.**

1. For every package whose `*/package.json` range is bumped in the diff, grep
   the root `package.json` `overrides` block. If the package appears, verify
   the override range satisfies the bumped workspace range.
2. Run `bun install` on the PR branch, then `bun audit`.
3. If audit is **dirty for any package the diff attempts to bump**, the
   override is shadowing — open a follow-up `fix/security-audit-<date>-<pkg>-override`
   PR bumping the override floor **before** merging the original PR.
4. The inverse direction also fires: if a workspace range is **below** an
   existing override floor, the workspace silently regresses if the override
   is ever removed. Align the workspace range in the same PR.

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

**Rebase on new branch** — only CI failure is `vulnerability-scanning` and the
fix is already on `main` (stale audit base, not a PR-caused issue):

```sh
# Confirm: only vuln-scan fails and main has security fixes the PR base lacks
git log --oneline origin/main ^<pr-merge-base> -- '**/package.json' bun.lock

# If commits exist, rebase will fix the scan — create a superseding branch
git fetch origin <dependabot-branch>
git checkout -b chore/rebase-dependabot-<number> origin/<dependabot-branch>
git rebase origin/main
bun run check && bun run test && just audit
git push -u origin chore/rebase-dependabot-<number>
gh pr create --title "chore(deps): <original-title> (rebased)" \
  --body "Rebases Dependabot PR #<number> on current main to pick up security fixes."
gh pr close <number> --comment "Superseded by #<new-pr> — rebased on main to resolve stale vulnerability-scanning base."
```

> **Do not use `@dependabot rebase`.** GitHub Apps cannot trigger Dependabot
> comment commands — the command will always fail with "only users with push
> access." If a prior run already posted `@dependabot rebase` and received this
> reply, use the "Rebase on new branch" flow above. Do not retry the comment.

**Close** — policy violation cannot be fixed:

```sh
gh pr close <number> --comment "Dependabot triage: closing because <reason>. Policy: <which>."
```

### Step 4: Summary

```
| PR      | Title                          | Action | Reason                     |
| ------- | ------------------------------ | ------ | -------------------------- |
| #dep-a  | bump protobufjs 7.5.4 to 8.0.0 | close  | Check 8: peer incompatible |
| #dep-b  | bump upload-pages-artifact ... | fix    | Missing SHA pins           |
```

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **PR triage table** — Each PR with action, failed checks, and reason
- **Compatibility blockers** — Packages closed due to Check 8
- **Reverted merges** — PRs merged then reverted, with root cause
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.
