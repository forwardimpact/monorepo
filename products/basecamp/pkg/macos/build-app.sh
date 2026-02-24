#!/bin/bash
set -e

# Assemble Basecamp.app bundle from compiled binaries and resources.
#
# Usage: build-app.sh
#   Run from the products/basecamp/ directory.
#   Expects dist/Basecamp and dist/fit-basecamp to exist.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
APP_DIR="$DIST_DIR/Basecamp.app"

if [ ! -f "$DIST_DIR/Basecamp" ]; then
  echo "Error: Swift launcher not found at $DIST_DIR/Basecamp"
  echo "Run 'just build-launcher' first."
  exit 1
fi

if [ ! -f "$DIST_DIR/fit-basecamp" ]; then
  echo "Error: Deno scheduler not found at $DIST_DIR/fit-basecamp"
  echo "Run 'just build-scheduler' first."
  exit 1
fi

echo ""
echo "Assembling Basecamp.app..."

# --- Clean previous build ----------------------------------------------------

rm -rf "$APP_DIR" 2>/dev/null || sudo rm -rf "$APP_DIR"

# --- Create bundle structure --------------------------------------------------

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# --- Copy executables ---------------------------------------------------------

cp "$DIST_DIR/Basecamp" "$APP_DIR/Contents/MacOS/Basecamp"
chmod +x "$APP_DIR/Contents/MacOS/Basecamp"

cp "$DIST_DIR/fit-basecamp" "$APP_DIR/Contents/MacOS/fit-basecamp"
chmod +x "$APP_DIR/Contents/MacOS/fit-basecamp"

# --- Copy Info.plist ----------------------------------------------------------

cp "$PROJECT_DIR/macos/Info.plist" "$APP_DIR/Contents/Info.plist"

# --- Copy resources -----------------------------------------------------------

cp -R "$PROJECT_DIR/config" "$APP_DIR/Contents/Resources/config"
cp -R "$PROJECT_DIR/template" "$APP_DIR/Contents/Resources/template"

# --- Copy icons ---------------------------------------------------------------

ICON_DIR="$PROJECT_DIR/../../design/icons"
cp "$ICON_DIR/basecamp-flat.svg" "$APP_DIR/Contents/Resources/basecamp-flat.svg"
cp "$ICON_DIR/basecamp.svg" "$APP_DIR/Contents/Resources/basecamp.svg"

# --- Ad-hoc code sign with entitlements ---------------------------------------

ENTITLEMENTS="$PROJECT_DIR/macos/Basecamp.entitlements"

codesign --force --sign - \
  --entitlements "$ENTITLEMENTS" \
  --deep \
  "$APP_DIR" 2>/dev/null || {
    echo "  Warning: ad-hoc code signing failed (continuing without)"
  }

echo "  -> $APP_DIR"
