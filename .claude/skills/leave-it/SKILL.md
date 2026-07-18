---
name: leave-it
description: >
  Leave the current worktree and clean it up. Use when the work in a worktree is
  merged or abandoned and the session should return to the original directory.
---

# Leave Worktree

Exit the current worktree session and remove it.

## Process

1. `git status --short` — confirm the working tree is clean.
2. Call `ExitWorktree` with `action: "remove"`. If it refuses because of
   uncommitted files or unmerged commits, confirm those are already merged (a
   squash merge leaves the pre-squash branch commit behind — safe to discard),
   then re-invoke with `discard_changes: true`.
