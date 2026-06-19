#!/usr/bin/env bash
# Sync the wiki (GitHub wiki — agent shared memory).
# Usage: wiki-sync.sh pull   — fetch latest from remote
#        wiki-sync.sh push   — commit local changes and push
set -euo pipefail

MODE="${1:-pull}"
WIKI_DIR="wiki"
WIKI_URL="https://github.com/forwardimpact/monorepo.wiki.git"

# The wiki remote is a raw https://github.com/... URL and bypasses the local
# git proxy that serves the main repo. Without credentials, git prompts for a
# username and fails in non-TTY environments (CI, agent sessions). When a
# token is present (GITHUB_TOKEN from Actions, GH_TOKEN from gh CLI), wire it
# in via an inline credential helper so clone/fetch/push authenticate without
# writing the token into .git/config. The helper expands the vars in the
# subshell git spawns, so whichever one is set at invocation time wins.
auth_git() {
    if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
        git -c credential.helper= \
            -c 'credential.helper=!f() { echo username=x-access-token; echo "password=${GH_TOKEN:-$GITHUB_TOKEN}"; }; f' \
            "$@"
    else
        git "$@"
    fi
}

# ── Init: clone if missing ──
# CI workflows pre-checkout the wiki with an authenticated token; skip the
# clone when the wiki directory is already a git repo (handles both a
# plain .git dir and a gitdir pointer file from an earlier submodule
# checkout). For local dev without network, anonymous clone failure is
# non-fatal — bootstrap continues without a wiki.
if ! git -C "$WIKI_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    if ! auth_git clone "$WIKI_URL" "$WIKI_DIR"; then
        echo "wiki-sync: could not clone wiki, skipping" >&2
        exit 0
    fi
fi

cd "$WIKI_DIR"

# ── Configure identity from parent repo ──
git config user.name  "$(cd .. && git config user.name)"
git config user.email "$(cd .. && git config user.email)"

# ── Fetch latest ──
auth_git fetch origin master

# ── Pull mode: rebase onto remote ──
if [ "$MODE" = "pull" ]; then
    if ! git rebase origin/master; then
        git rebase --abort || true
        echo "wiki-sync: rebase conflict on pull — local divergence detected; resolve manually or push first" >&2
        exit 1
    fi
    exit 0
fi

# ── Push mode: delegate to the guarded primitive ──
# The former in-tree push path (whole-tree commit + rebase with an `-X ours`
# clobber fallback) was a second publication surface that bypassed libwiki's
# honesty and conservation guards — the surface a phantom-success erasure
# published through with no agent push decision (D8 bypass-coverage). Push mode now
# delegates to `fit-wiki push`, so every wiki publication routes through the
# one guarded `WikiSync.commitAndPush`. The exit status propagates unmasked
# (single command, no pipeline) so a stranded push surfaces loud.
cd ..
exec bunx fit-wiki push
