#!/bin/bash
set -euo pipefail

# Codesign a macOS .app bundle with Hardened Runtime and entitlements.
#
# Usage: sign-app.sh <app-path> <entitlements-path>
#
# The MACOS_SIGN_IDENTITY environment variable chooses the signing identity:
#   - unset/empty → ad-hoc signing ("-"), used for local and PR builds.
#   - a Developer ID Application identity (e.g. "Developer ID Application:
#     Example Inc (AB12CD34EF)") → real signing with a secure timestamp, the
#     prerequisite for notarization. Only the publish workflows set it, from
#     environment-scoped secrets.
#
# The script signs inside-out. It signs the nested Mach-O executables first,
# then the bundle. Apple recommends this order for notarized apps. The order is
# also deterministic. So the bundle's cdhash stays stable across rebuilds. TCC
# grants then survive upgrades.
#
# Requires codesign (Xcode command-line tools). Exits non-zero on failure
# unless you set CODESIGN_ALLOW_FAIL=1 (for Linux CI where codesign is absent).

APP_PATH="${1:?Usage: sign-app.sh <app-path> <entitlements-path>}"
ENTITLEMENTS="${2:?Usage: sign-app.sh <app-path> <entitlements-path>}"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: bundle not found at $APP_PATH" >&2
  exit 1
fi

if [ ! -f "$ENTITLEMENTS" ]; then
  echo "Error: entitlements not found at $ENTITLEMENTS" >&2
  exit 1
fi

IDENTITY="${MACOS_SIGN_IDENTITY:-}"
SIGN_ARGS=(--force --options runtime --entitlements "$ENTITLEMENTS")
if [ -n "$IDENTITY" ]; then
  SIGN_ARGS+=(--sign "$IDENTITY" --timestamp)
  echo "  Signing with identity: $IDENTITY"
else
  SIGN_ARGS+=(--sign -)
  echo "  Ad-hoc signing (set MACOS_SIGN_IDENTITY for Developer ID)"
fi

run_sign() {
  local exe
  for exe in "$APP_PATH"/Contents/MacOS/*; do
    [ -f "$exe" ] || continue
    codesign "${SIGN_ARGS[@]}" "$exe" || return 1
  done
  codesign "${SIGN_ARGS[@]}" "$APP_PATH" || return 1
}

if ! run_sign; then
  if [ "${CODESIGN_ALLOW_FAIL:-0}" = "1" ]; then
    echo "  Warning: codesign unavailable or failed (CODESIGN_ALLOW_FAIL=1)" >&2
  else
    echo "  Error: code signing failed" >&2
    exit 1
  fi
fi
