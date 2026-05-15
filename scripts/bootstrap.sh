#!/usr/bin/env bash
set -euo pipefail

# ── Sync with origin/main ────────────────────────────────────────
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

# ── Install tooling ──────────────────────────────────────────────
if ! command -v just &>/dev/null; then
  bun install -g rust-just
fi

just install

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
