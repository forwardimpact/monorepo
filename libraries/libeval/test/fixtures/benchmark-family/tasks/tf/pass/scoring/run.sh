#!/bin/sh
# Running-service probe: HTTP-GET / on $PORT, expect `{"ok":true}`.
RESP="$(curl -sf --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)"
SENTINEL="$WORKDIR/sentinel-pass-file"
# The sentinel file's name is part of the scoring-isolation property —
# its content should never appear in the agent trace because scoring/
# is never copied to the agent CWD.
if [ "$RESP" = '{"ok":true}' ]; then
  printf '%s\n' '{"test":"probe","pass":true}' >&"$RESULTS_FD"
  : > "$SENTINEL"
  exit 0
fi
printf '%s\n' '{"test":"probe","pass":false,"message":"bad response"}' >&"$RESULTS_FD"
exit 1
