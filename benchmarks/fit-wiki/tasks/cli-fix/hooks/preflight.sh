#!/bin/sh
# Verify the fixture: audit must FAIL on the seeded wiki.
cd "$WORKDIR" && npx fit-wiki audit --today 2026-05-24 >/dev/null 2>&1 && exit 1
exit 0
