---
name: ship-it
description: >
  Ship the current feature branch as-is: approve, rebase on main, open a PR,
  wait for CI checks, and squash-merge into main. Ships only the work already
  done. Never creates new work to complete a phase.
---

# Ship Feature Branch

Take the current feature branch from "ready" to "merged" in one pass. The branch
keeps the atomic commits. GitHub's squash merge collapses them into a single
commit on `main`. So bisect and review stay useful up to the moment of merge.

## When to Use

- The current branch is a feature branch with committed work ready to land.
- **Not applicable on `main`** — the Step 1 guard aborts the workflow if the
  current branch is `main`.

## Scope — Ship What Was Done, Nothing More

To ship means to land the work **as it was already completed** on the branch.
It never means to create additional work to finish an incomplete phase. It
never means to advance to the next phase. Examples:

- **Spec branch** — contains only `spec.md`. Ship the spec. Do not write a
  design or plan.
- **Design branch** — contains `spec.md` and `design-a.md`. Ship the design. Do
  not write a plan.
- **Plan branch** — contains `spec.md`, `design-a.md`, and `plan-a.md`. Ship the
  plan. Do not implement it.
- **Implementation branch** — contains code changes that implement an approved
  plan. Ship the implementation.
- **Non-spec branch** — contains code changes unrelated to a spec (bug fix,
  chore, docs). Ship as-is with no STATUS write.

If the work on the branch is incomplete or broken, **stop and tell the user**.
Do not try to finish it.

## To Ship Is to Approve

To ship a spec-tracked deliverable means to approve it. The human invoker is
the approver. The skill types the row. Step 2 writes the matching row in
`wiki/STATUS.md`, the canonical approval record, before the mechanical ship
process begins.

## Checklists

<do_confirm_checklist goal="Confirm the branch is safe to merge into main">

- [ ] Confirm the current branch is not `main`.
- [ ] Confirm the scope stays limited to work already on the branch.
- [ ] Confirm you updated the `wiki/STATUS.md` row for the spec (if
      spec-tracked).
- [ ] Confirm the rebase on `origin/main` left no unresolved conflicts.
- [ ] Confirm the PR exists and its body follows the repo's Summary / Test plan
      template.
- [ ] Confirm `gh pr checks --watch` reported all PR checks green.
- [ ] Confirm the merge uses `--squash` so the feature lands as a single
      conventional commit on `main`.

</do_confirm_checklist>

## Process

Run the steps back-to-back. Pause only on real blockers (conflicts, checks that
fail, unexpected state). Batch independent commands where possible.

### Step 1: Guard

```sh
branch=$(git branch --show-current)
if [ "$branch" = "main" ]; then
  echo "refusing to ship from main" >&2
  return 1 2>/dev/null || exit 1
fi
```

### Step 2: Approve the Work (spec-tracked branches only)

If the branch contains spec-tracked work (a spec, design, plan, or
implementation), edit `wiki/STATUS.md` to set the matching row first. The Stop
hook pushes the wiki commit.

| Deliverable    | STATUS row           |
| -------------- | -------------------- |
| `spec.md`      | `{NNN}\tspec\tapproved`    |
| `design-a.md`  | `{NNN}\tdesign\tapproved`  |
| `plan-a.md`    | `{NNN}\tplan\tapproved`    |
| Implementation | `{NNN}\tplan\timplemented` |

Locate the row for the spec id in the fenced code block of `wiki/STATUS.md`
and replace it in place. If the row is absent (new spec), insert it in
sorted-id order.

Skip this step for branches with no spec association (bug fixes, chores, docs).

### Step 3: Rebase on Main

```sh
git fetch origin main
git rebase origin/main
```

Resolve conflicts in place. Then run `git add <files> && git rebase --continue`.
If a conflict is substantive and you cannot resolve it mechanically, abort with
`git rebase --abort` and stop.

CI runs `check` and `test` against the PR (Step 6). That is the authoritative
gate. So this skill does not run them locally first.

### Step 4: Push the Branch

```sh
git push --force-with-lease -u origin "$branch"
```

Keep atomic commits intact. The squash happens at merge time. It does not
happen here.

### Step 5: Create or Reuse PR

Reuse the open PR on this branch if one exists. Otherwise create it:

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

### Step 6: Wait for Checks

```sh
gh pr checks "$branch" --watch
```

If any check fails, stop and comment on the PR to describe the failure. Do not
try code fixes from inside this skill. If no workflow runs against the branch
at all, abort after a reasonable wait. Then investigate upstream. Do not block
forever.

### Step 7: Squash-Merge

```sh
gh pr merge "$branch" --squash --delete-branch
```

GitHub collapses the branch into a single conventional-style commit on `main`
and deletes the remote branch.
