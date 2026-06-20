#!/bin/sh
set -u
SPEC="$AGENT_CWD/specs/042-todo-filter/spec.md"
JTBD="$AGENT_CWD/jtbd-excerpt.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

assert file-present --exists "$SPEC"
[ "$FAIL" = 1 ] && exit 1

assert has-problem        --grep '^## Problem' "$SPEC"
assert has-scope          --grep '^##+ (In )?Scope|^##+ Non.?Goals' "$SPEC"
assert verifiable-success --grep '^## (Success|Acceptance Criteria)' "$SPEC"
assert no-how-leak        --not --grep '[A-Za-z0-9_/.-]+\.(js|ts|sh|py|yml|yaml):[0-9]+' "$SPEC" \
                          --message "file:line reference detected"
assert cites-jtbd --cites-job "$JTBD" "$SPEC"

[ "$FAIL" = 0 ] && exit 0 || exit 1
