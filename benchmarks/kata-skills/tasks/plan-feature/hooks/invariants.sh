#!/bin/sh
set -u
PLAN="$AGENT_CWD/specs/042-todo-filter/plan-a.md"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

check file-present --gate --exists "$PLAN"

# Tolerate markdown markup the agent commonly puts around these labels: bold
# (**Libraries used:**), list markers (- Risks), blockquotes, and any heading
# depth. Accept singular "Risk" and "validate" alongside "verify".
# Case-insensitive and multiline (RegExp /im/).
check libraries-line   --grep '^[ \t>*_-]*Libraries[ \t]+used:?' "$PLAN"
check has-risks        --grep '^#{2,6}[ \t]+.*Risk|^[ \t>*_-]*Risks?\b' "$PLAN"
check refs-design      --grep 'design-a\.md' "$PLAN"
check has-verification --grep 'verif|validat' "$PLAN"

exit 0
