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
2. Confirm the branch's work is merged (or intentionally abandoned) — e.g.
   the PR shows `MERGED`, or the change is on `origin/main`.
3. Call `ExitWorktree` with `action: "remove"` and `discard_changes: true`.
   Steps 1–2 are the real safety check: a squash merge always leaves the
   pre-squash commits behind on the branch, and the tool may be unable to
   verify worktree state at all, so a plain remove refuses even when
   everything has landed. If step 1 or 2 fails, stop and confirm with the
   user, or preserve the worktree with `action: "keep"`.
