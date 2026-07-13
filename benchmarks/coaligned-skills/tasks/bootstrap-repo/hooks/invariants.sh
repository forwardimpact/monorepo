#!/bin/sh
set -u
CLAUDE="$AGENT_CWD/CLAUDE.md"
CONTRIBUTING="$AGENT_CWD/CONTRIBUTING.md"
JTBD="$AGENT_CWD/JTBD.md"
STARTER="$AGENT_CWD/.coaligned/invariants/no-conflict-markers.rules.mjs"
FAIL=0
assert() { fit-trace assert "$@" >&"$RESULTS_FD" || FAIL=1; }

# The three root files and the invariant directory must exist; without them
# nothing downstream can be asserted.
assert claude-present        --exists "$CLAUDE"
assert contributing-present  --exists "$CONTRIBUTING"
assert jtbd-present          --exists "$JTBD"
[ "$FAIL" = 1 ] && exit 1

# The L1 discovery property: the auto-loaded CLAUDE.md surfaces how BOTH jobs
# and checklists are found. Match the tag names the discovery conventions use
# (case-insensitive, multiline). Missing the checklist half is a real failure —
# it is exactly the property the Co-Aligned standard requires L1 to advertise.
assert claude-surfaces-jobs       --grep '<job' "$CLAUDE" \
  --message "CLAUDE.md does not surface job discovery"
assert claude-surfaces-read-do    --grep 'read_do_checklist' "$CLAUDE" \
  --message "CLAUDE.md does not surface entry-checklist discovery"
assert claude-surfaces-do-confirm --grep 'do_confirm_checklist' "$CLAUDE" \
  --message "CLAUDE.md does not surface exit-checklist discovery"

# JTBD.md carries at least one job wrapped in a <job> tag.
assert jtbd-has-job --grep '<job' "$JTBD" \
  --message "JTBD.md has no <job> entry"

# The invariant directory is seeded with the starter rule the skill ships.
assert starter-rule-present --exists "$STARTER" \
  --message "no-conflict-markers starter rule not installed"

# CONTRIBUTING.md points at the invariant tooling — the discovery contract for
# the layer coaligned-setup creates: where machine-checked rules live and the
# command that runs them.
assert contributing-surfaces-invariants \
  --grep 'coaligned invariants|\.coaligned/invariants' "$CONTRIBUTING" \
  --message "CONTRIBUTING.md does not point at the invariant tooling"

[ "$FAIL" = 0 ] && exit 0 || exit 1
