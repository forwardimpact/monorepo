#!/usr/bin/env bash
#
# Compile every distributable binary for TARGET, driven by build/cli-manifest.json.
#
#   Usage: build/build-all.sh [TARGET]
#
# Selects the manifest CLIs whose `targets` include TARGET and compiles each via
# build/build-binary.sh.
set -euo pipefail

TARGET="${1:-bun-darwin-arm64}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

jq -r --arg t "$TARGET" \
  '.clis[] | select(.targets | index($t)) | .name' build/cli-manifest.json \
  | while read -r CLI; do
      bash build/build-binary.sh "$CLI" "$TARGET"
    done
