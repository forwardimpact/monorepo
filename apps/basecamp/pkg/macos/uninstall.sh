#!/bin/bash
set -e

# Basecamp Uninstaller
#
# Removes Basecamp.app and any remaining old artifacts.
# User data at ~/Documents/Personal/ and config at ~/.fit/basecamp/
# are preserved.

echo ""
echo "Basecamp Uninstaller"
echo "====================="
echo ""

# --- Stop running processes --------------------------------------------------

killall Basecamp 2>/dev/null || true
killall fit-basecamp 2>/dev/null || true
killall BasecampStatus 2>/dev/null || true

# --- Remove any leftover LaunchAgents (from older versions) ------------------

for LABEL in "com.forwardimpact.basecamp" "com.fit-basecamp.scheduler" "com.fit-basecamp.status-menu"; do
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "  Removed old LaunchAgent ($LABEL)"
  fi
done

# --- Remove stale socket file -----------------------------------------------

rm -f "$HOME/.fit/basecamp/basecamp.sock"

# --- Remove Basecamp.app ----------------------------------------------------

if [ -d "/Applications/Basecamp.app" ]; then
  sudo rm -rf "/Applications/Basecamp.app"
  echo "  Removed /Applications/Basecamp.app"
elif [ -d "$HOME/Applications/Basecamp.app" ]; then
  rm -rf "$HOME/Applications/Basecamp.app"
  echo "  Removed ~/Applications/Basecamp.app"
else
  echo "  Basecamp.app not found, skipping."
fi

# --- Remove old loose binaries -----------------------------------------------

for BIN in "/usr/local/bin/fit-basecamp" "/usr/local/bin/BasecampStatus"; do
  if [ -f "$BIN" ]; then
    sudo rm -f "$BIN"
    echo "  Removed $BIN"
  fi
done

# --- Remove old shared data -------------------------------------------------

if [ -d "/usr/local/share/fit-basecamp" ]; then
  sudo rm -rf "/usr/local/share/fit-basecamp"
  echo "  Removed /usr/local/share/fit-basecamp/"
fi

# --- Forget pkg receipts ----------------------------------------------------

for RECEIPT in "com.forwardimpact.basecamp" "com.fit-basecamp.scheduler"; do
  pkgutil --pkgs 2>/dev/null | grep -q "$RECEIPT" && {
    sudo pkgutil --forget "$RECEIPT" >/dev/null 2>&1
    echo "  Removed installer receipt ($RECEIPT)"
  } || true
done

echo ""
echo "Basecamp uninstalled."
echo "Your data at ~/Documents/Personal/ has been preserved."
echo "Your config at ~/.fit/basecamp/ has been preserved."
echo ""
echo "To remove all data:   rm -rf ~/Documents/Personal/"
echo "To remove all config: rm -rf ~/.fit/basecamp/"
echo ""
