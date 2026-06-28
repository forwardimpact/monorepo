#!/usr/bin/env bash
set -euo pipefail

# WorktreeCreate hook — owns git worktree creation for the EnterWorktree tool
# and for agent/workflow `isolation: "worktree"`. It REPLACES git's default
# worktree creation rather than running after it.
#
# Contract (https://code.claude.com/docs/en/hooks.md):
#   stdin  — JSON: { base_branch, new_branch, isolation, cwd, ... }
#   stdout — the worktree path and NOTHING else. The harness reads the last
#            stdout line as the directory to enter, so every diagnostic goes
#            to stderr. (A stray stdout line is what caused the original bug:
#            bootstrap.sh's "pull: up to date" was misread as the path.)
#   exit   — any non-zero exit aborts creation, so we tear down a half-built
#            worktree before failing.

# ── Inputs ───────────────────────────────────────────────────────
payload=$(cat)
base_branch=$(jq -r '.base_branch // "main"' <<<"$payload")
new_branch=$(jq -r '.new_branch // empty' <<<"$payload")

if [ -z "$new_branch" ]; then
  echo "worktree-create: hook payload had no new_branch" >&2
  exit 1
fi

# ── Locate the primary checkout ──────────────────────────────────
# Worktrees always live under the primary checkout's .claude/worktrees/, even
# when this hook fires from inside another worktree (nested agent isolation).
# The common git dir's parent is the primary checkout's root.
repo_root=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)
worktree_path="$repo_root/.claude/worktrees/$new_branch"

# ── Choose the base ref ──────────────────────────────────────────
# Match the repo's `fresh` baseRef default: branch from origin/<base> when it
# is known, then a local branch of that name, then HEAD as a last resort.
if git -C "$repo_root" rev-parse --verify --quiet "origin/$base_branch" >/dev/null; then
  base_ref="origin/$base_branch"
elif git -C "$repo_root" rev-parse --verify --quiet "$base_branch" >/dev/null; then
  base_ref="$base_branch"
else
  base_ref="HEAD"
fi

# ── Create the worktree ──────────────────────────────────────────
echo "worktree-create: $new_branch from $base_ref -> $worktree_path" >&2
git -C "$repo_root" worktree add -b "$new_branch" "$worktree_path" "$base_ref" 1>&2

# If setup fails past this point, remove the worktree so creation fails clean.
trap 'git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true' ERR

# ── Set up the environment ───────────────────────────────────────
# bootstrap.sh installs the workspace and syncs the wiki. Its output is
# informational, so route all of it to stderr; stdout stays reserved for the
# path.
( cd "$worktree_path" && bash scripts/bootstrap.sh ) >&2

# ── Hand the path back to the harness (sole stdout line) ─────────
echo "$worktree_path"
