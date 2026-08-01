#!/usr/bin/env bash
#
# Pack a bundle's manifest CLIs into one per-architecture Linux tarball. It is
# the Linux analog of the macOS .app assembly.
#
#   Usage: build/build-tarball.sh <BUNDLE> <ARCH>
#
# This script selects every CLI tagged `bundle: <BUNDLE>` in
# build/cli-manifest.json. It tars those executables from dist/binaries/ into
# dist/release/fit-<BUNDLE>-linux-<ARCH>.tar.gz. It then writes the checksum
# sidecar. ARCH (x64|arm64) names the output only. The binaries in
# dist/binaries are whatever the caller downloaded for that architecture.
#
# The tarball holds only the named executables. It holds no directory prefix
# and no .sha256 sidecars. So the formula's `bin.install Dir["*"]` lands
# exactly the CLIs. Each compiled CLI is self-contained. The build inlines its
# assets at compile time, so nothing else travels beside them.
set -euo pipefail

BUNDLE="${1:?usage: build-tarball.sh <BUNDLE> <ARCH>}"
ARCH="${2:?usage: build-tarball.sh <BUNDLE> <ARCH>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# mapfile needs bash 4+. macOS runners ship bash 3.2, so read line-by-line.
CLIS=()
while IFS= read -r CLI; do
  CLIS+=("$CLI")
done < <(jq -r --arg b "$BUNDLE" '.clis[] | select(.bundle == $b) | .name' build/cli-manifest.json)

[ "${#CLIS[@]}" -gt 0 ] || { echo "Error: no manifest CLI in bundle '$BUNDLE'" >&2; exit 1; }

for CLI in "${CLIS[@]}"; do
  test -f "dist/binaries/$CLI" \
    || { echo "Error: dist/binaries/$CLI missing (bundle $BUNDLE, arch $ARCH)" >&2; exit 1; }
done

mkdir -p dist/release
TARBALL="dist/release/fit-${BUNDLE}-linux-${ARCH}.tar.gz"

# -C dist/binaries with bare names keeps the archive flat (no path prefix), so
# only the listed executables land. The .sha256 siblings never do.
tar -czf "$TARBALL" -C dist/binaries "${CLIS[@]}"
shasum -a 256 "$TARBALL" | awk '{print $1}' > "$TARBALL.sha256"
