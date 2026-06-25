#!/bin/bash
set -euo pipefail

# Assemble a macOS .app bundle from compiled binaries and resources.
#
# Usage: build-app.sh [options]
#   --bundle-name NAME        Bundle directory name (e.g. "fit-outpost" → fit-outpost.app)
#   --primary-exec PATH       Path to the primary executable (becomes CFBundleExecutable)
#   --extra-exec PATH         Additional executable to place in Contents/MacOS/ (repeatable)
#   --info-plist PATH         Path to Info.plist to embed
#   --entitlements PATH       Path to entitlements plist for ad-hoc codesigning
#   --resource PATH           Path to copy into Contents/Resources/ (repeatable)
#   --version VERSION         Version string written into the bundle's Info.plist
#                             (CFBundleVersion + CFBundleShortVersionString) before
#                             codesigning. If omitted, the existing plist values are
#                             kept as-is. Requires plutil (macOS native).
#   --out-dir DIR             Output directory (default: dist/apps)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BUNDLE_NAME=""
PRIMARY_EXEC=""
EXTRA_EXECS=()
INFO_PLIST=""
ENTITLEMENTS=""
RESOURCES=()
VERSION=""
OUT_DIR="dist/apps"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-name)   BUNDLE_NAME="$2";   shift 2 ;;
    --primary-exec)  PRIMARY_EXEC="$2";  shift 2 ;;
    --extra-exec)    EXTRA_EXECS+=("$2"); shift 2 ;;
    --info-plist)    INFO_PLIST="$2";    shift 2 ;;
    --entitlements)  ENTITLEMENTS="$2";  shift 2 ;;
    --resource)      RESOURCES+=("$2");  shift 2 ;;
    --version)       VERSION="$2";       shift 2 ;;
    --out-dir)       OUT_DIR="$2";       shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$BUNDLE_NAME" ]; then echo "Error: --bundle-name is required" >&2; exit 1; fi
if [ -z "$PRIMARY_EXEC" ]; then echo "Error: --primary-exec is required" >&2; exit 1; fi
if [ -z "$INFO_PLIST" ]; then echo "Error: --info-plist is required" >&2; exit 1; fi
if [ -z "$ENTITLEMENTS" ]; then echo "Error: --entitlements is required" >&2; exit 1; fi

if [ ! -f "$PRIMARY_EXEC" ]; then
  echo "Error: primary executable not found at $PRIMARY_EXEC" >&2
  exit 1
fi

if [ ! -f "$INFO_PLIST" ]; then
  echo "Error: Info.plist not found at $INFO_PLIST" >&2
  exit 1
fi

APP_DIR="$OUT_DIR/${BUNDLE_NAME}.app"

echo ""
echo "Assembling ${BUNDLE_NAME}.app${VERSION:+ v${VERSION}}..."

# --- Clean previous build ----------------------------------------------------

rm -rf "$APP_DIR" 2>/dev/null || true

# --- Create bundle structure --------------------------------------------------

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# --- Copy primary executable --------------------------------------------------

PRIMARY_NAME="$(basename "$PRIMARY_EXEC")"
cp "$PRIMARY_EXEC" "$APP_DIR/Contents/MacOS/$PRIMARY_NAME"
chmod +x "$APP_DIR/Contents/MacOS/$PRIMARY_NAME"

# --- Copy extra executables ---------------------------------------------------

for EXEC in ${EXTRA_EXECS[@]+"${EXTRA_EXECS[@]}"}; do
  if [ ! -f "$EXEC" ]; then
    echo "Error: extra executable not found at $EXEC" >&2
    exit 1
  fi
  EXEC_NAME="$(basename "$EXEC")"
  cp "$EXEC" "$APP_DIR/Contents/MacOS/$EXEC_NAME"
  chmod +x "$APP_DIR/Contents/MacOS/$EXEC_NAME"
done

# --- Copy Info.plist ----------------------------------------------------------

cp "$INFO_PLIST" "$APP_DIR/Contents/Info.plist"

# --- Embed version into Info.plist -------------------------------------------

# Substitute the release version into the bundle's Info.plist before signing
# so codesign covers the version-correct plist. The bundle's
# CFBundleShortVersionString must match the release tag.
if [ -n "$VERSION" ]; then
  if command -v plutil >/dev/null 2>&1; then
    plutil -replace CFBundleVersion -string "$VERSION" "$APP_DIR/Contents/Info.plist"
    plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP_DIR/Contents/Info.plist"
  else
    echo "  Warning: plutil unavailable; Info.plist version not embedded" >&2
  fi
fi

# --- Copy resources -----------------------------------------------------------

for RES in ${RESOURCES[@]+"${RESOURCES[@]}"}; do
  if [ ! -e "$RES" ]; then
    echo "Warning: resource not found at $RES, skipping" >&2
    continue
  fi
  RES_NAME="$(basename "$RES")"
  if [ -d "$RES" ]; then
    cp -R "$RES" "$APP_DIR/Contents/Resources/$RES_NAME"
  else
    cp "$RES" "$APP_DIR/Contents/Resources/$RES_NAME"
  fi
done

# --- Ad-hoc code sign with entitlements ---------------------------------------

bash "$SCRIPT_DIR/sign-app.sh" "$APP_DIR" "$ENTITLEMENTS"

echo "  -> $APP_DIR"
