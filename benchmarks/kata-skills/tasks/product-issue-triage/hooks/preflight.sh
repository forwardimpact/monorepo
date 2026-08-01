#!/bin/sh
# Smoke-check the triage scaffold. The product brief and the seeded open issue
# are present before the agent starts.
set -eu
test -f "$AGENT_CWD/product-brief.md"
test -f "$AGENT_CWD/.tracker/issues/req-emoji-social.md"
grep -q 'state: open' "$AGENT_CWD/.tracker/issues/req-emoji-social.md"
