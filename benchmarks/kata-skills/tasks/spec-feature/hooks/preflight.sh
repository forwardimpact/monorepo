#!/bin/sh
# Materialize the shared app + spec inputs, then smoke-check the app is sane.
set -eu
HOOK_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
FAMILY="$HOOK_DIR/../../.."
sh "$FAMILY/fixtures/materialize.sh" "$WORKDIR" brief.md jtbd-excerpt.md
cd "$WORKDIR/app" && node --test >/dev/null 2>&1
