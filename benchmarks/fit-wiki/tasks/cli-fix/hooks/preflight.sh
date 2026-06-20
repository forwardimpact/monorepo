#!/bin/sh
# Verify the fixture: audit must FAIL on the seeded wiki.
cd "$AGENT_CWD" && npx fit-wiki audit --today 2026-05-24 >/dev/null 2>&1 && exit 1
exit 0
