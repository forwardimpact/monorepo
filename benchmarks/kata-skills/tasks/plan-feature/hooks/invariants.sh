#!/bin/sh
set -u
PLAN="$AGENT_CWD/specs/042-todo-filter/plan-a.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

assert file-present --exists "$PLAN"
[ "$FAIL" = 1 ] && exit 1

# Tolerate markdown markup the agent commonly puts around these labels: bold
# (**Libraries used:**), list markers (- Risks), blockquotes, and any heading
# depth. Accept singular "Risk" and "validate" alongside "verify".
# Case-insensitive and multiline (RegExp /im/).
assert libraries-line   --grep '^[ \t>*_-]*Libraries[ \t]+used:?' "$PLAN"
assert has-risks        --grep '^#{2,6}[ \t]+.*Risk|^[ \t>*_-]*Risks?\b' "$PLAN"
assert refs-design      --grep 'design-a\.md' "$PLAN"
assert has-verification --grep 'verif|validat' "$PLAN"

[ "$FAIL" = 0 ] && exit 0 || exit 1
