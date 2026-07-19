#!/bin/sh
set -u
SPEC="$AGENT_CWD/specs/042-todo-filter/spec.md"
JTBD="$AGENT_CWD/jtbd-excerpt.md"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

check file-present --gate --exists "$SPEC"

# Match the section at any heading depth, with any heading text that contains
# the keyword (e.g. "## Problem", "### Problem Statement", "## Out of Scope",
# "## Non-Goals", "## Success Criteria", "## Acceptance Criteria"). The grep
# runs case-insensitive and multiline (RegExp /im/).
check has-problem        --grep '^#{2,6}[ \t]+.*Problem' "$SPEC"
check has-scope          --grep '^#{2,6}[ \t]+.*(Scope|Non.?Goals)' "$SPEC"
check verifiable-success --grep '^#{2,6}[ \t]+.*(Success|Acceptance)' "$SPEC"
# A WHAT/WHY spec that pins file:line implementation detail leaks the HOW —
# a constraint on the artifact, so it gates rather than scores.
check no-how-leak --gate --not \
  --grep '[A-Za-z0-9_/.-]+\.(js|ts|sh|py|yml|yaml):[0-9]+' "$SPEC" \
  --message "file:line reference detected"
check cites-jtbd --cites-job "$JTBD" "$SPEC"

exit 0
