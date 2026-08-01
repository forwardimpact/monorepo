#!/bin/sh
# Confirm the scaffold before the agent starts. The fixture project is
# present, and apm install staged the jidoka-setup skill.
set -eu
test -f "$AGENT_CWD/README.md"
test -f "$AGENT_CWD/package.json"
test -d "$AGENT_CWD/.claude/skills/jidoka-setup"
