#!/bin/sh
# Start the service in the background. teardown reaps it.
bun "$AGENT_CWD/app.js" >/dev/null 2>&1 &
sleep 0.2
exit 0
