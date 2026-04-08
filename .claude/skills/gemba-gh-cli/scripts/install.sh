#!/usr/bin/env bash
# Install the GitHub CLI (gh) from the official tarball.
# Usage: install.sh [version]
#
# The tarball method is preferred over apt-get because sandboxed environments
# often fail GPG key verification.

set -euo pipefail

VERSION="${1:-2.63.2}"
ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")

wget -q "https://github.com/cli/cli/releases/download/v${VERSION}/gh_${VERSION}_linux_${ARCH}.tar.gz" \
  -O /tmp/gh.tar.gz
tar -xzf /tmp/gh.tar.gz -C /tmp
cp "/tmp/gh_${VERSION}_linux_${ARCH}/bin/gh" /usr/local/bin/gh

echo "Installed gh $(gh --version | head -1)"
