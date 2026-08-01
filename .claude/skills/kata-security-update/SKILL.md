---
name: kata-security-update
description: >
  Apply security updates to the repository. Triage open Dependabot PRs against
  repository policies, review npm audit findings, and action dependency
  vulnerabilities. Merge PRs that pass all checks, fix minor issues on a new
  branch, or close PRs that violate policy.
---

# Security Update

Apply security updates to the repository against its dependency and security
policies. Security updates are dependency bumps, vulnerability remediation, and
Dependabot PR triage.

## When to Use

- Review and action open Dependabot PRs
- Batch-process accumulated Dependabot PRs
- Address npm audit findings or CVE advisories
- Apply security patches to dependencies

## Checklists

<do_confirm_checklist goal="Verify dependency PR meets repo policies">

- [ ] All CI checks pass.
- [ ] Actions pinned to SHA with version comment. Bumps move forward.
- [ ] No duplicate dependencies.
- [ ] Version ranges aligned across workspaces.
- [ ] `npm audit` clean (`--audit-level=high`).
- [ ] No unnecessary dependencies.
- [ ] First-party or official org actions only.
- [ ] Verified that peer and transitive dependencies are compatible.
- [ ] Root `overrides` cover every bumped workspace range (applies to **any**
      `*/package.json` diff: Dependabot, agent-authored, or direct human
      edits).

</do_confirm_checklist>

### Policy failure dispositions

When a check fails, the disposition depends on the check. The table below maps
each check to its policy source and failure action: merge, fix, close, or skip.

| Check                    | Policy source                       | Failure action                                                |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------- |
| CI checks                | CONTRIBUTING.md § Before Submitting | **fix** if PR-caused. **skip** if pre-existing on main        |
| SHA-pinned actions       | CONTRIBUTING.md § Security          | **fix** — update all workflow files to the new SHA            |
| No duplicate deps        | CONTRIBUTING.md § Dependency Policy | **close** with explanation                                    |
| Aligned version ranges   | CONTRIBUTING.md § Dependency Policy | **fix** — align all workspace ranges                          |
| Clean npm audit          | CONTRIBUTING.md § Dependency Policy | **close** if new vuln. **skip** if pre-existing               |
| No unnecessary deps      | CONTRIBUTING.md § Dependency Policy | **close** with explanation                                    |
| First-party actions only | kata-security-audit § 1             | **close** with explanation                                    |
| Pin direction (forward)  | CONTRIBUTING.md § Security          | **close** — record detection evidence. Route the tag that lags to release-engineer |
| Peer/transitive compat   | CONTRIBUTING.md § Dependency Policy | **close** until co-dependent packages release compat versions |
| Override-range shadowing | CONTRIBUTING.md § Dependency Policy | **fix** — open follow-up override-bump PR before the merge    |

When you evaluate the SHA-pinning check, verify the PR updates **all** workflow
files that reference the action. See `references/sha-inventory.md` for how to
derive the action-to-workflow inventory. Also verify pin **direction**.
`gh api repos/{owner}/{repo}/compare/{old}...{new} --jq .status` must return
`ahead`. A `behind` or `diverged` status is a downgrade. Then **close** it even
with green CI. Route a tag-hygiene issue to release-engineer, because a mutable
major tag lags the release Dependabot tracks through the `# v1` comment.

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract previous triage outcomes and packages that repeatedly fail
Check 8.

### Step 1: List Open Dependabot PRs

`list` open changes authored by `app/dependabot`. Read the number, title, head
branch, labels, and creation time
([work-trackers.md](../../agents/x-work-trackers.md)).

### Step 2: Evaluate Each PR

`read` the change's title, body, head branch, files, commits, CI status,
mergeability, and diff
([work-trackers.md](../../agents/x-work-trackers.md)).

Determine the update type from the title: **patch** (low risk), **minor** (low
risk), **major** (check changelogs for breaking changes and transitive deps).

#### Check 8: Peer/Transitive Compatibility (npm major updates)

