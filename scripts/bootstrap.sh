#!/usr/bin/env bash
set -euo pipefail

# Environment setup only. Install the workspace. Sync the wiki. Whoever needs
# the branch current with origin/main owns that separate concern. The
# gemba-bootstrap action rebases before it computes its cache key. CI is the only
# context that requires it. Local runs and resumed sessions operate on the
# branch as-is. Rebase yourself when you want to.

# ── Install workspace ───────────────────────────────────────────
# fit-codegen now writes RELATIVE symlinks (libraries/*/src/generated ->
# ../../../generated), so the workspace cache restores both generated/ and its
# symlinks intact. A warm cache needs neither bun install nor codegen. Guard
# against a stale cache (e.g. one saved before relative symlinks, whose links
# dangle once restored at a different path). Verify that the generated tree
# resolves. Fall back to codegen only when it does not.
if [ "${BOOTSTRAP_WORKSPACE_CACHE_HIT:-}" = "false" ]; then
  # cache-hit=false signals an exact-key miss, but actions/cache may still
  # have served a restore-keys prefix match. That leaves node_modules and
  # generated/ from an unrelated commit's tree on disk. bun install
  # --frozen-lockfile does not reliably rebuild nested dependencies
  # over that partial state across a top-level version bump (observed:
  # an eslint patch bump leaves node_modules/eslint/node_modules/ajv@6
  # missing, and jsdoc breaks). Discard the stale workspace before you
  # install, so the resulting tree derives solely from bun.lock.
  rm -rf node_modules generated libraries/*/src/generated
  just install
else
  # A warm cache (cache-hit=true) OR a resumed/web session (the env var is
  # unset, a CI-only signal). Reuse the tree when it fully resolves:
  # node_modules present, generated/ built, and every relative symlink intact.
  # Only do work when something is missing. Most sessions then start instantly.
  # Do not wipe a valid tree and reinstall from scratch every time.
  needs_install=0
  [ -d node_modules ] || needs_install=1
  [ -d generated/types ] || needs_install=1
  for link in libraries/*/src/generated; do
    [ -e "$link" ] || needs_install=1
  done
  # generated/services must mirror the proto set exactly, keyed by proto
  # BASENAME. resource/tool ship through libproto's node_modules protos. No
  # service dir holds them. Without this check, a rename leaves the old dir
  # behind. codegen's prune removes it. The renamed service never gets
  # generated, so "workspace ready" precedes a crash-loop. Skip common.proto
  # (no service).
  proto_names=$(
    for p in services/*/proto/*.proto \
      node_modules/@forwardimpact/libproto/proto/*.proto \
      tools/*.proto; do
      [ -e "$p" ] || continue
      b=$(basename "$p" .proto)
      [ "$b" = "common" ] || echo "$b"
    done | sort -u
  )
  for name in $proto_names; do
    [ -d "generated/services/$name" ] || needs_install=1
  done
  if [ -d generated/services ]; then
    for d in generated/services/*/; do
      [ -e "$d" ] || continue
      echo "$proto_names" | grep -qx "$(basename "$d")" || needs_install=1
    done
  fi
  if [ "$needs_install" = "0" ]; then
    echo "Workspace ready. node_modules and generated resolve. Skipping install and codegen"
  elif [ -d node_modules ]; then
    echo "Workspace present but generated tree incomplete. Running codegen"
    just codegen
  else
    echo "Workspace missing. Installing"
    just install
  fi
fi

# ── Wiki sync ────────────────────────────────────────────────────
# Some sandboxed environments rewrite `origin` to a local git proxy. That
# proxy only serves the main repo. It does not serve the GitHub wiki repo.
# When origin does not point at github.com, parse owner/repo from the URL's
# trailing path segments. Then point libwiki at the canonical wiki URL with
# FIT_WIKI_URL. Auth uses GH_TOKEN/GITHUB_TOKEN through libwiki's credential
# helper.
origin_url=$(git remote get-url origin 2>/dev/null || true)
if [[ -n "$origin_url" && "$origin_url" != *github.com* ]]; then
  if [[ "$origin_url" =~ /([^/]+)/([^/]+)/?$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]%.git}"
    export FIT_WIKI_URL="https://github.com/${owner}/${repo}.wiki.git"
  fi
fi

wiki_status=synced
bunx gemba-wiki init || { wiki_status=skipped; echo "bootstrap: wiki init skipped (continuing)" >&2; }
bunx gemba-wiki pull || { wiki_status=skipped; echo "bootstrap: wiki pull skipped (continuing)" >&2; }

# ── Session banner ───────────────────────────────────────────────
# One compact summary of what matters at a glance when a session opens:
# where HEAD sits relative to origin/main, the runtime versions, and whether
# the wiki synced. Everything here is read-only and best-effort.
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
echo "─── session ready ───"
echo "branch: $branch"
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  counts=$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '? ?')
  behind=${counts%%[[:space:]]*}
  ahead=${counts##*[[:space:]]}
  echo "vs origin/main: ${ahead:-?} ahead, ${behind:-?} behind"
fi
echo "node $(node --version 2>/dev/null || echo '?') · bun $(bun --version 2>/dev/null || echo '?') · wiki $wiki_status"
