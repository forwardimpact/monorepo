#!/usr/bin/env bash
set -euo pipefail

# Deleted package names. They must not appear outside allowed locations.
PACKAGES="libagent|libllm|libmemory|libweb|svcagent|svcmemory|svcllm|svctool|svcweb"

# Allowed locations: specs, generated output, node_modules, lockfiles,
# build artifacts, temporary dirs, wiki history logs, this script itself,
# skill files for other domains, and local gitignored config
EXCLUDE="specs/|\.git/|generated/|node_modules/|bun\.lock|package-lock\.json"
EXCLUDE="$EXCLUDE|dist/|tmp/|zero-residue\.sh|wiki/|\.claude/skills/"
EXCLUDE="$EXCLUDE|config/config\.json"

matches=$(grep -rE "$PACKAGES" --include='*.js' --include='*.json' \
  --include='*.md' --include='*.yaml' --include='*.yml' . \
  | grep -vE "$EXCLUDE" || true)

if [ -n "$matches" ]; then
  echo "FAIL: residue found"
  echo "$matches"
  exit 1
fi

echo "PASS: zero residue"
