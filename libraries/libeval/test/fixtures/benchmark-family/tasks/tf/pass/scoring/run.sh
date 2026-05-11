#!/usr/bin/env bash
# sentinel file content visible only inside scoring/ — the agent must never see it
echo "test sentinel: HARNESS_SECRET_TOKEN_42"
if [ -f "$WORKDIR/passing.flag" ]; then
  printf '{"test":"sentinel","pass":true}\n' >&"$RESULTS_FD"
  exit 0
fi
printf '{"test":"sentinel","pass":false}\n' >&"$RESULTS_FD"
exit 1
