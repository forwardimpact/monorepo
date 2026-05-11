#!/bin/sh
printf '%s\n' '{"test":"forced-fail","pass":false}' >&"$RESULTS_FD"
exit 1
