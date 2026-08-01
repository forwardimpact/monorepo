#!/bin/sh
set -u
TRACKER="$AGENT_CWD/.tracker"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# Resolve the single issue and change the loop must produce. The ids are
# caller-supplied slugs, so glob the tracker store rather than assume a name.
# Empty globs fall back to a never-present path so the gates still emit rows.
ISSUE=$(ls "$TRACKER"/issues/*.md 2>/dev/null | head -1)
CHANGE=$(ls "$TRACKER"/changes/*.md 2>/dev/null | head -1)
ISSUE="${ISSUE:-$TRACKER/issues/absent.md}"
CHANGE="${CHANGE:-$TRACKER/changes/absent.md}"

# An issue and a change must exist. The linkage checks read both. Exit early
# after a dependency gate fails. The gate row already carries the failure.
fit-trace assert issue-present --gate --exists "$ISSUE" >&"$RESULTS_FD" || exit 0
fit-trace assert change-present --gate --exists "$CHANGE" >&"$RESULTS_FD" || exit 0

# The change links back to the issue (by its slug id, the filename stem).
ISSUE_ID=$(basename "$ISSUE" .md)
check change-links-issue --grep "$ISSUE_ID" "$CHANGE" \
  --message "change does not link back to the issue"
# The change reached merged state. Tolerate quoted front-matter values
# (state: "merged"). Case-insensitive and multiline (RegExp /im/).
check change-merged --grep 'state:\s*["'"'"']?merged' "$CHANGE" \
  --message "change is not state: merged"
# The change records a trusted approval (non-empty approval field).
check change-approved --grep 'approval:\s*\S' "$CHANGE" \
  --message "no approval recorded on the change"

exit 0
