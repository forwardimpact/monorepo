#!/bin/sh
# Smoke-check the coordination workdir is sane and the tracker store is clean
# before the agent starts: the finding is present and no .tracker/ exists yet
# (the agent creates it).
set -eu
test -f "$AGENT_CWD/finding.md"
test ! -e "$AGENT_CWD/.tracker"
