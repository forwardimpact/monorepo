#!/usr/bin/env bash
# Install the FIT environment: external CLI tools and/or pre-compiled fit-*/gemba-*
# binaries. One code path for every environment — CI (fit-bootstrap), Claude
# session hooks, and `just install` all run this.
#
# Two install channels, chosen by platform, favouring official packaging where
# one exists:
#
#   Darwin  — Homebrew. Standard homebrew-core formulae (just, gh, ripgrep,
#             gitleaks) and the forwardimpact/homebrew-tap `fit-gear` cask (which
#             ships every fit-*/gemba-* CLI and coaligned). Versions track what brew and
#             the tap publish. `brew --prefix`/bin is already on PATH.
#   Linux   — pinned, SHA256-verified upstream archives into $HOME/.local. Every
#             third-party version + SHA lives here; fit-*/gemba-* binaries are pinned by
#             release tag (FIT_GEAR_RELEASE) and verified against a .sha256
#             sidecar. This is the reproducible, cacheable path.
#
# When the reproducible channel is unreachable — notably a Claude Code web
# session, whose network policy blocks github.com entirely (release assets
# included, for every repo) while allowing package registries — each tool falls
# back to a trusted registry: apt for the distro CLIs (ripgrep, just, gh,
# gitleaks) and the npm registry for our own gear CLIs (published as node
# launchers). claude already downloads from the npm registry, so it needs no
# fallback. apm has no trusted-registry build, so a blocked web session skips it
# rather than failing. See the CHANNELS section below.
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
#   curl -fsSL <release-url>/fit-install.sh | bash -s -- gemba-trace gemba-wiki
#
# Usage:
#   fit-install.sh [--paths] [NAME ...]
#
#   NAME   An external tool (apm, just, gh, rg, gitleaks, claude) or a gear binary —
#          any fit-*/gemba-* CLI (gemba-trace, gemba-harness, gemba-wiki, …) or coaligned.
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
# native CLI the Agent SDK spawns — gemba-harness/gemba-benchmark point at it via
# pathToClaudeCodeExecutable), plus our own gear binaries: coaligned, which the
# instruction checks run, and the gemba-*/fit-* CLIs the kata-* skills invoke.
# This set is ALWAYS installed; any named gear CLIs add to it. The same list
# drives `--paths`.
DEFAULT_TOOLS=(apm just gh rg gitleaks claude coaligned
  gemba-wiki gemba-xmr gemba-trace fit-doc fit-terrain)

# ── gear binary release coordinates (Linux download path) ────────
# Every installable gear binary (gemba-trace, gemba-wiki, gemba-harness, …, plus
# coaligned) ships in the gear bundle, so one release tag carries them all. The
# publish step stamps the live tag into the released copy of this script; any
# caller may override via the environment to pin a different release. On Darwin
# the fit-gear cask supersedes this — the tap versions the gear set there.
FIT_RELEASE_REPO="${FIT_RELEASE_REPO:-forwardimpact/monorepo}"
FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.2.0}"

# ── tool classification ──────────────────────────────────────────
# System-package-manager token for the four third-party CLIs a distro packages.
# The homebrew formula name and the Debian/Ubuntu package name are identical for
# all four, so one map serves both the brew (macOS) and apt (Linux) channels.
# The installed command can differ from the package name (ripgrep ships `rg`).
pkg_token() {
  case "$1" in
    rg)       echo ripgrep ;;
    just)     echo just ;;
    gh)       echo gh ;;
    gitleaks) echo gitleaks ;;
    *)        return 1 ;;
  esac
}

# A "system tool" is one a platform package manager can provide (the four
# above). Everything else is a gear binary, apm, or claude.
is_system_tool() { pkg_token "$1" >/dev/null 2>&1; }

# The gear cask ships ALL gear CLIs (every fit-*/gemba-* plus coaligned) via `binary`
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

# Bun compile target for the gear-binary download channel. Raw per-CLI assets
# exist only for linux-x64 and darwin-arm64; the dispatcher only calls this on a
# supported target (GEAR_DOWNLOAD gates it), and other platforms fall back to the
# npm channel (node launchers).
fit_target() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  echo "bun-linux-x64" ;;
    Darwin-arm64)  echo "bun-darwin-arm64" ;;
    *) echo "::error::no pre-compiled gear binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
}

# A "gear binary" is one of our own bun-compiled CLIs: every fit-*/gemba-* CLI plus
# coaligned. On Darwin they all come from the fit-gear cask; on Linux each is a
# bare {name}-{target} file in the gear release beside a .sha256 sidecar.
is_gear_binary() { case "$1" in fit-*|gemba-*|coaligned) return 0 ;; *) return 1 ;; esac; }

