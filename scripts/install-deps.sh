#!/usr/bin/env bash
# Install external CLI dependencies into $HOME/.local.
# All version strings live here — the bootstrap action keys its deps cache
# on hashFiles('scripts/install-deps.sh'), so any version bump invalidates
# the cache automatically.
set -euo pipefail

PREFIX="${INSTALL_PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib"

# Tools installed here, in install order. The same list drives `--paths`.
TOOLS=(apm just gh rg gitleaks)

# `install-deps.sh --paths` prints the cache paths this script manages — each
# tool's lib directory plus its bin symlink — one per line. The bootstrap
# action feeds these into actions/cache so the deps cache holds only what this
# script installs, not unrelated tooling that shares the prefix (uv, Python,
# other XDG state under ~/.local). Layout is static, so this is correct even on
# a cold cache before anything is installed.
if [ "${1:-}" = "--paths" ]; then
  for tool in "${TOOLS[@]}"; do
    echo "$LIB_DIR/$tool"
    echo "$BIN_DIR/$tool"
  done
  exit 0
fi

mkdir -p "$BIN_DIR"

ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

# ── Helpers ──────────────────────────────────────────────────────

sha_verify() {
  if command -v sha256sum &>/dev/null; then
    echo "$1  $2" | sha256sum -c -
  else
    echo "$1  $2" | shasum -a 256 -c -
  fi
}

fetch_and_verify() {
  curl -fsSL -o "$2" "$1"
  sha_verify "$3" "$2"
}

extract_archive() {
  local archive="$1" dest="$2" strip="${3:-0}"
  case "$archive" in
    *.tar.gz)
      if [ "$strip" -gt 0 ]; then
        tar -xz -C "$dest" --strip-components="$strip" -f "$archive"
      else
        tar -xz -C "$dest" -f "$archive"
      fi
      ;;
    *.zip)
      unzip -q "$archive" -d "$dest"
      if [ "$strip" -gt 0 ]; then
        local top
        top=$(find "$dest" -mindepth 1 -maxdepth 1 -type d | head -1)
        find "$top" -mindepth 1 -maxdepth 1 -exec mv {} "$dest/" \;
        rmdir "$top"
      fi
      ;;
  esac
}

# install_tool NAME VERSION URL SHA256 BINARY_PATH [STRIP]
#
# Extracts the archive into $LIB_DIR/$NAME and symlinks the binary at
# $LIB_DIR/$NAME/$BINARY_PATH to $BIN_DIR/$NAME. Every tool follows this
# same layout so the cache paths are predictable.
install_tool() {
  local name="$1" version="$2" url="$3" sha256="$4" binary_path="$5" strip="${6:-0}"

  if "$BIN_DIR/$name" --version &>/dev/null; then
    echo "$name already installed"
    return 0
  fi

  local lib_dir="$LIB_DIR/$name"
  rm -rf "$lib_dir"
  mkdir -p "$lib_dir"

  local tmp_dir archive
  tmp_dir=$(mktemp -d)
  archive="$tmp_dir/$(basename "$url")"
  fetch_and_verify "$url" "$archive" "$sha256"
  extract_archive "$archive" "$lib_dir" "$strip"
  rm -rf "$tmp_dir"

  ln -sf "$lib_dir/$binary_path" "$BIN_DIR/$name"
  echo "Installed $name $("$BIN_DIR/$name" --version | head -1)"
}

# ── Platform resolution ──────────────────────────────────────────
#
# Each resolve_* function declares the same locals (version, target, sha256,
# binary_path, strip), resolves platform in the case block, builds the URL,
# and hands everything to install_tool.

resolve_apm() {
  local version="0.12.4"
  local target sha256 binary_path="apm" strip=1

  case "$OS-$ARCH" in
    linux-x86_64)
      target="${OS}-${ARCH}"
      sha256="a9be6afb9f33f63598d11a7de1029722fd2601aa2ecaebfe82f4903e12a23a52" ;;
    linux-aarch64)
      target="${OS}-${ARCH}"
      sha256="0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5" ;;
    darwin-x86_64)
      target="${OS}-${ARCH}"
      sha256="c76ef17fa3250f87131ee09d1c8e166fce535dc2d7cea6e44fc1c5d0e3df0bac" ;;
    darwin-arm64)
      target="${OS}-${ARCH}"
      sha256="1354eb636a2b84f03938a3bd8890175298f57650e6d8507f2d084d3c66c10fd0" ;;
    *) echo "::error::apm: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local url="https://github.com/microsoft/apm/releases/download/v${version}/apm-${target}.tar.gz"
  install_tool apm "$version" "$url" "$sha256" "$binary_path" "$strip"
}

