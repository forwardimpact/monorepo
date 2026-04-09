#!/usr/bin/env bash
# Sync the wiki submodule (GitHub wiki — agent shared memory).
# Usage: wiki-sync.sh pull   — fetch latest from remote
#        wiki-sync.sh push   — commit local changes and push
set -euo pipefail

MODE="${1:-pull}"
WIKI_DIR="wiki"

# ── Init: ensure submodule is present ──
if [ -d "$WIKI_DIR" ] && ! [ -d "$WIKI_DIR/.git" ] && ! [ -f "$WIKI_DIR/.git" ]; then
    rm -rf "$WIKI_DIR"
fi
git submodule update --init "$WIKI_DIR" 2>/dev/null || true

if ! [ -d "$WIKI_DIR/.git" ] && ! [ -f "$WIKI_DIR/.git" ]; then
    echo "wiki-sync: submodule not available, skipping" >&2
    exit 0
fi

cd "$WIKI_DIR"

# ── Fix detached HEAD → master ──
if ! git symbolic-ref -q HEAD >/dev/null 2>&1; then
    git checkout -B master HEAD
fi
git branch --set-upstream-to=origin/master master 2>/dev/null || true

# ── Configure identity from parent repo ──
git config user.name  "$(cd .. && git config user.name)"
git config user.email "$(cd .. && git config user.email)"

# ── Fetch latest ──
git fetch origin master 2>/dev/null || exit 0

# ── Pull mode: rebase onto remote ──
if [ "$MODE" = "pull" ]; then
    git rebase origin/master 2>/dev/null || {
        git rebase --abort 2>/dev/null || true
        git reset --hard origin/master
    }
    cd ..
    git add "$WIKI_DIR"
    if ! git diff --cached --quiet -- "$WIKI_DIR"; then
        git commit -m "chore: update wiki submodule"
    fi
    exit 0
fi

# ── Push mode: commit local changes, rebase, push ──
git add -A
if git diff --cached --quiet; then
    exit 0
fi
git commit -m "wiki: update from session"

if ! git rebase origin/master 2>/dev/null; then
    git rebase --abort 2>/dev/null || true
    git merge origin/master -X ours --no-edit 2>/dev/null || {
        git merge --abort 2>/dev/null || true
    }
fi
git push origin master 2>/dev/null || true
cd ..
git add "$WIKI_DIR"
if ! git diff --cached --quiet -- "$WIKI_DIR"; then
    git commit -m "chore: update wiki submodule"
fi