# ── --paths / argument parsing ───────────────────────────────────
# The default set is ALWAYS installed; named gear CLIs add to it (deduped). So
# `clis: fit-doc` yields the external tools plus fit-doc, never fit-doc alone —
# bootstrap.sh still finds `just`.
PRINT_PATHS=0
SOFT=0
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --paths) PRINT_PATHS=1 ;;
    --soft)  SOFT=1 ;;         # best-effort: report unavailable tools, still exit 0
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
      if [ "$IS_DARWIN" = 1 ] && is_system_tool "$name"; then
        continue                              # brew formula — installed in brew's prefix, not cached
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
# Download a pre-compiled gear binary (any fit-*/gemba-* CLI or coaligned) from its
# pinned gear release, verify it against the published .sha256 sidecar, and
# install it straight into BIN_DIR. Returns non-zero on any failure (missing
# asset, blocked network) so the dispatcher can fall back to the npm channel.
# Linux only; on Darwin the fit-gear cask supersedes this.
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
# it is installed but not yet on PATH (fresh shells, some CI images). Returns
# non-zero when brew is genuinely absent, so the caller's channel can step aside
# — the release channel resolves these tools on Darwin too.
require_brew() {
  if ! command -v brew &>/dev/null; then
    local p
    for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [ -x "$p" ]; then eval "$("$p" shellenv)"; break; fi
    done
  fi
  command -v brew &>/dev/null
}

# brew_install_formula TOKEN NAME — install a homebrew-core formula if its
# command isn't already present. `brew list` short-circuits reinstalls so this
# is cheap to re-run (the bootstrap action always runs the install step on macOS).
# Returns non-zero on any failure so the dispatcher can try the next channel.
brew_install_formula() {
  local token="$1" name="$2"
  require_brew || return 1
  brew list --formula "$token" &>/dev/null || brew install "$token" || return 1
  echo "Installed $name $("$name" --version 2>/dev/null | head -1)"
}

# brew_install_cask TOKEN NAME — the general single-tool cask case. Unused today
# (kept for when a download tool moves to a cask), mirrors the formula helper.
brew_install_cask() {
  local token="$1" name="$2"
  require_brew || return 1
  brew list --cask "${token##*/}" &>/dev/null || brew install --cask "$token" || return 1
  echo "Installed $name $("$name" --version 2>/dev/null | head -1)"
}

