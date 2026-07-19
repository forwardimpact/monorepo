#!/bin/sh
set -u
DESIGN="$AGENT_CWD/specs/042-todo-filter/design-a.md"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# The line count below reads the file, so the presence gate is a dependency:
# early exit after a failing gate — the gate row already carries the failure.
fit-trace assert file-present --gate --exists "$DESIGN" >&"$RESULTS_FD" || exit 0

# Design § over-200-lines is a Blocker (kata-review delta) — a gate.
LINES=$(wc -l < "$DESIGN")
if [ "$LINES" -lt 200 ]; then
  printf '%s\n' '{"test":"under-200-lines","pass":true,"gate":true}' >&"$RESULTS_FD"
else
  printf '%s\n' "{\"test\":\"under-200-lines\",\"pass\":false,\"gate\":true,\"message\":\"$LINES lines\"}" >&"$RESULTS_FD"
fi

# A decisions heading at any depth ("## Decisions", "### Key Decision"), and any
# of the common ways a rejected option gets named. Case-insensitive (RegExp /im/).
check has-decisions  --grep '^#{2,6}[ \t]+.*Decision' "$DESIGN"
check names-tradeoff --grep 'reject|alternative|instead of|rather than|trade.?off' "$DESIGN"

exit 0
