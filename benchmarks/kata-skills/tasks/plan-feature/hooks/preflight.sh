#!/bin/sh
# Materialize the shared app + approved spec & design, then smoke-check the app.
set -eu
HOOK_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
FAMILY="$HOOK_DIR/../../.."
sh "$FAMILY/fixtures/materialize.sh" "$WORKDIR" spec.md design-a.md
cd "$WORKDIR/app" && node --test >/dev/null 2>&1
