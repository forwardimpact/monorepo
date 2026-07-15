#!/usr/bin/env bash
# Install the FIT environment: external CLI tools and/or pre-compiled fit-*
# binaries. One code path for every environment — CI (fit-bootstrap), Claude
# session hooks, and `just install` all run this.
#
# Two install channels, chosen by platform, favouring official packaging where
# one exists:
#
#   Darwin  — Homebrew. Standard homebrew-core formulae (just, gh, ripgrep,
#             gitleaks) and the forwardimpact/homebrew-tap `fit-gear` cask (which
#             ships every fit-* CLI and coaligned). Versions track what brew and
#             the tap publish. `brew --prefix`/bin is already on PATH.
#   Linux   — pinned, SHA256-verified upstream archives into $HOME/.local. Every
#             third-party version + SHA lives here; fit-* binaries are pinned by
#             release tag (FIT_GEAR_RELEASE) and verified against a .sha256
#             sidecar. This is the reproducible, cacheable path.
#
# Two tools stay on the pinned download path on BOTH platforms (no brew): `claude`
# is the SDK-embedded Claude Code CLI whose version must track
# @anthropic-ai/claude-agent-sdk in libraries/libharness/package.json, and `apm`
# is pinned to a version other tooling (benchmarks, the benchmark action) agrees
# on. Moving either onto brew later is a one-line TOOL_TABLE edit.
#
# This file is published verbatim as a GitHub Release asset (fit-install.sh),
# so any environment can bootstrap with a single line, no repo checkout needed:
#
#   curl -fsSL <release-url>/fit-install.sh | bash -s -- fit-trace fit-wiki
#
# Usage:
#   fit-install.sh [--paths] [NAME ...]
#
#   NAME   An external tool (apm, just, gh, rg, gitleaks, claude) or a gear binary —
#          any fit-* CLI (fit-trace, fit-harness, fit-wiki, …) or coaligned.
#          With no NAME, installs the default dev/CI tool set.
#   --paths  Print the cache paths the requested names manage, one per line,
#            and exit. Consumed by fit-bootstrap to scope its actions/cache.
#            On Darwin, brew-managed tools emit nothing (brew installs globally
#            and is idempotent); only the $HOME/.local download tools are cached.
set -euo pipefail

PREFIX="${INSTALL_PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib"

# Default dev/CI tool set, in install order — the third-party external tools
# every job needs (scripts/bootstrap.sh runs `just`), `claude` (the Claude Code
# native CLI the Agent SDK spawns — fit-harness/fit-benchmark point at it via
# pathToClaudeCodeExecutable), plus our own gear binaries: coaligned, which the
# instruction checks run, and the five fit-* CLIs the kata-* skills invoke.
# This set is ALWAYS installed; any named gear CLIs add to it. The same list
# drives `--paths`.
DEFAULT_TOOLS=(apm just gh rg gitleaks claude coaligned
  fit-wiki fit-xmr fit-trace fit-doc fit-terrain)

# ── gear binary release coordinates (Linux download path) ────────
# Every installable gear binary (fit-trace, fit-wiki, fit-harness, …, plus
# coaligned) ships in the gear bundle, so one release tag carries them all. The
# publish step stamps the live tag into the released copy of this script; any
# caller may override via the environment to pin a different release. On Darwin
# the fit-gear cask supersedes this — the tap versions the gear set there.
FIT_RELEASE_REPO="${FIT_RELEASE_REPO:-forwardimpact/monorepo}"
FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.1.14}"

# ── tool registry ────────────────────────────────────────────────
# The routing table: how each external tool is installed on Darwin.
#   formula   — a homebrew-core formula (brew install <token>)
#   cask      — a homebrew cask (brew install --cask <token>)
#   download  — never brew, on any platform; pinned+verified download into
#               $HOME/.local (the resolve_<name> function below). This is the
#               escape hatch for version-pinned tools (claude, apm).
# On Linux every external tool uses its resolve_<name>, regardless of kind.
#
#            name      kind      brew-token
TOOL_TABLE="
apm       download  -
just      formula   just
gh        formula   gh
rg        formula   ripgrep
gitleaks  formula   gitleaks
claude    download  -
"

# The gear cask ships ALL gear CLIs (every fit-* plus coaligned) via `binary`
# stanzas that symlink each one onto brew's bin. The fully-qualified name
# auto-adds the tap, so no separate `brew tap` step is needed.
GEAR_CASK="forwardimpact/homebrew-tap/fit-gear"

ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
IS_DARWIN=0
[ "$OS" = "darwin" ] && IS_DARWIN=1

