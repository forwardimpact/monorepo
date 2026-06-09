#!/bin/sh
# Smoke-check the shared app (materialized by the harness from the family-level
# workdir/) is sane before the agent starts.
set -eu
cd "$WORKDIR/app" && node --test >/dev/null 2>&1
