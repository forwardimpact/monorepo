#!/bin/sh
set -u
APP="$AGENT_CWD/app"
FAIL=0

if [ ! -d "$APP" ]; then
  echo "{\"test\":\"app-present\",\"pass\":false}" >&"$RESULTS_FD"
  exit 1
fi

# Drop in the hidden feature test (the agent never saw it), then run the full
# suite: baseline tests guard against regressions, the hidden test proves the
# --filter feature. Exit code is the verdict.
cp "$HOOKS_DIR/feature.test.js" "$APP/test/feature.test.js"
if (cd "$APP" && node --test >/dev/null 2>&1); then
  echo "{\"test\":\"tests-pass\",\"pass\":true}" >&"$RESULTS_FD"
else
  echo "{\"test\":\"tests-pass\",\"pass\":false,\"message\":\"baseline or feature tests failed\"}" >&"$RESULTS_FD"
  FAIL=1
fi

[ "$FAIL" = 0 ] && exit 0 || exit 1