# Raw gear-binary download channel. The release compiles raw per-CLI gear
# assets only for linux-x64 (the one Linux target the bootstrap installer
# consumes); Darwin gets them from the fit-gear cask. linux-aarch64 has NO raw
# gear asset — arm64 gear ships via Homebrew (spec 2190), and the arm64 release
# runner builds every gear CLI from source, so it never needs a pre-built one.
# So on linux-aarch64 the gear-binary install is skipped rather than hard-failed,
# which is what lets a `ubuntu-24.04-arm` build runner bootstrap at all.
GEAR_DOWNLOAD=0
[ "$OS-$ARCH" = "linux-x86_64" ] && GEAR_DOWNLOAD=1

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

# A "gear binary" is one of our own bun-compiled CLIs: every fit-* CLI plus
# coaligned. On Darwin they all come from the fit-gear cask; on Linux each is a
# bare {name}-{target} file in the gear release beside a .sha256 sidecar.
is_gear_binary() { case "$1" in fit-*|coaligned) return 0 ;; *) return 1 ;; esac; }

# tool_field NAME COLUMN(kind|token) — look up a column in TOOL_TABLE. Prints
# nothing (and returns non-zero via the empty read) for an unknown name.
tool_field() {
  local want="$1" col="$2" n kind token
  while read -r n kind token; do
    [ -z "$n" ] && continue
    if [ "$n" = "$want" ]; then
      case "$col" in
        kind)  printf '%s\n' "$kind" ;;
        token) printf '%s\n' "$token" ;;
      esac
      return 0
    fi
  done <<EOF
$TOOL_TABLE
EOF
}

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
  # Emit only the cache paths each name manages so the cache holds nothing
  # unrelated that shares the prefix.
  #
  #   Linux — external tools cache as a lib dir + bin symlink; gear binaries are
  #           single files in BIN_DIR.
  #   Darwin — brew-managed tools (formulae + the gear cask) emit NOTHING: brew
  #           installs globally into its own prefix and is idempotent, so the
  #           bootstrap action re-runs `brew install` each time rather than
  #           caching brittle Cellar/Caskroom symlinks. Only the download tools
  #           (apm, claude) live in $HOME/.local and are worth caching.
  for name in "${NAMES[@]}"; do
    if is_gear_binary "$name"; then
      [ "$IS_DARWIN" = 1 ] && continue        # gear cask — not cached on Darwin
      [ "$GEAR_DOWNLOAD" = 0 ] && continue     # no raw gear asset (e.g. linux-arm64)
      echo "$BIN_DIR/$name"
    else
      if [ "$IS_DARWIN" = 1 ] && [ "$(tool_field "$name" kind)" != "download" ]; then
        continue                              # brew formula/cask — not cached
      fi
      echo "$LIB_DIR/$name"
      echo "$BIN_DIR/$name"
    fi
  done
  exit 0
fi

mkdir -p "$BIN_DIR"

