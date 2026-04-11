---
name: gemba-ship
description: >
  Ship the current feature branch: rebase on main, fix conflicts, run checks,
  open (or reuse) a PR, wait for checks, and squash-merge into main. Use when
  a feature branch is ready to land.
---

# Ship Feature Branch

Take the current feature branch from "ready" to "merged" in one pass. Atomic
commits are preserved on the branch and collapsed into a single commit on `main`
by GitHub's squash merge — so bisect and review stay useful up to the moment of
merge.

## When to Use

- The current branch is a feature branch with committed work ready to land.
- **Not applicable on `main`** — the Step 1 guard aborts the workflow if the
  current branch is `main`.

## Prerequisites

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical `gh` query shapes used below.

## Checklists

<do_confirm_checklist goal="Confirm the branch is safe to merge into main">

- [ ] Current branch is not `main`.
- [ ] Rebased cleanly on `origin/main` (no unresolved conflicts).
- [ ] `bun run check` and `bun run test` pass locally.
- [ ] PR exists and its body follows the repo's Summary / Test plan template.
- [ ] All PR checks reported green by `gh pr checks --watch`.
- [ ] Merge uses `--squash` so the feature lands as a single conventional commit
      on `main`.

</do_confirm_checklist>

## Process

### Step 1: Guard

```sh
branch=$(git branch --show-current)
if [ "$branch" = "main" ]; then
  echo "refusing to ship from main" >&2
  return 1 2>/dev/null || exit 1
fi
```

### Step 2: Rebase on Main

```sh
git fetch origin main
git rebase origin/main
```

Resolve conflicts in place, then `git add <files> && git rebase --continue`. If
a conflict is substantive and cannot be resolved mechanically, abort with
`git rebase --abort` and stop.

### Step 3: Run Checks

```sh
bun run check:fix    # auto-fix format and lint
bun run check        # verify
bun run test         # unit tests
```

Do not proceed until all checks pass.

### Step 4: Push the Branch

```sh
git push --force-with-lease -u origin "$branch"
```

Keep atomic commits intact — squashing happens at merge time, not here.

### Step 5: Create or Reuse PR

Probe for an existing open PR on this branch before creating one:

```sh
pr_number=$(gh pr list --head "$branch" --state open \
  --json number --jq '.[0].number')
```

If `pr_number` is empty, create a new PR using the repo's house body template
(see
[`gemba-gh-cli/references/commands.md`](../gemba-gh-cli/references/commands.md)):

```sh
gh pr create --base main --head "$branch" \
  --title "<type>(<scope>): <summary>" \
  --body "$(cat <<'EOF'
## Summary

- <what changed and why>

## Test plan

- [ ] `bun run check`
- [ ] `bun run test`
EOF
)"
```

If a PR already exists, reuse it — do not open a duplicate.

### Step 6: Wait for Checks

```sh
gh pr checks "$branch" --watch
```

If any check fails, stop and report — do not attempt code fixes from inside this
skill. If no workflow runs against the branch at all, abort after a reasonable
wait and investigate upstream rather than blocking forever.

### Step 7: Squash-Merge

```sh
gh pr merge "$branch" --squash --delete-branch
```

GitHub collapses the branch into a single conventional-style commit on `main`
and deletes the remote branch.
