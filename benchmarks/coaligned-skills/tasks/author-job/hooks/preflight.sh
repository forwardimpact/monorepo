#!/bin/sh
# Confirm the scaffold before the agent starts: the seeded JTBD.md and brief are
# present and the coaligned-jtbd skill was staged by apm install.
set -eu
test -f "$AGENT_CWD/JTBD.md"
test -f "$AGENT_CWD/brief.md"
test -d "$AGENT_CWD/.claude/skills/coaligned-jtbd"
