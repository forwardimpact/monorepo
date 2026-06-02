#!/usr/bin/env bash
# Install the dependencies needed for synthetic data generation
# (`just synthetic` / `just synthetic-update`).
#
# These three tools — the Synthea JAR (Java), the SDV package (Python), and
# @faker-js/faker (npm) — are heterogeneous and heavy, and synthetic generation
# is a rare, deliberate action. They are intentionally kept OUT of package.json
# and the default `bun install`, so routine workflow runs and agent dispatches
# stay lean. Provision them on demand with `just synthetic-deps`; report status
# with `just synthetic-deps --check`.
#
# All version strings live here — bump them in one place.
set -euo pipefail

SYNTHEA_VERSION="3.3.0"
SDV_VERSION="1.37.0"
FAKER_VERSION="10.4.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNTHEA_DIR="$ROOT/vendor/synthea"
# Runtime resolves the JAR from $SYNTHEA_JAR or this default path
# (see libraries/libterrain/src/cli-helpers.js).
SYNTHEA_JAR="$SYNTHEA_DIR/synthea-with-dependencies.jar"

# ── Helpers ──────────────────────────────────────────────────────

# Provision the Synthea fat JAR into vendor/synthea/ (gitignored). Idempotent:
# an existing JAR is left in place. Java is required to *run* Synthea, not to
# download it, so a missing JVM is a warning here, surfaced fully by --check.
install_synthea() {
  if [ -f "$SYNTHEA_JAR" ]; then
    echo "synthea already installed at $SYNTHEA_JAR"
    return 0
  fi
  mkdir -p "$SYNTHEA_DIR"
  echo "Downloading Synthea v$SYNTHEA_VERSION..."
  curl -fSL -o "$SYNTHEA_JAR" \
    "https://github.com/synthetichealth/synthea/releases/download/v${SYNTHEA_VERSION}/synthea-with-dependencies.jar"
  echo "Installed synthea v$SYNTHEA_VERSION at $SYNTHEA_JAR"
  command -v java >/dev/null 2>&1 ||
    echo "::warning::synthea: Java not found on PATH — install Java 11+ to run it"
}

# Install SDV so the system `python3` can `import sdv` (the contract SdvTool
# relies on). Prefer uv when present for speed; fall back to pip --user. Both
# land where the python3 on PATH can import them.
install_sdv() {
  if python3 -c "import sdv" >/dev/null 2>&1; then
    echo "sdv already installed ($(python3 -c 'import sdv; print(sdv.__version__)' 2>/dev/null))"
    return 0
  fi
  echo "Installing sdv==$SDV_VERSION..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$(command -v python3)" "sdv==$SDV_VERSION" ||
      python3 -m pip install --user "sdv==$SDV_VERSION"
  else
    python3 -m pip install --user "sdv==$SDV_VERSION"
  fi
  if ! python3 -c "import sdv" >/dev/null 2>&1; then
    echo "::error::sdv: install completed but 'python3 -c \"import sdv\"' still fails" >&2
    exit 1
  fi
  echo "Installed sdv $(python3 -c 'import sdv; print(sdv.__version__)' 2>/dev/null)"
}

# Install @faker-js/faker into the workspace without touching package.json or
# the lockfile (--no-save). Pinned to an exact version so seeded faker output
# stays reproducible despite not being locked. faker is declared as an optional
# peerDependency of libsyntheticgen, so bun does not auto-install it otherwise.
install_faker() {
  if [ -d "$ROOT/node_modules/@faker-js/faker" ]; then
    echo "faker already installed"
    return 0
  fi
  echo "Installing @faker-js/faker@$FAKER_VERSION (--no-save)..."
  ( cd "$ROOT" && bun add --no-save "@faker-js/faker@$FAKER_VERSION" )
  echo "Installed @faker-js/faker@$FAKER_VERSION"
}

# ── Status ───────────────────────────────────────────────────────
#
# `--check` reports availability of each tool without installing, and exits
# non-zero if anything is missing so callers can gate on it.
synthetic_check() {
  local missing=0

  if [ -f "$SYNTHEA_JAR" ] && command -v java >/dev/null 2>&1; then
    echo "synthea: ok ($(java -version 2>&1 | head -1))"
  elif [ -f "$SYNTHEA_JAR" ]; then
    echo "synthea: JAR present but Java not found (install Java 11+)"; missing=1
  else
    echo "synthea: not installed"; missing=1
  fi

  if python3 -c "import sdv" >/dev/null 2>&1; then
    echo "sdv: ok ($(python3 -c 'import sdv; print(sdv.__version__)' 2>/dev/null))"
  else
    echo "sdv: not installed"; missing=1
  fi

  if [ -d "$ROOT/node_modules/@faker-js/faker" ]; then
    echo "faker: ok"
  else
    echo "faker: not installed"; missing=1
  fi

  [ "$missing" -eq 0 ] || {
    echo "synthetic-deps: incomplete (run 'just synthetic-deps')" >&2
    return 1
  }
  echo "synthetic-deps: all present"
}

# ── Entry ────────────────────────────────────────────────────────

if [ "${1:-}" = "--check" ]; then
  synthetic_check || exit 1
  exit 0
fi

install_synthea
install_sdv
install_faker
echo "synthetic-deps: done"
