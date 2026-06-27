#!/bin/sh
set -u
TRACKER="$AGENT_CWD/.tracker"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

# Resolve the single issue and change the loop should have produced. The ids are
# caller-supplied slugs, so glob the tracker store rather than assume a name.
ISSUE=$(ls "$TRACKER"/issues/*.md 2>/dev/null | head -1)
CHANGE=$(ls "$TRACKER"/changes/*.md 2>/dev/null | head -1)

# An issue file must exist; without it nothing downstream can be asserted.
assert issue-present --exists "$ISSUE"
# A change file must exist before its envelope can be checked.
assert change-present --exists "$CHANGE"
[ "$FAIL" = 1 ] && exit 1

# The change links back to the issue (by its slug id, the filename stem).
ISSUE_ID=$(basename "$ISSUE" .md)
assert change-links-issue --grep "$ISSUE_ID" "$CHANGE" \
  --message "change does not link back to the issue"
# The change reached merged state. Tolerate quoted front-matter values
# (state: "merged"). Case-insensitive and multiline (RegExp /im/).
assert change-merged --grep 'state:\s*["'"'"']?merged' "$CHANGE" \
  --message "change is not state: merged"
# A trusted approval was recorded on the change (non-empty approval field).
assert change-approved --grep 'approval:\s*\S' "$CHANGE" \
  --message "no approval recorded on the change"

[ "$FAIL" = 0 ] && exit 0 || exit 1