# brew_install_gear — install the fit-gear cask once. One cask provisions every
# gear CLI, so the latch stops us re-running brew for each gear name in a run.
_GEAR_CASK_DONE=0
brew_install_gear() {
  [ "$_GEAR_CASK_DONE" = 1 ] && return 0
  require_brew || return 1
  brew list --cask "${GEAR_CASK##*/}" &>/dev/null || brew install --cask "$GEAR_CASK" || return 1
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
  # which `bun build --compile` does NOT embed — so a compiled gemba-harness /
  # gemba-benchmark cannot self-resolve it. We install the version-matched binary
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
#
# Each tool resolves through an ordered list of CHANNELS; the first that
# succeeds wins. This is what makes one script correct on every platform AND in
# the restricted web-session sandbox. A channel returns 0 on success, or
# non-zero when it is inapplicable here or its install failed — so the loop
# moves to the next one. Channels run in `if`/`||` context, which disables
# errexit for the whole call chain, so an internal curl/apt failure is caught
# rather than aborting the script.
#
#   release      pinned, SHA-verified download into $HOME/.local (resolve_<name>).
#                Reproducible; the CI/local default. github-hosted tools are
#                gated on github reachability, since a web-session policy blocks
#                github.com outright — the download can never succeed there.
#   brew         Homebrew formula/cask (macOS only). The native macOS channel.
#   apt          Debian/Ubuntu package (Linux only). The trusted fallback when
#                github is blocked; archive.ubuntu.com is on every web allowlist.
#   npm          global install from the npm registry (any platform). Always
#                allowlisted, so it is the universal fallback for our gear CLIs
#                (published as node launchers).
#
# claude's "release" is an npm-registry tarball, not github, so it is NOT gated
# and works in web sessions as-is. apm has no channel but its github release, so
# a blocked web session skips it (reported, not fatal under --soft).

PRESENT=()      # already on PATH
INSTALLED=()    # freshly installed this run, via any channel
SKIPPED=()      # no channel could provide it (reported; fatal unless --soft)

# Probe github.com once, caching the verdict. Web-session network policies allow
# the npm/apt registries but block github.com, so github-hosted release assets
# — third-party or our own gear, whatever the repo — simply cannot download
# there. Detecting this lets the release channel step aside for a trusted one
# instead of dying on a raw `curl: (56)`.
GITHUB_NET=""   # "" (unprobed) | "ok" | "blocked"
github_reachable() {
  if [ -z "$GITHUB_NET" ]; then
    if curl -fsS --max-time 8 -o /dev/null "https://github.com" 2>/dev/null; then
      GITHUB_NET=ok
    else
      GITHUB_NET=blocked
      echo "note: github.com unreachable (network policy?) — using package registries (apt/npm) instead"
    fi
  fi
  [ "$GITHUB_NET" = ok ]
}

# Every release download is github-hosted EXCEPT claude, whose pinned tarball
# comes from the (always-allowlisted) npm registry — so it is never gated.
github_hosted() { [ "$1" != claude ]; }

# apt plumbing (Linux fallback): one guarded `apt-get update` per run, executed
# as root directly or via sudo when available.
AS_ROOT=""
[ "$(id -u)" != 0 ] && command -v sudo &>/dev/null && AS_ROOT="sudo"
_APT_UPDATED=0
apt_update_once() {
  [ "$_APT_UPDATED" = 1 ] && return 0
  $AS_ROOT env DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || return 1
  _APT_UPDATED=1
}

# ── Channels ─────────────────────────────────────────────────────

ch_release() {
  if github_hosted "$1"; then github_reachable || return 1; fi
  "resolve_$1"
}

ch_release_gear() {
  [ "$GEAR_DOWNLOAD" = 1 ] || return 1     # no raw gear asset (e.g. linux-arm64)
  github_reachable || return 1
  install_gear_binary "$1"
}

ch_brew()      { [ "$IS_DARWIN" = 1 ] && brew_install_formula "$(pkg_token "$1")" "$1"; }
ch_brew_gear() { [ "$IS_DARWIN" = 1 ] && brew_install_gear; }

ch_apt() {
  [ "$IS_DARWIN" = 0 ] || return 1
  local pkg; pkg="$(pkg_token "$1")" || return 1
  apt_update_once || return 1
  $AS_ROOT env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" >/dev/null 2>&1 || return 1
  echo "Installed $1 $("$1" --version 2>/dev/null | head -1) (apt $pkg)"
}

ch_npm() {
  # Our gear CLIs publish to npm as node launchers; a global install puts the
  # command on PATH (npm's global bin is already there). Not every gear CLI is
  # published (coaligned is not yet), so a 404 just falls through.
  npm install -g "$1" >/dev/null 2>&1 || return 1
  echo "Installed $1 $("$1" --version 2>/dev/null | head -1) (npm)"
}

# channels_for NAME — the ordered channel list for a tool on this platform.
# macOS resolves via its first channel (brew) since github is reachable there
# anyway; Linux CI/local hits `release` (pinned, reproducible); a blocked Linux
# web session falls through to the trusted registry.
channels_for() {
  if is_gear_binary "$1"; then
    echo "brew_gear release_gear npm"
  elif is_system_tool "$1"; then
    echo "brew release apt"
  else
    echo "release"        # apm, claude — pinned download only (claude via npm)
  fi
}

# install_one NAME — try each channel in order; first success wins.
install_one() {
  local name="$1" ch
  if command -v "$name" &>/dev/null; then
    PRESENT+=("$name")
    return 0
  fi
  for ch in $(channels_for "$name"); do
    if "ch_$ch" "$name"; then
      INSTALLED+=("$name")
      return 0
    fi
  done
  SKIPPED+=("$name")
}

for name in "${NAMES[@]}"; do
  install_one "$name"
done

# ── Summary ──────────────────────────────────────────────────────
# Steady state on one line; explicit lists for what changed or is missing. A
# warm session stays near-silent; a degraded one names exactly what it lacks.
[ "${#PRESENT[@]}" -gt 0 ]   && echo "tools ready (${#PRESENT[@]}): ${PRESENT[*]}"
[ "${#INSTALLED[@]}" -gt 0 ] && echo "tools installed (${#INSTALLED[@]}): ${INSTALLED[*]}"
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo "tools unavailable: ${SKIPPED[*]}" >&2
  if [ "$SOFT" = "1" ]; then
    echo "note: continuing without them (--soft); published gear CLIs still run via 'bunx <name>'" >&2
  else
    echo "::error::no install channel succeeded for: ${SKIPPED[*]}" >&2
    exit 1
  fi
fi
exit 0
