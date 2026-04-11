---
name: gemba-ship
description: >
  Ship the current feature branch: rebase on main, fix conflicts, run checks,
  squash commits, create a PR, wait for checks, and merge. Use when a feature
  branch is ready to land on main.
---

# Ship Feature Branch

Take the current feature branch from "ready" to "merged" in one pass.

## When to Use

- The current branch is a feature branch with committed work ready to land.
- **Not applicable on `main`** — abort immediately if `git branch --show-current`
  returns `main`.

## Prerequisites

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical `gh` query shapes used below.

## Process

### Step 1: Guard

```sh
branch=$(git branch --show-current)
[ "$branch" = "main" ] && { echo "refusing to ship from main"; exit 1; }
```

### Step 2: Rebase on Main

```sh
git fetch origin main
git rebase origin/main
```

Resolve conflicts in place, then `git add <files> && git rebase --continue`.
If a conflict is substantive and cannot be resolved mechanically, abort with
`git rebase --abort` and stop.

### Step 3: Run Checks

```sh
bun run check:fix    # auto-fix format and lint
bun run check        # verify
bun run test         # unit tests
```

Do not proceed until all checks pass.

### Step 4: Squash Commits

```sh
git reset --soft origin/main
git commit -m "<type>(<scope>): <summary>"
git push --force-with-lease -u origin "$branch"
```

Use the conventional-commit style already in the repo history.

### Step 5: Create PR

```sh
gh pr create --base main --head "$branch" --fill
```

### Step 6: Wait for Checks

```sh
gh pr checks "$branch" --watch
```

If any check fails, stop and report — do not attempt code fixes here.

### Step 7: Merge

```sh
gh pr merge "$branch" --merge --delete-branch
```
