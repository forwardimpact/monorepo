#!/usr/bin/env bash
#
# Compile a single CLI bin entry into dist/binaries/<NAME> as a standalone Bun
# executable.
#
#   Usage: build/build-binary.sh <NAME> [TARGET]
#
# Resolves <NAME> to the package.json that declares bin[<NAME>], then compiles
# the entry with two build-time literals consumed by libcli:
#
#   LIBCLI_VERSION     the package version. `bun --compile` mounts source onto a
#                      virtual /$bunfs filesystem, so readFileSync(package.json)
#                      ENOENTs at runtime; resolveVersion reads this literal
#                      instead, and the readFileSync fallback tree-shakes away.
#   LIBCLI_IS_COMPILED "1", so libcli's LIBCLI_IS_COMPILED constant folds to true
#                      in the binary and stays false in source/npx execution.
#
# `--define` substitutes each literal `process.env.<NAME>` token across the whole
# bundle (the bundled libcli included). Each binary is compiled separately, so
# the shared names carry that binary's own values.
#
# Package-data assets the CLI declares in build/cli-manifest.json (prompts,
# templates) are inlined by build/gen-embed.mjs, which prints the entry to
# compile: a generated shim that registers the assets first, or — when the CLI
# declares none — the original entry unchanged.
set -euo pipefail

NAME="${1:?usage: build-binary.sh <NAME> [TARGET]}"
TARGET="${2:-bun-darwin-arm64}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENTRY=""
PKG_DIR=""
for PKG in products/*/package.json services/*/package.json libraries/*/package.json; do
  REL=$(jq -r --arg n "$NAME" '.bin[$n] // empty' "$PKG" 2>/dev/null)
  if [ -n "$REL" ]; then
    PKG_DIR="$(dirname "$PKG")"
    ENTRY="$PKG_DIR/$REL"
    break
  fi
done
if [ -z "$ENTRY" ] || [ ! -f "$ENTRY" ]; then
  echo "Error: no package.json declares bin[$NAME] with an existing entry" >&2
  exit 1
fi

VERSION=$(jq -r .version "$PKG_DIR/package.json")
mkdir -p dist/binaries

COMPILE_ENTRY=$(bun build/gen-embed.mjs "$NAME" "$ENTRY" "dist/.embed")

bun build --compile \
  --target "$TARGET" \
  --no-compile-autoload-dotenv \
  --no-compile-autoload-bunfig \
  --define "process.env.LIBCLI_VERSION=\"${VERSION}\"" \
  --define "process.env.LIBCLI_IS_COMPILED=\"1\"" \
  --outfile "dist/binaries/$NAME" \
  "$COMPILE_ENTRY"
