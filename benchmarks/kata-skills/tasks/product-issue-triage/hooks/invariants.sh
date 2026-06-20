#!/bin/sh
set -u
ISSUE="$AGENT_CWD/.tracker/issues/req-emoji-social.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

# The issue must still exist; the triage edits it in place.
assert issue-present --exists "$ISSUE"
[ "$FAIL" = 1 ] && exit 1

# Triaged out of scope: closed, labelled wontfix, and carrying a rationale
# comment. Together these evidence the read -> comment -> label -> close loop
# the filesystem tracker realizes.
assert issue-closed --grep 'state:\s*closed' "$ISSUE" \
  --message "issue not closed"
assert issue-wontfix --grep 'wontfix' "$ISSUE" \
  --message "no wontfix label applied"
assert issue-commented --grep '##\s*Comments\s+\S' "$ISSUE" \
  --message "no rationale comment appended"

[ "$FAIL" = 0 ] && exit 0 || exit 1
