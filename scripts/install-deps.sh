#!/usr/bin/env bash
# Compatibility shim. The installer is now scripts/fit-install.sh — one code
# path shared by CI (fit-bootstrap), Claude session hooks, and `just install`,
# and published as a release artifact for curl|bash bootstrap. This shim keeps
# the historical entry point working; it forwards every argument, including
# the `--paths` cache-path query that fit-bootstrap calls.
#
# New code should call scripts/fit-install.sh directly.
set -euo pipefail
exec "$(dirname "$0")/fit-install.sh" "$@"