# ── Helpers (download path) ──────────────────────────────────────

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
    *.tar.gz | *.tgz)
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

  if command -v "$name" &>/dev/null; then
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
# unpublished release) fails hard — there is no bunx/npx fallback. Linux only;
# on Darwin the fit-gear cask supersedes this.
install_gear_binary() {
  local name="$1"
  local target release base
  target="$(fit_target)"

  if command -v "$name" &>/dev/null; then
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

# ── Helpers (brew path, Darwin) ──────────────────────────────────

# Ensure `brew` is callable, sourcing its shellenv from the standard prefixes if
# it is installed but not yet on PATH (fresh shells, some CI images). A genuinely
# absent brew fails hard — Darwin has no download fallback for brew-managed tools.
require_brew() {
  if ! command -v brew &>/dev/null; then
    local p
    for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [ -x "$p" ]; then eval "$("$p" shellenv)"; break; fi
    done
  fi
  command -v brew &>/dev/null || {
    echo "::error::brew not found on Darwin; install Homebrew first" >&2
    exit 1
  }
}

# brew_install_formula TOKEN NAME — install a homebrew-core formula if its
# command isn't already present. `brew list` short-circuits reinstalls so this
# is cheap to re-run (the bootstrap action always runs the install step on macOS).
brew_install_formula() {
  local token="$1" name="$2"
  require_brew
  brew list --formula "$token" &>/dev/null || brew install "$token"
  echo "Installed $name $("$name" --version 2>/dev/null | head -1)"
}

# brew_install_cask TOKEN NAME — the general single-tool cask case. Unused today
# (kept for when a download tool moves to a cask), mirrors the formula helper.
brew_install_cask() {
  local token="$1" name="$2"
  require_brew
  brew list --cask "${token##*/}" &>/dev/null || brew install --cask "$token"
  echo "Installed $name $("$name" --version 2>/dev/null | head -1)"
}

# brew_install_gear — install the fit-gear cask once. One cask provisions every
# gear CLI, so the latch stops us re-running brew for each gear name in a run.
_GEAR_CASK_DONE=0
brew_install_gear() {
  [ "$_GEAR_CASK_DONE" = 1 ] && return 0
  require_brew
  brew list --cask "${GEAR_CASK##*/}" &>/dev/null || brew install --cask "$GEAR_CASK"
  _GEAR_CASK_DONE=1
  echo "Installed gear cask (${GEAR_CASK##*/})"
}

# ── Platform resolution (download path) ──────────────────────────
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
      # apm names its arm64 asset apm-linux-arm64, not the uname -m "aarch64".
      target="linux-arm64"
      sha256="4b64ff40b2b70ae3c97eb64a608cadcb06c4713cd878708c9685a12394278ca0" ;;
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

resolve_claude() {
  # The Claude Code native CLI the Agent SDK spawns. It ships inside the SDK's
  # platform-specific optional dependency (@anthropic-ai/claude-agent-sdk-<plat>),
  # which `bun build --compile` does NOT embed — so a compiled fit-harness /
  # fit-benchmark cannot self-resolve it. We install the version-matched binary
  # here and libharness points the SDK at it via pathToClaudeCodeExecutable.
  #
  # VERSION MUST TRACK @anthropic-ai/claude-agent-sdk in
  # libraries/libharness/package.json — a Dependabot bump there requires a
  # matching version + sha256 bump here, or the spawned CLI drifts from the SDK
  # protocol. This is why claude stays on the pinned download path (no brew) on
  # both platforms. The tarball is the npm platform package (top-level `package/`,
  # so strip=1); its sole exported binary is `package/claude`.
  local version="0.3.170"
  local pkg sha256 binary_path="claude" strip=1

  case "$OS-$ARCH" in
    linux-x86_64)
      pkg="linux-x64"
      sha256="0a20346fa0bb6a1afc8c1d1bd214ddb12c6bcca3e926cd50c6a0830dd57f2112" ;;
    linux-aarch64)
      pkg="linux-arm64"
      sha256="0b286e784c35d690f419464ce1a8ee3187f548105aaa42e2b4f5e2f4ecd2d535" ;;
    darwin-x86_64)
      pkg="darwin-x64"
      sha256="c04d595043630fcc1ae4a1c51115b5e24bd2d80cc9f4de66a1ef6192f21e2171" ;;
    darwin-arm64)
      pkg="darwin-arm64"
      sha256="c8e19615c13f639743b766d15365e51518ab16e7716b68fdcd81a3cf4e1651a2" ;;
    *) echo "::error::claude: unsupported platform $OS-$ARCH" >&2; exit 1 ;;
  esac

  local url="https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-${pkg}/-/claude-agent-sdk-${pkg}-${version}.tgz"
  install_tool claude "$version" "$url" "$sha256" "$binary_path" "$strip"
}

# ── Install ──────────────────────────────────────────────────────

# install_one NAME — route one tool to its install channel for this platform.
install_one() {
  local name="$1" kind

  if command -v "$name" &>/dev/null; then
    echo "$name already installed"
    return 0
  fi

  if is_gear_binary "$name"; then
    if [ "$IS_DARWIN" = 1 ]; then
      brew_install_gear
    elif [ "$GEAR_DOWNLOAD" = 1 ]; then
      install_gear_binary "$name"
    else
      # No raw gear asset for this platform (e.g. linux-aarch64). Skip rather
      # than hard-fail: the arm64 release runner builds gear from source and
      # never needs a pre-built one, and arm64 runtime installs go via Homebrew.
      echo "::notice::skipping gear binary '$name' on $OS-$ARCH — no raw gear asset (arm64 gear ships via Homebrew; CI builds from source)"
    fi
    return 0
  fi

  kind="$(tool_field "$name" kind)"
  if [ -z "$kind" ]; then
    echo "::error::unknown tool '$name' (expected one of: ${DEFAULT_TOOLS[*]}, a fit-* CLI, or coaligned)" >&2
    exit 1
  fi

  if [ "$IS_DARWIN" = 1 ] && [ "$kind" = "formula" ]; then
    brew_install_formula "$(tool_field "$name" token)" "$name"
  elif [ "$IS_DARWIN" = 1 ] && [ "$kind" = "cask" ]; then
    brew_install_cask "$(tool_field "$name" token)" "$name"
  else
    "resolve_$name"
  fi
}

for name in "${NAMES[@]}"; do
  install_one "$name"
done
