#!/usr/bin/env bash
# Install the FIT environment: external CLI tools and/or pre-compiled fit-*
# binaries, into $HOME/.local. One code path for every environment — CI
# (fit-bootstrap), Claude session hooks, and `just install` all run this.
#
# This file is published verbatim as a GitHub Release asset (fit-install.sh),
# so any environment can bootstrap with a single line, no repo checkout needed:
#
#   curl -fsSL <release-url>/fit-install.sh | bash -s -- fit-trace fit-wiki
#
# Usage:
#   fit-install.sh [--paths] [NAME ...]
#
#   NAME   An external tool (apm, just, gh, rg, gitleaks) or a gear binary —
#          any fit-* CLI (fit-trace, fit-harness, fit-wiki, …) or coaligned.
#          With no NAME, installs the default dev/CI tool set.
#   --paths  Print the cache paths the requested names manage, one per line,
#            and exit. Consumed by fit-bootstrap to scope its actions/cache.
#
# All third-party version strings and SHAs live here; the fit-* binaries are
# pinned by release tag (overridable via the FIT_GEAR_RELEASE env var below)
# and verified against the .sha256 sidecar published alongside each asset.
set -euo pipefail

PREFIX="${INSTALL_PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib"

# Default dev/CI tool set, in install order — the third-party external tools
# every job needs (scripts/bootstrap.sh runs `just`) plus coaligned, our own
# gear binary that the instruction checks run. This set is ALWAYS installed;
# any named gear CLIs add to it. The same list drives `--paths`.
DEFAULT_TOOLS=(apm just gh rg gitleaks coaligned)

# ── gear binary release coordinates ──────────────────────────────
# Every installable gear binary (fit-trace, fit-wiki, fit-harness, …, plus
# coaligned) ships in the gear bundle, so one release tag carries them all. The
# publish step stamps the live tag into the released copy of this script; any
# caller may override via the environment to pin a different release.
FIT_RELEASE_REPO="${FIT_RELEASE_REPO:-forwardimpact/monorepo}"
FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.1.10}"

# Bun compile target for this platform. Binaries are built only for linux-x64
# and darwin-arm64; any other platform is unsupported and fails hard — this is
# the binary distribution path, with no bunx/npx fallback.
fit_target() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  echo "bun-linux-x64" ;;
    Darwin-arm64)  echo "bun-darwin-arm64" ;;
    *) echo "::error::no pre-compiled gear binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
}

# A "gear binary" is one of our own bun-compiled CLIs published in the gear
# release as a bare {name}-{target} file beside a .sha256 sidecar: every fit-*
# CLI plus coaligned. They install straight into BIN_DIR (no lib dir), unlike
# the third-party external tools that extract from an upstream archive.
is_gear_binary() { case "$1" in fit-*|coaligned) return 0 ;; *) return 1 ;; esac; }

# ── --paths / argument parsing ───────────────────────────────────
# The default set is ALWAYS installed; named gear CLIs add to it (deduped). So
# `clis: fit-doc` yields the external tools plus fit-doc, never fit-doc alone —
# bootstrap.sh still finds `just`.
PRINT_PATHS=0
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --paths) PRINT_PATHS=1 ;;
    *)       EXTRA+=("$arg") ;;
  esac
done
NAMES=("${DEFAULT_TOOLS[@]}")
if [ "${#EXTRA[@]}" -gt 0 ]; then
  for n in "${EXTRA[@]}"; do
    case " ${NAMES[*]} " in
      *" $n "*) ;;            # already in the default set
      *)        NAMES+=("$n") ;;
    esac
  done
fi

if [ "$PRINT_PATHS" = "1" ]; then
  # External tools cache as a lib dir + bin symlink; fit-* binaries are single
  # files installed straight into BIN_DIR. Emit only what each name manages so
  # the cache holds nothing unrelated that shares the prefix.
  for name in "${NAMES[@]}"; do
    if is_gear_binary "$name"; then
      echo "$BIN_DIR/$name"
    else
      echo "$LIB_DIR/$name"
      echo "$BIN_DIR/$name"
    fi
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
# $LIB_DIR/$NAME/$BINARY_PATH to $BIN_DIR/$NAME. Every external tool follows
# this same layout so the cache paths are predictable.
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

# install_gear_binary NAME
#
# Download a pre-compiled gear binary (any fit-* CLI or coaligned) from its
# pinned gear release, verify it against the published .sha256 sidecar, and
# install it straight into BIN_DIR. A missing binary (unsupported platform or
# unpublished release) fails hard — there is no bunx/npx fallback.
install_gear_binary() {
  local name="$1"
  local target release base
  target="$(fit_target)"

  if "$BIN_DIR/$name" --version &>/dev/null; then
    echo "$name already installed"
    return 0
  fi

  release="$FIT_GEAR_RELEASE"
  base="https://github.com/${FIT_RELEASE_REPO}/releases/download/${release}/${name}-${target}"

  local tmp_dir bin_tmp sha
  tmp_dir=$(mktemp -d)
  bin_tmp="$tmp_dir/$name"
  curl -fsSL -o "$bin_tmp" "$base"
  sha="$(curl -fsSL "${base}.sha256")"
  sha_verify "$sha" "$bin_tmp"

  install -m 0755 "$bin_tmp" "$BIN_DIR/$name"
  rm -rf "$tmp_dir"
  echo "Installed $name $("$BIN_DIR/$name" --version 2>/dev/null | head -1) ($release)"
}

# ── Platform resolution (external tools) ─────────────────────────
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

for name in "${NAMES[@]}"; do
  if is_gear_binary "$name"; then
    install_gear_binary "$name"
  elif declare -F "resolve_$name" >/dev/null; then
    "resolve_$name"
  else
    echo "::error::unknown tool '$name' (expected one of: ${DEFAULT_TOOLS[*]}, a fit-* CLI, or coaligned)" >&2
    exit 1
  fi
done
