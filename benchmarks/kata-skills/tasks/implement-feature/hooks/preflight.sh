#!/bin/sh
# Materialize the shared app + approved spec/design/plan, then confirm the
# baseline app tests pass before the agent starts (scaffold is sane).
set -eu
HOOK_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
FAMILY="$HOOK_DIR/../../.."
sh "$FAMILY/fixtures/materialize.sh" "$WORKDIR" spec.md design-a.md plan-a.md
cd "$WORKDIR/app" && node --test >/dev/null 2>&1
