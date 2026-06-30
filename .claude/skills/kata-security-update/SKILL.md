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
- [ ] Actions pinned to SHA with version comment; bumps move forward.
- [ ] No duplicate dependencies.
- [ ] Version ranges aligned across workspaces.
- [ ] `npm audit` clean (`--audit-level=high`).
- [ ] No unnecessary dependencies.
- [ ] First-party or official org actions only.
- [ ] Peer and transitive dependency compatibility verified.
- [ ] Root `overrides` cover every bumped workspace range (applies to **any**
      `*/package.json` diff — Dependabot, agent-authored, or direct human
      edits).

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
| Pin direction (forward)  | CONTRIBUTING.md § Security          | **close** — record detection evidence; route lagging tag to release-engineer |
| Peer/transitive compat   | CONTRIBUTING.md § Dependency Policy | **close** until co-dependent packages release compat versions |
| Override-range shadowing | CONTRIBUTING.md § Dependency Policy | **fix** — open follow-up override-bump PR before merging      |

When evaluating the SHA-pinning check, verify the PR updates **all** workflow
files referencing the action. See `references/sha-inventory.md` for how to
derive the action-to-workflow inventory. Also verify pin **direction**:
`gh api repos/{owner}/{repo}/compare/{old}...{new} --jq .status` must return
`ahead`; `behind` or `diverged` is a downgrade — **close** even with green CI
and route a tag-hygiene issue to release-engineer (a mutable major tag lags
the release Dependabot tracks via the `# v1` comment).

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md` then run `Bash: fit-wiki boot --agent <self>` (per
[Memory Protocol § On-Boot Read Set](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-memory-protocol.md#on-boot-read-set)).
The boot digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Extract previous triage outcomes and packages that repeatedly fail
Check 8.

### Step 1: List Open Dependabot PRs

`list` open changes authored by `app/dependabot`, reading number, title, head
branch, labels, and creation time
([work-trackers.md](../../agents/x-work-trackers.md)).

### Step 2: Evaluate Each PR

`read` the change's title, body, head branch, files, commits, CI status,
mergeability, and diff
([work-trackers.md](../../agents/x-work-trackers.md)).

Determine update type from title: **patch** (low risk), **minor** (low risk),
**major** (check changelogs for breaking changes and transitive deps).

#### Check 8: Peer/Transitive Compatibility (npm major updates)

List the dependency tree on the PR branch (e.g. `npm ls`). Look for:
**`invalid`** (close), **nested duplicates** in the lock file (close), or
**`deduped` across mismatched majors** (investigate before merging).

#### Check 9: Override-Range Shadowing

Resolvers **replace** (do not intersect) workspace ranges with root
`overrides`. A workspace `package.json` bump can be silently shadowed by a
stale override floor; a root override below a workspace range silently floors
that workspace under the policy minimum.

**Scope.** Fire on **any** PR whose diff touches `*/package.json` or root
`package.json` — Dependabot, agent-authored, or direct human edits.

**Procedure.**

1. For every package whose `*/package.json` range is bumped in the diff, grep
   the root `package.json` `overrides` block. If the package appears, verify
   the override range satisfies the bumped workspace range.
2. Run the package manager's install on the PR branch, then its audit.
3. If audit is **dirty for any package the diff attempts to bump**, the
   override is shadowing — open a follow-up `fix/` PR bumping the override
   floor **before** merging the original PR.
4. The inverse direction also fires: if a workspace range is **below** an
   existing override floor, the workspace silently regresses if the override
   is ever removed. Align the workspace range in the same PR.

### Step 3: Take Action

Commit and push fix work **before** long-running verification; never end the
session with verification still in the background — it dies at turn end, and the
PR's CI is the verification of record. Hold every PR or comment body to
[Citation integrity](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/x-citation-integrity.md).

Each disposition uses tracker operations from
[work-trackers.md](../../agents/x-work-trackers.md).

**Merge** — all policies pass, CI green: `comment` "Dependabot triage: all
policies pass, CI green. Merging.", then `merge-change` (squash).

**Fix on new branch** — minor policy violations fixable (Claude Code cannot push
to Dependabot branches). Branch off the Dependabot branch, make the fixes, run
the repository's check/test/audit commands, then `open-change` titled
`chore(deps): <description> (fixed)` with body "Fixes policy violations in
Dependabot PR #<number>." Finally `close` the original change with comment
"Superseded by #<new-pr> with policy fixes."

**Rebase on new branch** — only CI failure is `vulnerability-scanning` and the
fix is already on `main` (stale audit base, not a PR-caused issue):

```sh
# Confirm: only vuln-scan fails and main has security fixes the PR base lacks
git log --oneline origin/main ^<pr-merge-base> -- '**/package.json' <lockfile>
```

If commits exist, rebasing the Dependabot branch on `origin/main` will fix the
scan. Run the repository's check/test/audit commands, then `open-change` titled
`chore(deps): <original-title> (rebased)` with body "Rebases Dependabot PR

## <number> on current main to pick up security fixes." Then `close` the original

change with comment "Superseded by #<new-pr> — rebased on main to resolve stale
vulnerability-scanning base." (`open-change` and `close`:
[work-trackers.md](../../agents/x-work-trackers.md).)

> **Do not use `@dependabot rebase`.** GitHub Apps cannot trigger Dependabot
> comment commands; the command always fails with "only users with push access."
> If a prior run posted `@dependabot rebase` and got this reply, use the "Rebase
> on new branch" flow above instead of retrying the comment.

**Close** — policy violation cannot be fixed: `close` the change with comment
"Dependabot triage: closing because <reason>. Policy: <which>."
([work-trackers.md](../../agents/x-work-trackers.md)).

### Step 4: Summary

```text
| PR      | Title                          | Action | Reason                     |
| ------- | ------------------------------ | ------ | -------------------------- |
| #dep-a  | bump protobufjs 7.5.4 to 8.0.0 | close  | Check 8: peer incompatible |
| #dep-b  | bump upload-pages-artifact ... | fix    | Missing SHA pins           |
```

### Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **PR triage table** — Each PR with action, failed checks, and reason
- **Compatibility blockers** — Packages closed due to Check 8
- **Reverted merges** — PRs merged then reverted, with root cause
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/` per
  `references/metrics.md`. See KATA.md § Metrics for the eligibility rule.
