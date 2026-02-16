#!/bin/bash
set -e

# Build a macOS installer package (.pkg) for Basecamp (arm64).
#
# Uses pkgbuild (component) + productbuild (distribution) to create a .pkg
# that installs the binary to /usr/local/bin/ and runs a postinstall script
# to set up the LaunchAgent, config, and default knowledge base.
#
# Usage: build-pkg.sh <dist_dir> <app_name> <version> <status_menu_binary>
#   e.g.  build-pkg.sh dist fit-basecamp 1.0.0 dist/BasecampStatus

DIST_DIR="${1:?Usage: build-pkg.sh <dist_dir> <app_name> <version> <status_menu_binary>}"
APP_NAME="${2:?Usage: build-pkg.sh <dist_dir> <app_name> <version> <status_menu_binary>}"
VERSION="${3:?Usage: build-pkg.sh <dist_dir> <app_name> <version> <status_menu_binary>}"
STATUS_MENU_BINARY="${4:?Usage: build-pkg.sh <dist_dir> <app_name> <version> <status_menu_binary>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BINARY_PATH="$DIST_DIR/$APP_NAME"
IDENTIFIER="com.fit-basecamp.scheduler"

if [ ! -f "$BINARY_PATH" ]; then
  echo "Error: binary not found at $BINARY_PATH"
  echo "Run compile.sh first."
  exit 1
fi

PKG_NAME="$APP_NAME-$VERSION.pkg"
PKG_PATH="$DIST_DIR/$PKG_NAME"
PAYLOAD_DIR="$DIST_DIR/pkg-payload"
SCRIPTS_DIR="$DIST_DIR/pkg-scripts"
RESOURCES_DIR="$DIST_DIR/pkg-resources"
COMPONENT_PKG="$DIST_DIR/pkg-component.pkg"

echo ""
echo "Building pkg: $PKG_NAME..."

# --- Clean previous artifacts ------------------------------------------------

rm -rf "$PAYLOAD_DIR" "$SCRIPTS_DIR" "$RESOURCES_DIR" "$COMPONENT_PKG"
rm -f "$PKG_PATH"

# --- Create payload (files to install) ---------------------------------------

mkdir -p "$PAYLOAD_DIR/usr/local/bin"
mkdir -p "$PAYLOAD_DIR/usr/local/share/fit-basecamp/config"

cp "$BINARY_PATH" "$PAYLOAD_DIR/usr/local/bin/$APP_NAME"
chmod +x "$PAYLOAD_DIR/usr/local/bin/$APP_NAME"

cp "$PROJECT_DIR/config/scheduler.json" "$PAYLOAD_DIR/usr/local/share/fit-basecamp/config/scheduler.json"
cp "$SCRIPT_DIR/uninstall.sh" "$PAYLOAD_DIR/usr/local/share/fit-basecamp/uninstall.sh"
chmod +x "$PAYLOAD_DIR/usr/local/share/fit-basecamp/uninstall.sh"

# Template files (shared location — binary reads from here instead of embedding)
cp -R "$PROJECT_DIR/template" "$PAYLOAD_DIR/usr/local/share/fit-basecamp/template"

# Status menu binary
cp "$STATUS_MENU_BINARY" "$PAYLOAD_DIR/usr/local/bin/BasecampStatus"
chmod +x "$PAYLOAD_DIR/usr/local/bin/BasecampStatus"

# --- Create scripts directory ------------------------------------------------

mkdir -p "$SCRIPTS_DIR"
cp "$SCRIPT_DIR/postinstall" "$SCRIPTS_DIR/postinstall"
chmod +x "$SCRIPTS_DIR/postinstall"

# --- Build component package -------------------------------------------------

pkgbuild \
  --root "$PAYLOAD_DIR" \
  --scripts "$SCRIPTS_DIR" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location "/" \
  "$COMPONENT_PKG"

# --- Create distribution resources -------------------------------------------

mkdir -p "$RESOURCES_DIR"
cp "$SCRIPT_DIR/welcome.html" "$RESOURCES_DIR/welcome.html"
cp "$SCRIPT_DIR/conclusion.html" "$RESOURCES_DIR/conclusion.html"

# --- Create distribution.xml ------------------------------------------------

DIST_XML="$DIST_DIR/distribution.xml"
cat > "$DIST_XML" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>Basecamp ${VERSION}</title>
    <welcome  file="welcome.html"    mime-type="text/html" />
    <conclusion file="conclusion.html" mime-type="text/html" />
    <options customize="never" require-scripts="false" hostArchitectures="arm64" />
    <domains enable_localSystem="true" />
    <pkg-ref id="$IDENTIFIER" version="$VERSION">pkg-component.pkg</pkg-ref>
    <choices-outline>
        <line choice="$IDENTIFIER" />
    </choices-outline>
    <choice id="$IDENTIFIER" visible="false">
        <pkg-ref id="$IDENTIFIER" />
    </choice>
</installer-gui-script>
EOF

# --- Build distribution package ----------------------------------------------

productbuild \
  --distribution "$DIST_XML" \
  --resources "$RESOURCES_DIR" \
  --package-path "$DIST_DIR" \
  "$PKG_PATH"

# --- Clean up staging --------------------------------------------------------

rm -rf "$PAYLOAD_DIR" "$SCRIPTS_DIR" "$RESOURCES_DIR" "$COMPONENT_PKG" "$DIST_XML"

echo "  -> $PKG_NAME"
