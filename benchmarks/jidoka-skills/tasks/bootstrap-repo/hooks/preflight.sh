#!/bin/sh
# Confirm the scaffold before the agent starts: the fixture project is present
# and the jidoka-setup skill was staged by apm install.
set -eu
test -f "$AGENT_CWD/README.md"
test -f "$AGENT_CWD/package.json"
test -d "$AGENT_CWD/.claude/skills/jidoka-setup"
