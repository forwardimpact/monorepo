#!/bin/bash
set -e

# Outpost Uninstaller
#
# Removes fit-outpost.app. User data at ~/.local/share/fit/outpost/ and config
# at ~/.fit/outpost/ are preserved.

APP_PATH="/Applications/Forward Impact/fit-outpost.app"

echo ""
echo "Outpost Uninstaller"
echo "====================="
echo ""

# --- Stop running processes --------------------------------------------------

# Try graceful shutdown first (stops running agents cleanly), then killall as fallback.
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
  echo "  fit-outpost.app not found, skipping."
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
echo "Your data at ~/.local/share/fit/outpost/ has been preserved."
echo "Your config at ~/.fit/outpost/ has been preserved."
echo ""
echo "To remove all data:   rm -rf ~/.local/share/fit/outpost/"
echo "To remove all config: rm -rf ~/.fit/outpost/"
echo ""
