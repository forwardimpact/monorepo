#!/bin/sh
# Materialize the shared app + approved spec, then smoke-check the app is sane.
set -eu
HOOK_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
FAMILY="$HOOK_DIR/../../.."
sh "$FAMILY/fixtures/materialize.sh" "$WORKDIR" spec.md
cd "$WORKDIR/app" && node --test >/dev/null 2>&1
