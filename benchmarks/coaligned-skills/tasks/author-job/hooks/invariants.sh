#!/bin/sh
set -u
JTBD="$AGENT_CWD/JTBD.md"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# The file must exist; the seed had no job, so every content check below only
# passes on what the agent added.
check jtbd-present --gate --exists "$JTBD"

# A job wrapped in a <job> tag carrying both self-describing attributes. Match
# the opening tag with a following attribute (case-insensitive, multiline), so a
# bare mention or a closing </job> does not satisfy it.
check has-job-tag  --grep '<job ' "$JTBD" \
  --message "no opening <job> tag"
check job-has-user --grep '<job[^>]*user=' "$JTBD" \
  --message "<job> tag missing user attribute"
check job-has-goal --grep '<job[^>]*goal=' "$JTBD" \
  --message "<job> tag missing goal attribute"

# The three body elements the entry structure requires.
check has-trigger     --grep 'Trigger' "$JTBD" \
  --message "no Trigger"
check has-big-hire    --grep 'Big Hire' "$JTBD" \
  --message "no Big Hire"
check has-little-hire --grep 'Little Hire' "$JTBD" \
  --message "no Little Hire"

exit 0
