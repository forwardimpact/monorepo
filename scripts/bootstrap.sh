#!/usr/bin/env bash
set -euo pipefail

# ── Sync with origin/main ────────────────────────────────────────
# The fit-bootstrap action already rebases onto origin/main (it must, to key
# the workspace cache off the post-rebase tree) and sets BOOTSTRAP_SKIP_SYNC
# so we don't pay for a second fetch+rebase round-trip here. Local runs and
# the SessionStart hook leave it unset and still sync.
if [ "${BOOTSTRAP_SKIP_SYNC:-}" != "true" ]; then
  # Shallow clones lack enough history for rebase to find a merge base.
  # Unshallow first so rebase works reliably.
  if [ -f .git/shallow ]; then
    git fetch --unshallow origin
  fi

  git fetch origin main

  current_branch=$(git branch --show-current)

  if [ "$current_branch" = "main" ]; then
    git merge --ff-only origin/main
  else
    # Update local main ref without checkout
    git branch -f main origin/main
    # Rebase feature branch onto main; on conflict abort and warn (never reset)
    if git rebase main 2>/dev/null; then
      echo "Rebased '$current_branch' onto main."
    else
      git rebase --abort
      echo "Branch '$current_branch' has conflicts with main. Rebase manually when ready."
    fi
  fi
fi

# ── Install workspace ───────────────────────────────────────────
# fit-codegen now writes RELATIVE symlinks (libraries/*/src/generated ->
# ../../../generated), so the workspace cache restores both generated/ and its
# symlinks intact — a warm cache needs neither bun install nor codegen. Guard
# against a stale cache (e.g. one saved before relative symlinks, whose links
# dangle once restored at a different path) by verifying the generated tree
# resolves, and fall back to codegen only when it does not.
if [ "${BOOTSTRAP_WORKSPACE_CACHE_HIT:-}" = "true" ]; then
  needs_codegen=0
  [ -d generated/types ] || needs_codegen=1
  for link in libraries/*/src/generated; do
    [ -e "$link" ] || needs_codegen=1
  done
  if [ "$needs_codegen" = "0" ]; then
    echo "Workspace cache hit — generated restored; skipping bun install and codegen"
  else
    echo "Workspace cache hit — generated tree incomplete; running codegen"
    just codegen
  fi
else
  just install
fi

# ── Wiki sync ────────────────────────────────────────────────────
# Some sandboxed environments rewrite `origin` to a local git proxy that
# only serves the main repo, not the GitHub wiki repo. When origin does
# not point at github.com, parse owner/repo from the URL's trailing path
# segments and point libwiki at the canonical wiki URL via FIT_WIKI_URL.
# Auth uses GH_TOKEN/GITHUB_TOKEN via libwiki's credential helper.
origin_url=$(git remote get-url origin 2>/dev/null || true)
if [[ -n "$origin_url" && "$origin_url" != *github.com* ]]; then
  if [[ "$origin_url" =~ /([^/]+)/([^/]+)/?$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]%.git}"
    export FIT_WIKI_URL="https://github.com/${owner}/${repo}.wiki.git"
  fi
fi

bunx fit-wiki init || echo "bootstrap: wiki init skipped (continuing)" >&2
bunx fit-wiki pull || echo "bootstrap: wiki pull skipped (continuing)" >&2
