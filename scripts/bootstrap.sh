#!/usr/bin/env bash
set -euo pipefail

# Environment setup only — install the workspace and sync the wiki. Keeping the
# branch current with origin/main is a separate concern owned by whoever needs
# it: the fit-bootstrap action rebases before computing its cache key, and CI
# is the only context that requires it. Local runs and resumed sessions operate
# on the branch as-is; rebase yourself when you want to.

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