resolve_just() {
  local version="1.50.0"
  local target sha256 binary_path="just" strip=0

  case "$OS-$ARCH" in
    linux-x86_64)
      target="x86_64-unknown-linux-musl"
      sha256="27e011cd6328fadd632e59233d2cf5f18460b8a8c4269acd324c1a8669f34db0" ;;
    linux-aarch64)
      target="aarch64-unknown-linux-musl"
      sha256="3beb4967ce05883cf09ac12d6d128166eb4c6d0b03eff74b61018a6880655d7d" ;;
    darwin-x86_64)
      target="x86_64-apple-darwin"
      sha256="e4fa28fe63381ca32fad101e86d4a1da7cd2d34d1b080985a37ec9dc951922fe" ;;
    darwin-arm64)
      target="aarch64-apple-darwin"
      sha256="891262207663bff1aa422dbe799a76deae4064eaa445f14eb28aef7a388222cd" ;;
    *) echo "::error::just: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local url="https://github.com/casey/just/releases/download/${version}/just-${version}-${target}.tar.gz"
  install_tool just "$version" "$url" "$sha256" "$binary_path" "$strip"
}

resolve_gh() {
  local version="2.63.2"
  local target sha256 binary_path="bin/gh" strip=1

  case "$OS-$ARCH" in
    linux-x86_64)
      target="${OS}_amd64"
      sha256="912fdb1ca29cb005fb746fc5d2b787a289078923a29d0f9ec19a0b00272ded00" ;;
    linux-aarch64)
      target="${OS}_arm64"
      sha256="0f31e2a8549c64b5c1679f0b99ce5e0dac7c91da9e86f6246adb8805b0f0b4bb" ;;
    darwin-x86_64)
      target="macOS_amd64"
      sha256="a5f80b98819d753449224288fd089405b19cabd128c1cbc92922fd6d44e5ee5b" ;;
    darwin-arm64)
      target="macOS_arm64"
      sha256="0a53c536c8cc7d1c72c75ff836b018bb7f4351dd1c1c87711da4adf6b36824ee" ;;
    *) echo "::error::gh: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local ext="tar.gz"
  [ "$OS" = "darwin" ] && ext="zip"
  local url="https://github.com/cli/cli/releases/download/v${version}/gh_${version}_${target}.${ext}"
  install_tool gh "$version" "$url" "$sha256" "$binary_path" "$strip"
}

resolve_rg() {
  local version="15.1.0"
  local target sha256 binary_path="rg" strip=1

  case "$OS-$ARCH" in
    linux-x86_64)
      target="x86_64-unknown-linux-musl"
      sha256="1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599" ;;
    linux-aarch64)
      target="aarch64-unknown-linux-gnu"
      sha256="2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e" ;;
    darwin-x86_64)
      target="x86_64-apple-darwin"
      sha256="64811cb24e77cac3057d6c40b63ac9becf9082eedd54ca411b475b755d334882" ;;
    darwin-arm64)
      target="aarch64-apple-darwin"
      sha256="378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715" ;;
    *) echo "::error::rg: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local url="https://github.com/BurntSushi/ripgrep/releases/download/${version}/ripgrep-${version}-${target}.tar.gz"
  install_tool rg "$version" "$url" "$sha256" "$binary_path" "$strip"
}

resolve_gitleaks() {
  local version="8.30.1"
  local target sha256 binary_path="gitleaks" strip=0

  case "$OS-$ARCH" in
    linux-x86_64)
      target="linux_x64"
      sha256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" ;;
    linux-aarch64)
      target="linux_arm64"
      sha256="e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080" ;;
    darwin-x86_64)
      target="darwin_x64"
      sha256="dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709" ;;
    darwin-arm64)
      target="darwin_arm64"
      sha256="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5" ;;
    *) echo "::error::gitleaks: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local url="https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${target}.tar.gz"
  install_tool gitleaks "$version" "$url" "$sha256" "$binary_path" "$strip"
}

# ── Install ──────────────────────────────────────────────────────

for tool in "${TOOLS[@]}"; do
  "resolve_$tool"
done
