#!/usr/bin/env bash
#
# Assemble dist/apps/fit-gear.app — the gear meta-bundle.
#
#   Usage: build/build-app-gear.sh
#
# Bundles every manifest CLI tagged `bundle: "gear"` into one .app: the first is
# the primary executable, the rest ride along as extra execs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# mapfile needs bash 4+; macOS runners ship bash 3.2, so read line-by-line.
GEAR=()
while IFS= read -r CLI; do
  GEAR+=("$CLI")
done < <(jq -r '.clis[] | select(.bundle == "gear") | .name' build/cli-manifest.json)

ARGS=(--bundle-name "fit-gear" --primary-exec "dist/binaries/${GEAR[0]}")
for CLI in "${GEAR[@]:1}"; do
  ARGS+=(--extra-exec "dist/binaries/$CLI")
done
ARGS+=(
  --info-plist "macos/gear/Info.plist"
  --entitlements "macos/gear/entitlements.plist"
  --version "$(jq -r .version package.json)"
  --out-dir dist/apps
)

bash libraries/libmacos/scripts/build-app.sh "${ARGS[@]}"
