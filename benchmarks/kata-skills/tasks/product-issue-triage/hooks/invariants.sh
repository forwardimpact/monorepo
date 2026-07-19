#!/bin/sh
set -u
ISSUE="$AGENT_CWD/.tracker/issues/req-emoji-social.md"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# The issue must still exist; the triage edits it in place.
check issue-present --gate --exists "$ISSUE"

# Triaged out of scope: closed, labelled wontfix, and carrying a rationale
# comment. Together these evidence the read -> comment -> label -> close loop
# the filesystem tracker realizes.
# Tolerate quoted front-matter values, the wont-fix / wont fix label spellings,
# any Comments heading depth, and a singular "Comment" heading. The Comments
# check still requires non-whitespace after the heading (a real rationale).
# Case-insensitive and multiline (RegExp /im/).
check issue-closed --grep 'state:\s*["'"'"']?closed' "$ISSUE" \
  --message "issue not closed"
check issue-wontfix --grep 'wont.?fix' "$ISSUE" \
  --message "no wontfix label applied"
check issue-commented --grep '#{1,6}\s*Comments?\s+\S' "$ISSUE" \
  --message "no rationale comment appended"

exit 0
