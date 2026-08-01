#!/bin/sh
set -u
CLAUDE="$AGENT_CWD/CLAUDE.md"
CONTRIBUTING="$AGENT_CWD/CONTRIBUTING.md"
JTBD="$AGENT_CWD/JTBD.md"
STARTER="$AGENT_CWD/.jidoka/invariants/no-conflict-markers.rules.mjs"
check() { fit-trace assert "$@" >&"$RESULTS_FD" || true; }

# The three root files must exist. Without them, nothing downstream passes.
check claude-present       --gate --exists "$CLAUDE"
check contributing-present --gate --exists "$CONTRIBUTING"
check jtbd-present         --gate --exists "$JTBD"

# The L1 discovery property. The auto-loaded CLAUDE.md surfaces how to find
# BOTH jobs and checklists. Match the tag names the discovery conventions use
# (case-insensitive, multiline). A missed checklist half is a real failure. It
# is exactly the property the Jidoka standard requires L1 to advertise.
check claude-surfaces-jobs       --grep '<job' "$CLAUDE" \
  --message "CLAUDE.md does not surface job discovery"
check claude-surfaces-read-do    --grep 'read_do_checklist' "$CLAUDE" \
  --message "CLAUDE.md does not surface entry-checklist discovery"
check claude-surfaces-do-confirm --grep 'do_confirm_checklist' "$CLAUDE" \
  --message "CLAUDE.md does not surface exit-checklist discovery"

# JTBD.md carries at least one job wrapped in a <job> tag.
check jtbd-has-job --grep '<job' "$JTBD" \
  --message "JTBD.md has no <job> entry"

# The invariant directory holds the starter rule the skill ships.
check starter-rule-present --exists "$STARTER" \
  --message "no-conflict-markers starter rule not installed"

# CONTRIBUTING.md points at the invariant tooling. That is the discovery
# contract for the layer jidoka-setup creates. It says where machine-checked
# rules live and which command runs them.
check contributing-surfaces-invariants \
  --grep 'jidoka invariants|\.jidoka/invariants' "$CONTRIBUTING" \
  --message "CONTRIBUTING.md does not point at the invariant tooling"

exit 0
