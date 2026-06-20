#!/bin/sh
set -u
PLAN="$AGENT_CWD/specs/042-todo-filter/plan-a.md"
FAIL=0
assert() { bunx fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

assert file-present --exists "$PLAN"
[ "$FAIL" = 1 ] && exit 1

assert libraries-line   --grep '^Libraries used:' "$PLAN"
assert has-risks        --grep '^##+ .*Risks' "$PLAN"
assert refs-design      --grep 'design-a\.md' "$PLAN"
assert has-verification --grep 'verif' "$PLAN"

[ "$FAIL" = 0 ] && exit 0 || exit 1
