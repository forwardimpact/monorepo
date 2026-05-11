#!/usr/bin/env bash
if [ -f "$WORKDIR/answer.txt" ] && [ "$(cat "$WORKDIR/answer.txt")" = "42" ]; then
  printf '{"test":"repo-state","pass":true}\n' >&"$RESULTS_FD"
  exit 0
fi
printf '{"test":"repo-state","pass":false}\n' >&"$RESULTS_FD"
exit 1
