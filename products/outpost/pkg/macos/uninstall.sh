#!/bin/bash
set -e

# Outpost Uninstaller
#
# This script removes fit-outpost.app. It keeps user data at
# ~/.local/share/fit/outpost/ and config at ~/.fit/outpost/.

APP_PATH="/Applications/Forward Impact/fit-outpost.app"

echo ""
echo "Outpost Uninstaller"
echo "====================="
echo ""

# --- Stop running processes --------------------------------------------------

# Try a graceful shutdown first. It stops active agents cleanly. Then use
# killall as a fallback.
if [ -f "$APP_PATH/Contents/MacOS/fit-outpost" ]; then
  "$APP_PATH/Contents/MacOS/fit-outpost" stop 2>/dev/null || true
fi
killall Outpost 2>/dev/null || true
killall fit-outpost 2>/dev/null || true

# --- Remove stale socket file ------------------------------------------------

rm -f "$HOME/.fit/outpost/outpost.sock"

# --- Remove the app bundle ---------------------------------------------------

if [ -d "$APP_PATH" ]; then
  sudo rm -rf "$APP_PATH"
  echo "  Removed $APP_PATH"
else
  echo "  fit-outpost.app not found, skipped."
fi

# --- Remove CLI symlink ------------------------------------------------------

if [ -f "/usr/local/bin/fit-outpost" ] || [ -L "/usr/local/bin/fit-outpost" ]; then
  sudo rm -f "/usr/local/bin/fit-outpost"
  echo "  Removed /usr/local/bin/fit-outpost"
fi

# --- Forget pkg receipt ------------------------------------------------------

if pkgutil --pkgs 2>/dev/null | grep -q "team.forwardimpact.outpost"; then
  sudo pkgutil --forget "team.forwardimpact.outpost" >/dev/null 2>&1
  echo "  Removed installer receipt"
fi

echo ""
echo "Outpost uninstalled."
echo "Your data at ~/.local/share/fit/outpost/ stays in place."
echo "Your config at ~/.fit/outpost/ stays in place."
echo ""
echo "To remove all data:   rm -rf ~/.local/share/fit/outpost/"
echo "To remove all config: rm -rf ~/.fit/outpost/"
echo ""
