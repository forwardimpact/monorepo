#!/usr/bin/env bash
#
# Assemble dist/apps/fit-<NAME>.app for a product.
#
#   Usage: build/build-app-product.sh <NAME>
#
# Outpost is special-cased: it ships a native launcher (built via its own
# pkg/build.js) as the primary executable, with the fit-outpost CLI riding along
# as an extra exec plus its config/templates/icon resources. Every other product
# bundles its single CLI binary.
set -euo pipefail

NAME="${1:?usage: build-app-product.sh <NAME>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD_APP="libraries/libmacos/scripts/build-app.sh"

if [ "$NAME" = "outpost" ]; then
  (cd products/outpost && bun pkg/build.js --launcher)
  bash "$BUILD_APP" \
    --bundle-name "fit-outpost" \
    --primary-exec "products/outpost/dist/Outpost" \
    --extra-exec "dist/binaries/fit-outpost" \
    --info-plist "products/outpost/macos/Info.plist" \
    --entitlements "products/outpost/macos/Outpost.entitlements" \
    --resource "products/outpost/config" \
    --resource "products/outpost/templates" \
    --resource "design/fit/assets/icon-outpost.svg" \
    --version "$(jq -r .version products/outpost/package.json)" \
    --out-dir dist/apps
else
  bash "$BUILD_APP" \
    --bundle-name "fit-$NAME" \
    --primary-exec "dist/binaries/fit-$NAME" \
    --info-plist "products/$NAME/macos/Info.plist" \
    --entitlements "products/$NAME/macos/entitlements.plist" \
    --version "$(jq -r .version "products/$NAME/package.json")" \
    --out-dir dist/apps
fi
