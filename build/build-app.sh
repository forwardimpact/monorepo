#!/usr/bin/env bash
#
# Assemble dist/apps/fit-<BUNDLE>.app for any bundle, gear or product alike.
#
#   Usage: build/build-app.sh <BUNDLE>
#
# One manifest-driven path. This script does not branch per kind. The bundle's
# executables are every CLI tagged `bundle: <BUNDLE>` in
# build/cli-manifest.json. The first CLI is the primary exec. The rest ride
# along. The bundle's macOS assembly inputs come from that manifest's
# `.bundles[<BUNDLE>]` entry: Info.plist, entitlements, version source, and any
# native launcher or extra resources. To fold in a new bundle, add a manifest
# entry. Never edit this script to fold one in.
#
# A bundle that declares a `launcher` (outpost's menu-bar app) builds it with
# the product's own `pkg/build.js --launcher`. It uses the launcher as the
# primary executable. It rides every CLI along as an extra. That is a runtime
# specialization keyed on manifest data. It is not a gear-vs-product split.
set -euo pipefail

BUNDLE="${1:?usage: build-app.sh <BUNDLE>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MANIFEST="build/cli-manifest.json"

field() { jq -r --arg b "$BUNDLE" ".bundles[\$b].$1 // empty" "$MANIFEST"; }
INFO_PLIST="$(field info_plist)"
ENTITLEMENTS="$(field entitlements)"
VERSION_SRC="$(field version)"
LAUNCHER="$(field launcher)"

jq -e --arg b "$BUNDLE" '.bundles[$b]' "$MANIFEST" >/dev/null \
  || { echo "Error: no .bundles[$BUNDLE] entry in $MANIFEST" >&2; exit 1; }
VERSION="$(jq -r .version "$VERSION_SRC")"

# mapfile needs bash 4+. macOS runners ship bash 3.2, so read line-by-line.
CLIS=()
while IFS= read -r CLI; do
  CLIS+=("$CLI")
done < <(jq -r --arg b "$BUNDLE" '.clis[] | select(.bundle == $b) | .name' "$MANIFEST")
[ "${#CLIS[@]}" -gt 0 ] || { echo "Error: no manifest CLI in bundle '$BUNDLE'" >&2; exit 1; }

ARGS=(--bundle-name "fit-$BUNDLE")

if [ -n "$LAUNCHER" ]; then
  (cd "products/$BUNDLE" && bun pkg/build.js --launcher)
  ARGS+=(--primary-exec "$LAUNCHER")
  for CLI in "${CLIS[@]}"; do
    ARGS+=(--extra-exec "dist/binaries/$CLI")
  done
else
  ARGS+=(--primary-exec "dist/binaries/${CLIS[0]}")
  for CLI in "${CLIS[@]:1}"; do
    ARGS+=(--extra-exec "dist/binaries/$CLI")
  done
fi

while IFS= read -r RES; do
  [ -n "$RES" ] && ARGS+=(--resource "$RES")
done < <(jq -r --arg b "$BUNDLE" '.bundles[$b].resources // [] | .[]' "$MANIFEST")

ARGS+=(
  --info-plist "$INFO_PLIST"
  --entitlements "$ENTITLEMENTS"
  --version "$VERSION"
  --out-dir dist/apps
)

bash libraries/libmacos/scripts/build-app.sh "${ARGS[@]}"
