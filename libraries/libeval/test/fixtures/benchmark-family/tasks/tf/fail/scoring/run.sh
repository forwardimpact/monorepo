#!/usr/bin/env bash
printf '{"test":"always-fail","pass":false}\n' >&"$RESULTS_FD"
exit 1
