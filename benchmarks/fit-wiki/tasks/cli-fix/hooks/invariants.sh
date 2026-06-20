#!/bin/sh
set -u
FAIL=0
assert() {
  id="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "{\"id\":\"$id\",\"verdict\":\"pass\"}" >&"$RESULTS_FD"
  else
    echo "{\"id\":\"$id\",\"verdict\":\"fail\"}" >&"$RESULTS_FD"
    FAIL=1
  fi
}

# The fix must resolve the audit findings AND leave the seeded content
# standing. `test -f` only proves the file still exists — a fix that guts
# the body (or truncates it to satisfy the audit markers) would still pass.
# Assert the seeded sections survive so the "intact" invariants actually
# measure integrity instead of mere existence.
assert audit-passes   sh -c 'cd "$1" && npx fit-wiki audit --today 2026-05-24' _ "$AGENT_CWD"
assert summary-intact  sh -c 'f="$1/wiki/staff-engineer.md"; grep -q "## Current Focus" "$f" && grep -q "## Open Blockers" "$f"' _ "$AGENT_CWD"
assert memory-intact   grep -q "## Cross-Cutting Priorities" "$AGENT_CWD/wiki/MEMORY.md"

[ "$FAIL" = 0 ] && exit 0 || exit 1
