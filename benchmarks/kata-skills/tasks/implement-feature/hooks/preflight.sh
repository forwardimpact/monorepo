#!/bin/sh
# Smoke-check the shared app is sane before the agent starts. The harness
# materializes that app from the family-level workdir/.
set -eu
cd "$AGENT_CWD/app" && node --test >/dev/null 2>&1
