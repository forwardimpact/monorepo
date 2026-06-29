#!/usr/bin/env bash
set -euo pipefail

# WorktreeCreate hook — owns git worktree creation for the EnterWorktree tool
# and for agent/workflow `isolation: "worktree"`. It REPLACES git's default
# worktree creation rather than running after it.
#
# Contract (verified against the Claude Code binary's hook schema):
#   stdin  — JSON with the common hook fields (session_id, transcript_path,
#            cwd, permission_mode, ...) plus { hook_event_name, name }. The
#            ONLY worktree-specific field is `name` — the worktree/branch name.
#            There is no base_branch / new_branch / isolation field; earlier
#            versions of this script read `.new_branch`, which never exists, so
#            the hook always exited 1 and never created a worktree.
#   stdout — the worktree path and NOTHING else. The harness keeps the last
#            non-empty trimmed stdout line as the directory to enter, so every
#            diagnostic goes to stderr. (A stray stdout line is what caused an
#            earlier bug: bootstrap.sh's "pull: up to date" was misread as the
#            path.) The harness then asserts the path is an existing directory.
#   exit   — any non-zero exit aborts creation, so we tear down a half-built
#            worktree before failing.

# ── Inputs ───────────────────────────────────────────────────────
payload=$(cat)
new_branch=$(jq -r '.name // empty' <<<"$payload")
# No base ref is supplied in the payload; branch from main to match the repo's
# `fresh` baseRef default.
base_branch="main"

if [ -z "$new_branch" ]; then
  echo "worktree-create: hook payload had no name" >&2
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

# ── Reuse an existing worktree ───────────────────────────────────
# Names can repeat across runs (resumed sessions, retried agents). Match git's
# own resume behaviour: if a worktree is already registered at this path, hand
# it back untouched rather than failing on "already exists".
if git -C "$repo_root" worktree list --porcelain \
    | grep -qxF "worktree $worktree_path"; then
  echo "worktree-create: reusing existing worktree at $worktree_path" >&2
  echo "$worktree_path"
  exit 0
fi

# ── Create the worktree ──────────────────────────────────────────
echo "worktree-create: $new_branch from $base_ref -> $worktree_path" >&2
# If setup fails past this point, remove the worktree so creation fails clean.
# Set the trap before `worktree add` so a half-built worktree (add succeeds but
# a later step dies) is always torn down.
trap 'git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true' ERR
if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$new_branch"; then
  # The branch already exists (its worktree was removed without deleting it);
  # attach a worktree to it instead of trying to create the branch again.
  git -C "$repo_root" worktree add "$worktree_path" "$new_branch" 1>&2
else
  git -C "$repo_root" worktree add -b "$new_branch" "$worktree_path" "$base_ref" 1>&2
fi

# ── Set up the environment ───────────────────────────────────────
# bootstrap.sh installs the workspace and syncs the wiki. Its output is
# informational, so route all of it to stderr; stdout stays reserved for the
# path.
( cd "$worktree_path" && bash scripts/bootstrap.sh ) >&2

# ── Hand the path back to the harness (sole stdout line) ─────────
echo "$worktree_path"
