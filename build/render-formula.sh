#!/usr/bin/env bash
#
# Render a Homebrew formula for a bundle's Linux tarballs, in full, each release.
# The Linux analog of the macOS cask — but where the tap ships a committed cask
# skeleton (whose binary block render-cask-binaries.sh regenerates), it ships NO
# formula skeleton, so this writes the whole file. That also means a new bundle
# folds in with no hand-seeded tap file: adding its tag + manifest entry is
# enough, exactly as the spec 2190 scope promises.
#
#   Usage: render-formula.sh <formula-file> <token> <bundle> <version> \
#            <x64-sha> <arm64-sha> <cask-file>
#
#   token       the cask/formula token, e.g. fit-gear (names the file + class)
#   bundle      the manifest bundle, e.g. gear (names the release tag <bundle>@v*)
#   cask-file   the bundle's cask, read for desc/homepage so both packages agree
#
# The formula shape (version + both per-arch sha256 filled directly — no second
# rewrite pass): the tarball holds only self-contained CLI executables, so
# `bin.install Dir["*"]` installs exactly the bundle's manifest CLIs. Ends with
# `ruby -c` as a syntax gate.
set -euo pipefail

FORMULA="${1:?usage: render-formula.sh <formula-file> <token> <bundle> <version> <x64-sha> <arm64-sha> <cask-file>}"
TOKEN="${2:?missing token}"
BUNDLE="${3:?missing bundle}"
VERSION="${4:?missing version}"
X64_SHA="${5:?missing x64 sha}"
ARM64_SHA="${6:?missing arm64 sha}"
CASK="${7:?missing cask file}"

# Homebrew derives the class name from the file token: each "-" segment is
# capitalized and concatenated (fit-gear -> FitGear, fit-outpost -> FitOutpost).
CLASS="$(printf '%s' "$TOKEN" | awk -F- '{ o=""; for (i=1;i<=NF;i++) o = o toupper(substr($i,1,1)) substr($i,2); print o }')"

# Reuse the cask's human copy so the formula and cask describe the same product.
DESC="$(sed -n 's/^  desc "\(.*\)"$/\1/p' "$CASK" | head -1)"
HOMEPAGE="$(sed -n 's/^  homepage "\(.*\)"$/\1/p' "$CASK" | head -1)"
: "${DESC:=Forward Impact ${BUNDLE} CLIs}"
: "${HOMEPAGE:=https://www.forwardimpact.team}"

BASE="https://github.com/forwardimpact/monorepo/releases/download"

mkdir -p "$(dirname "$FORMULA")"

# #{version} stays literal for Homebrew to interpolate at install time; the
# shell only expands the ${...} values. The unquoted heredoc is safe because
# #{version} contains no '$'.
cat > "$FORMULA" <<EOF
class ${CLASS} < Formula
  desc "${DESC}"
  homepage "${HOMEPAGE}"
  version "${VERSION}"

  on_linux do
    on_intel do
      url "${BASE}/${BUNDLE}@v#{version}/${TOKEN}-linux-x64.tar.gz"
      sha256 "${X64_SHA}"
    end
    on_arm do
      url "${BASE}/${BUNDLE}@v#{version}/${TOKEN}-linux-arm64.tar.gz"
      sha256 "${ARM64_SHA}"
    end
  end

  def install
    # The tarball holds only self-contained CLI executables (assets inlined at
    # compile time), so install every entry.
    bin.install Dir["*"]
  end
end
EOF

ruby -c "$FORMULA"
