#!/usr/bin/env bash
# Structured trace extraction helpers for grounded theory analysis.
# Usage: trace-queries.sh <structured.json> <command>
#
# Commands:
#   overview    — metadata and summary
#   count       — number of turns
#   batch N M   — turns N through M (zero-indexed)
#   tail N      — last N turns
#   errors      — tool results with isError=true
#   tools       — tool usage frequency (descending)

set -euo pipefail

FILE="${1:?Usage: trace-queries.sh <structured.json> <command>}"
CMD="${2:?Commands: overview | count | batch N M | tail N | errors | tools}"

case "$CMD" in
  overview)
    jq '.metadata, .summary' "$FILE"
    ;;
  count)
    jq '.turns | length' "$FILE"
    ;;
  batch)
    FROM="${3:?batch requires start index}"
    TO="${4:?batch requires end index}"
    jq ".turns[$FROM:$TO]" "$FILE"
    ;;
  tail)
    N="${3:?tail requires count}"
    jq ".turns[-$N:]" "$FILE"
    ;;
  errors)
    # Stringify content first (it may be a string or an array of blocks),
    # then truncate to 200 characters for readability.
    jq '.turns[] | select(.role == "tool_result" and .isError == true) | {index, content: (.content | tostring | .[0:200])}' "$FILE"
    ;;
  tools)
    jq '[.turns[] | select(.role == "assistant") | .content[] | select(.type == "tool_use") | .name] | group_by(.) | map({tool: .[0], count: length}) | sort_by(-.count)' "$FILE"
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo "Commands: overview | count | batch N M | tail N | errors | tools" >&2
    exit 1
    ;;
esac
