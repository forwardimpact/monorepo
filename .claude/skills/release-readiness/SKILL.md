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
- On-demand when a contributor asks for rebase help

## Prerequisites

The `gh` CLI must be installed and authenticated. See the `gh-cli` skill for
installation instructions. Verify with:

```sh
gh auth status
```

## Scope of Action

This skill performs **mechanical merge preparation only**. It does not review
code, approve PRs, or make design decisions.

### You MUST

- Rebase PR branches on `main` to eliminate merge conflicts
- Resolve **mechanical conflicts** — lock file, generated files, formatting,
  import ordering, adjacent-line edits where both sides are clearly independent
- Fix trivial CI failures: formatting (`npm run format:fix`), lint
  (`npm run lint:fix`), lock file sync (`npm install --package-lock-only`),
  codegen (`npx fit-codegen --all`)
- Report status on each PR via comment

### You MUST NOT

- Resolve **substantive conflicts** — overlapping logic changes, competing API
  designs, renamed or moved symbols, altered control flow, deleted-vs-modified
  sections, or anything where the correct resolution depends on understanding
  the intent behind both sides
- Change application logic, tests, or feature behaviour
- Approve or merge pull requests
- Rewrite, refactor, or "improve" any code in the PR
- Add commits that change the intent of the PR
- Make decisions that belong to the PR author or reviewer

When a conflict requires judgement about which side is correct, **stop and
comment** on the PR explaining what needs manual attention. Do not attempt a
fix.

## Process

### Step 1: List Open PRs

```sh
gh pr list --state open --base main \
  --json number,title,headRefName,author,updatedAt,mergeable,mergeStateStatus
```

Skip PRs authored by `app/dependabot` — those are handled by the
`dependabot-triage` skill.

### Step 2: Assess Each PR

For each PR, gather details:

```sh
gh pr view <number> --json title,headRefName,statusCheckRollup,mergeable,mergeStateStatus
gh pr checks <number>
```

Classify the PR into one of these states:

| State        | Condition                                       | Action         |
| ------------ | ----------------------------------------------- | -------------- |
| **Clean**    | Mergeable, all CI green, up-to-date with `main` | Comment: ready |
| **Behind**   | Mergeable but behind `main`                     | Rebase         |
| **Stale**    | CI checks haven't run or are outdated           | Rebase         |
| **Conflict** | Merge conflicts with `main`                     | Attempt rebase |
| **Failing**  | CI checks failing                               | Diagnose       |

### Step 3: Rebase on Main

For PRs that are behind `main` or have conflicts:

```sh
git fetch origin main
git fetch origin <pr-branch>
git checkout <pr-branch>
git rebase origin/main
```

If the rebase produces **mechanical conflicts** — lock file, generated files,
formatting, import ordering, or adjacent-line edits where both sides are clearly
independent — resolve them:

```sh
# Lock file conflict
git checkout --theirs package-lock.json
npm install --package-lock-only
git add package-lock.json

# Generated file conflict
npx fit-codegen --all
git add <generated-files>

# Formatting or import-order conflicts
npm run format:fix
git add <file>

# Adjacent-line edits (both sides are independent additions)
# Keep both sides, verify the result makes sense
git add <file>
```

Then continue:

```sh
git rebase --continue
```

If the rebase produces **substantive conflicts** — overlapping logic changes,
competing API designs, renamed or moved symbols, deleted-vs-modified sections,
or anything where the correct resolution requires understanding the intent
behind both sides:

```sh
git rebase --abort
```

Comment on the PR listing the conflicting files and why the conflict requires
the author's judgement. Do not attempt to resolve it.

### Step 4: Fix Trivial CI Failures

After a successful rebase, or for PRs where CI is failing:

```sh
npm run check:fix        # Auto-fix formatting and lint
npm run check            # Verify all checks pass
```

If `npm run check` still fails after `check:fix`:

- **Test failures** — Do not fix. Comment on the PR with the failing test names.
- **Validation failures** — Do not fix. Comment with the validation errors.
- **Build/codegen failures** — Try `npx fit-codegen --all` then re-check. If
  still failing, comment and skip.

### Step 5: Push Updated Branch

After a successful rebase and any fixes:

```sh
git push --force-with-lease origin <pr-branch>
```

Use `--force-with-lease` (never `--force`) to avoid overwriting concurrent
changes by the PR author.

### Step 6: Commit Fixes (if any)

If you made fix commits (lint, format, lock file) on top of the rebase:

```sh
git add <fixed-files>
git commit -m "chore: fix lint and format after rebase"
git push --force-with-lease origin <pr-branch>
```

### Step 7: Report Status

Comment on each processed PR with a brief status update:

**When ready:**

```
Release readiness: ✓ rebased on main, all CI checks passing. Ready to review.
```

**When blocked:**

```
Release readiness: ✗ blocked — merge conflicts in `src/foo.js` and `src/bar.js`
require manual resolution. Rebase aborted.
```

**When CI is failing:**

```
Release readiness: ✗ blocked — test failures after rebase:
- `test/foo.test.js`: assertion error in "should handle empty input"
Needs attention from the PR author.
```

### Step 8: Summary

After processing all PRs, produce a summary:

```
| PR  | Title                     | Status  | Action Taken              |
| --- | ------------------------- | ------- | ------------------------- |
| #42 | feat(pathway): add export | ready   | Rebased, fixed lint       |
| #38 | fix(map): schema update   | blocked | Merge conflict in foo.js  |
| #35 | refactor(libui): cleanup  | ready   | Already up-to-date        |
```
