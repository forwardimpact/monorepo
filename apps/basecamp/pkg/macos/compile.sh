#!/bin/bash
set -e

# Compile Basecamp into a standalone Deno binary (arm64 macOS).
#
# Usage: compile.sh <dist_dir> <app_name>
#   e.g.  compile.sh dist fit-basecamp

DIST_DIR="${1:?Usage: compile.sh <dist_dir> <app_name>}"
APP_NAME="${2:?Usage: compile.sh <dist_dir> <app_name>}"

OUTPUT="$DIST_DIR/$APP_NAME"

echo ""
echo "Compiling $APP_NAME..."
mkdir -p "$DIST_DIR"

deno compile \
  --allow-all \
  --no-check \
  --output "$OUTPUT" \
  basecamp.js

echo "  -> $OUTPUT"