List the dependency tree on the PR branch (e.g. `npm ls`). Look for:
**`invalid`** (close), **nested duplicates** in the lock file (close), or
**`deduped` across mismatched majors** (investigate before you merge).

#### Check 9: Override-Range Shadowing

Resolvers **replace** (do not intersect) workspace ranges with root
`overrides`. A stale override floor can silently shadow a workspace
`package.json` bump. A root override below a workspace range silently floors
that workspace under the policy minimum.

**Scope.** Fire on **any** PR whose diff touches `*/package.json` or root
`package.json`: Dependabot, agent-authored, or direct human edits.

**Procedure.**

1. For every package whose `*/package.json` range the diff bumps, grep the root
   `package.json` `overrides` block. If the package appears, verify the
   override range satisfies the bumped workspace range.
2. Run the package manager's install on the PR branch. Then run its audit.
3. If audit is **dirty for any package the diff attempts to bump**, the
   override shadows the bump. Open a follow-up `fix/` PR that bumps the
   override floor **before** you merge the original PR.
4. The inverse direction also fires. A workspace range can sit **below** a
   current override floor. The workspace then silently regresses if anyone
   removes the override. Align the workspace range in the same PR.

### Step 3: Take Action

Commit and push fix work **before** a long verification run. Never end the
session with verification still in the background. It dies at turn end. The
PR's CI is the verification of record. Hold every PR or comment body to
[Citation integrity](../../agents/x-citation-integrity.md).

Each disposition uses tracker operations from
[work-trackers.md](../../agents/x-work-trackers.md).

**Merge** — all policies pass and CI is green. Post a `comment` with
"Dependabot triage: all policies pass, CI green. Merging." Then run
`merge-change` (squash).

**Fix on new branch** — you can fix the minor policy violations (Claude Code
cannot push to Dependabot branches). Branch off the Dependabot branch. Make the
fixes. Run the repository's check/test/audit commands. Then `open-change` titled
`chore(deps): <description> (fixed)` with body "Fixes policy violations in
Dependabot PR #<number>." Finally `close` the original change with comment
"Superseded by #<new-pr> with policy fixes."

**Rebase on new branch** — the only CI failure is `vulnerability-scanning`, and
the fix is already on `main`. The audit base is stale. The PR did not cause the
issue.

```sh
# Confirm: only vuln-scan fails and main has security fixes the PR base lacks
git log --oneline origin/main ^<pr-merge-base> -- '**/package.json' <lockfile>
```

If commits exist, a rebase of the Dependabot branch on `origin/main` fixes the
scan. Run the repository's check/test/audit commands. Then `open-change` titled
`chore(deps): <original-title> (rebased)` with body "Rebases Dependabot PR
`#<number>` on current main to pick up security fixes." Then `close` the
original change with comment "Superseded by #<new-pr> — rebased on main to
resolve stale vulnerability-scanning base." (`open-change` and `close`:
[work-trackers.md](../../agents/x-work-trackers.md).)

> **Do not use `@dependabot rebase`.** GitHub Apps cannot trigger Dependabot
> comment commands. The command always fails with "only users with push
> access." If a prior run posted `@dependabot rebase` and got this reply, use
> the "Rebase on new branch" flow above. Do not retry the comment.

**Close** — you cannot fix the policy violation. `close` the change with comment
"Dependabot triage: closing because <reason>. Policy: <which>."
([work-trackers.md](../../agents/x-work-trackers.md)).

### Step 4: Summary

```text
| PR      | Title                          | Action | Reason                     |
| ------- | ------------------------------ | ------ | -------------------------- |
| #dep-a  | bump protobufjs 7.5.4 to 8.0.0 | close  | Check 8: peer incompatible |
| #dep-b  | bump upload-pages-artifact ... | fix    | Missing SHA pins           |
```

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **PR triage table** — Each PR with action, failed checks, and reason
- **Compatibility blockers** — Packages closed due to Check 8
- **Reverted merges** — PRs merged then reverted, with root cause
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the eligibility rule.
