#!/bin/sh
set -u
JTBD="$AGENT_CWD/JTBD.md"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

# The file must exist; the seed had no job, so every content check below only
# passes on what the agent added.
assert jtbd-present --exists "$JTBD"
[ "$FAIL" = 1 ] && exit 1

# A job wrapped in a <job> tag carrying both self-describing attributes. Match
# the opening tag with a following attribute (case-insensitive, multiline), so a
# bare mention or a closing </job> does not satisfy it.
assert has-job-tag  --grep '<job ' "$JTBD" \
  --message "no opening <job> tag"
assert job-has-user --grep '<job[^>]*user=' "$JTBD" \
  --message "<job> tag missing user attribute"
assert job-has-goal --grep '<job[^>]*goal=' "$JTBD" \
  --message "<job> tag missing goal attribute"

# The three body elements the entry structure requires.
assert has-trigger     --grep 'Trigger' "$JTBD" \
  --message "no Trigger"
assert has-big-hire    --grep 'Big Hire' "$JTBD" \
  --message "no Big Hire"
assert has-little-hire --grep 'Little Hire' "$JTBD" \
  --message "no Little Hire"

[ "$FAIL" = 0 ] && exit 0 || exit 1
