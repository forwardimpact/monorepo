#!/bin/sh
# Start the service in the background. teardown reaps it.
bun "$AGENT_CWD/app.js" >/dev/null 2>&1 &
# Wait until the service accepts connections. A fixed sleep races a slow start.
i=0
until curl -sf --max-time 1 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -ge 50 ] && exit 1
  sleep 0.1
done
exit 0
