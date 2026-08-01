#!/bin/sh
# Confirm the scaffold before the agent starts. The seeded JTBD.md and brief
# are present, and apm install staged the jidoka-jtbd skill.
set -eu
test -f "$AGENT_CWD/JTBD.md"
test -f "$AGENT_CWD/brief.md"
test -d "$AGENT_CWD/.claude/skills/jidoka-jtbd"
