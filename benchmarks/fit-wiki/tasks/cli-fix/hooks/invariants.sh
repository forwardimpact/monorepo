#!/bin/sh
set -u
# Emit one check row per probe; the rows carry the verdict and the exit code
# stays script health only.
row() {
  name="$1"; extra="$2"; shift 2
  if "$@" >/dev/null 2>&1; then
    printf '{"test":"%s","pass":true%s}\n' "$name" "$extra" >&"$RESULTS_FD"
  else
    printf '{"test":"%s","pass":false%s}\n' "$name" "$extra" >&"$RESULTS_FD"
  fi
}

# The fix must resolve the audit findings AND leave the seeded content
# standing. `test -f` only proves the file still exists — a fix that guts
# the body (or truncates it to satisfy the audit markers) would still pass.
# The "intact" probes are anti-tamper gates so integrity failures can never
# be traded for partial credit; the audit outcome is the scored check.
row audit-passes '' \
  sh -c 'cd "$1" && npx fit-wiki audit --today 2026-05-24' _ "$AGENT_CWD"
row summary-intact ',"gate":true' \
  sh -c 'f="$1/wiki/staff-engineer.md"; grep -q "## Current Focus" "$f" && grep -q "## Open Blockers" "$f"' _ "$AGENT_CWD"
row memory-intact ',"gate":true' \
  grep -q "## Cross-Cutting Priorities" "$AGENT_CWD/wiki/MEMORY.md"

exit 0
