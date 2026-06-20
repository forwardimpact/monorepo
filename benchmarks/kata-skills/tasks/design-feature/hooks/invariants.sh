#!/bin/sh
set -u
DESIGN="$AGENT_CWD/specs/042-todo-filter/design-a.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

assert file-present --exists "$DESIGN"
[ "$FAIL" = 1 ] && exit 1

# Design § over-200-lines is a Blocker (kata-review delta).
LINES=$(wc -l < "$DESIGN")
if [ "$LINES" -lt 200 ]; then
  echo "{\"test\":\"under-200-lines\",\"pass\":true}" >&"$RESULTS_FD"
else
  echo "{\"test\":\"under-200-lines\",\"pass\":false,\"message\":\"$LINES lines\"}" >&"$RESULTS_FD"
  FAIL=1
fi

assert has-decisions  --grep '^##+ .*Decision' "$DESIGN"
assert names-tradeoff --grep 'reject|alternative|instead of|trade.?off' "$DESIGN"

[ "$FAIL" = 0 ] && exit 0 || exit 1
