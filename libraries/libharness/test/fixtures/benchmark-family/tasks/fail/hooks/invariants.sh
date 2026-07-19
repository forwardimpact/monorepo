#!/bin/sh
printf '%s\n' '{"test":"forced-fail","pass":false,"gate":true}' >&"$RESULTS_FD"
exit 0
