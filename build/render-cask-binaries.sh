#!/usr/bin/env bash
#
# Rewrite a Homebrew cask's `binary` block from build/cli-manifest.json so the
# linked binaries can never drift from the ones the app bundle actually ships.
#
#   Usage: build/render-cask-binaries.sh <cask-file> <bundle>
#
# The block sits between the `app "..."` line and `livecheck do` — both stable,
# unique cask lines. Everything between them is regenerated in manifest order:
# `server: true` CLIs first (the gRPC services), then the rest.
set -euo pipefail

CASK_FILE="${1:?usage: render-cask-binaries.sh <cask-file> <bundle>}"
BUNDLE="${2:?usage: render-cask-binaries.sh <cask-file> <bundle>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/build/cli-manifest.json"

# The splice needs both anchors: it keeps everything through `app "..."` and
# resumes at `livecheck do`. A cask missing `livecheck do` would silently lose
# everything after `app` (zap, the closing end). Fail loud here rather than emit
# invalid Ruby that only a downstream `ruby -c` would reject with no context.
grep -q '^  app "' "$CASK_FILE" \
  || { echo "Error: no 'app \"...\"' line in $CASK_FILE" >&2; exit 1; }
grep -q '^  livecheck do' "$CASK_FILE" \
  || { echo "Error: no 'livecheck do' line in $CASK_FILE — splice would drop everything after 'app'" >&2; exit 1; }

APP="fit-${BUNDLE}"
PREFIX="  binary \"#{appdir}/Forward Impact/${APP}.app/Contents/MacOS/"

emit_stanzas() {
  local filter="$1"
  jq -r --arg b "$BUNDLE" "$filter" "$MANIFEST" \
    | while IFS= read -r cli; do
        printf '%s%s"\n' "$PREFIX" "$cli"
      done
}

# Render the block to a temp file — awk reads it line by line, which stays
# portable across gawk (CI) and macOS's BWK awk (rejects newlines in -v vars).
BLOCK_FILE="$(mktemp)"
trap 'rm -f "$BLOCK_FILE"' EXIT
{
  echo ""
  echo "  # gRPC services"
  emit_stanzas '.clis[] | select(.bundle == $b and .server == true) | .name'
  echo ""
  echo "  # Library CLIs"
  emit_stanzas '.clis[] | select(.bundle == $b and (.server != true)) | .name'
} > "$BLOCK_FILE"

# Splice: keep everything through the `app` line, drop the old binary region,
# resume at `livecheck do`.
awk -v blockfile="$BLOCK_FILE" '
  /^  app "/ {
    print
    while ((getline line < blockfile) > 0) print line
    close(blockfile)
    print ""
    skip = 1
    next
  }
  /^  livecheck do/ { skip = 0 }
  skip { next }
  { print }
' "$CASK_FILE" > "$CASK_FILE.tmp"
mv "$CASK_FILE.tmp" "$CASK_FILE"
