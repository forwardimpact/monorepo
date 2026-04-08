---
name: release-readiness
description: >
  Check open pull requests for merge readiness. Rebase branches on main, fix
  trivial CI failures (lint, format, lock file), and report status. Do not make
  code-level decisions or approve PRs.
---

# Release Readiness

Check all open pull requests targeting `main` for merge readiness. Rebase
branches, fix mechanical CI failures, and report status on each PR.

## When to Use

- Scheduled daily to keep PRs up-to-date with `main`
- Before a release review to ensure PRs can be merged cleanly

## Prerequisites

The `gh` CLI must be installed and authenticated. Verify with `gh auth status`.

## Process

### Step 0: Read Memory for PR History

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Extract the PR status table from prior `release-engineer`
entries to track consecutive-stuck counts.

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus
```

Skip PRs authored by `app/dependabot` (handled by `security-update`).

### Step 2: Assess Each PR

```sh
gh pr view <number> --json title,headRefName,statusCheckRollup,mergeable,mergeStateStatus
gh pr checks <number>
```

| State        | Condition                                       | Action         |
| ------------ | ----------------------------------------------- | -------------- |
| **Clean**    | Mergeable, all CI green, up-to-date with `main` | Comment: ready |
| **Behind**   | Mergeable but behind `main`                     | Rebase         |
| **Stale**    | CI checks haven't run or are outdated           | Rebase         |
| **Conflict** | Merge conflicts with `main`                     | Attempt rebase |
| **Failing**  | CI checks failing                               | Diagnose       |

### Step 3: Rebase on Main

```sh
git fetch origin main
git fetch origin <pr-branch>
git checkout <pr-branch>
git rebase origin/main
```

**Mechanical conflicts** (lock file, generated files, formatting, import
ordering, adjacent-line edits where both sides are independent) — resolve:

```sh
# Lock file: git checkout --theirs package-lock.json && bun install
# Generated: bunx fit-codegen --all
# Formatting: bun run format:fix
git add <files> && git rebase --continue
```

**Substantive conflicts** (overlapping logic, competing API designs, renamed
symbols, deleted-vs-modified) — abort and comment:

```sh
git rebase --abort
```

Comment on the PR listing conflicting files and why it needs the author's
judgement.

### Step 4: Fix Trivial CI Failures

```sh
bun run check:fix        # Auto-fix formatting and lint
bun run check            # Verify all checks pass
```

If `bun run check` still fails after `check:fix`:

- **Validation failures** (`bun run validate`) — Expected in CI when
  `data/pathway/` is not generated. Verify individually:
  `bun run format && bun run lint && bun run test`
- **Test failures** — Do not fix. Comment with failing test names.
- **Build/codegen failures** — Try `bunx fit-codegen --all`, re-check. If still
  failing, comment and skip.

### Step 5: Push and Report

```sh
git push --force-with-lease origin <pr-branch>
```

Comment on each PR:

- **Ready**: `Release readiness: ✓ rebased on main, all CI checks passing.`
- **Blocked**: `Release readiness: ✗ blocked — <reason>`

### Step 6: Summary

```
| PR  | Title                     | Status  | Action Taken              | Stuck |
| --- | ------------------------- | ------- | ------------------------- | ----- |
| #42 | feat(pathway): add export | ready   | Rebased, fixed lint       |       |
| #38 | fix(map): schema update   | blocked | Merge conflict in foo.js  | × 3   |
```

**Flag PRs stuck across 3+ consecutive runs** — these need human attention.

### Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **PR status table** — Each PR with state and consecutive-stuck count
- **Main branch CI state** — Green or broken, and what was wrong
- **Releases cut** — Version numbers and packages (if any)
