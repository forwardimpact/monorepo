#!/usr/bin/env bash
#
# Rewrite a Homebrew formula's version and both per-architecture checksums for a
# release. The Linux analog of the cask's flat two-line sed — but a formula
# carries two indistinguishable `sha256` lines, one per arch, so each is keyed
# by the arch token in the `url` line above it rather than by position.
#
#   Usage: build/update-formula.sh <formula-file> <version> <x64-sha> <arm64-sha>
#
# The formula shape (design 2190-a):
#
#   version "X.Y.Z"
#   on_linux do
#     on_intel do
#       url ".../fit-<bundle>-linux-x64.tar.gz"
#       sha256 "<x64>"
#     end
#     on_arm do
#       url ".../fit-<bundle>-linux-arm64.tar.gz"
#       sha256 "<arm64>"
#     end
#   end
#
# A single awk pass tracks the last-seen url's arch token (linux-x64 vs
# linux-arm64) and rewrites the sha256 on the following line with the matching
# checksum, so the two stanzas never cross-assign. The one top-level `version`
# line is rewritten in the same pass. Ends with `ruby -c` as a syntax gate.
set -euo pipefail

FORMULA="${1:?usage: update-formula.sh <formula-file> <version> <x64-sha> <arm64-sha>}"
VERSION="${2:?usage: update-formula.sh <formula-file> <version> <x64-sha> <arm64-sha>}"
X64_SHA="${3:?usage: update-formula.sh <formula-file> <version> <x64-sha> <arm64-sha>}"
ARM64_SHA="${4:?usage: update-formula.sh <formula-file> <version> <x64-sha> <arm64-sha>}"

test -f "$FORMULA" || { echo "Error: formula $FORMULA not found" >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

awk -v ver="$VERSION" -v x64="$X64_SHA" -v arm="$ARM64_SHA" '
  /^[[:space:]]*version "/ {
    sub(/version "[^"]*"/, "version \"" ver "\"")
    print; next
  }
  /^[[:space:]]*url "/ {
    if ($0 ~ /linux-x64/)        arch = "x64"
    else if ($0 ~ /linux-arm64/) arch = "arm64"
    else                         arch = ""
    print; next
  }
  /^[[:space:]]*sha256 "/ {
    if (arch == "x64")        sub(/sha256 "[^"]*"/, "sha256 \"" x64 "\"")
    else if (arch == "arm64") sub(/sha256 "[^"]*"/, "sha256 \"" arm "\"")
    arch = ""
    print; next
  }
  { print }
' "$FORMULA" > "$TMP"

mv "$TMP" "$FORMULA"
trap - EXIT

ruby -c "$FORMULA"
