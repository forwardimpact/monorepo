#!/bin/bash
set -e

# Build a macOS installer package (.pkg) for Basecamp.app.
#
# Creates a .pkg that installs Basecamp.app to /Applications/ and runs a
# postinstall script to set up config and default KB.
# Also removes old loose-binary installs if present.
#
# Usage: build-pkg.sh <dist_dir> <version>
#   e.g.  build-pkg.sh dist 1.0.0

DIST_DIR="${1:?Usage: build-pkg.sh <dist_dir> <version>}"
VERSION="${2:?Usage: build-pkg.sh <dist_dir> <version>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_PATH="$DIST_DIR/Basecamp.app"
APP_NAME="fit-basecamp"
IDENTIFIER="com.forwardimpact.basecamp"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: Basecamp.app not found at $APP_PATH"
  echo "Run 'just build-app' first."
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

# --- Create payload (Basecamp.app → /Applications/) -------------------------

mkdir -p "$PAYLOAD_DIR/Applications"
cp -R "$APP_PATH" "$PAYLOAD_DIR/Applications/Basecamp.app"

# --- Create scripts directory ------------------------------------------------

mkdir -p "$SCRIPTS_DIR"
cp "$SCRIPT_DIR/postinstall" "$SCRIPTS_DIR/postinstall"
chmod +x "$SCRIPTS_DIR/postinstall"

# --- Disable bundle relocation -----------------------------------------------
# By default pkgbuild marks app bundles as relocatable, so macOS will install
# updates wherever it finds an existing copy instead of /Applications/.

COMPONENT_PLIST="$DIST_DIR/pkg-component.plist"
pkgbuild --analyze --root "$PAYLOAD_DIR" "$COMPONENT_PLIST"
/usr/libexec/PlistBuddy -c "Set :0:BundleIsRelocatable false" "$COMPONENT_PLIST"

# --- Build component package -------------------------------------------------

pkgbuild \
  --root "$PAYLOAD_DIR" \
  --component-plist "$COMPONENT_PLIST" \
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

rm -rf "$PAYLOAD_DIR" "$SCRIPTS_DIR" "$RESOURCES_DIR" "$COMPONENT_PKG" "$COMPONENT_PLIST" "$DIST_XML"

echo "  -> $PKG_NAME"
