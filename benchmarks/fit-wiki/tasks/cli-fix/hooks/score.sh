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

assert audit-passes   sh -c 'cd "$1" && npx fit-wiki audit --today 2026-05-24' _ "$WORKDIR"
assert summary-intact  test -f "$WORKDIR/wiki/staff-engineer.md"
assert memory-intact   test -f "$WORKDIR/wiki/MEMORY.md"

[ "$FAIL" = 0 ] && exit 0 || exit 1
