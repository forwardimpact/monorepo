#!/usr/bin/env bash
# Classify the acting account of a GitHub event payload against the App slug
# the run's own token mint yielded. Prints two GITHUB_OUTPUT lines, or nothing
# when the payload names no issue and no pull request. The rule has one home:
# this file. The task composer renders the class it is handed.
#
# Usage: classify-actor.sh <event-path> <app-slug>
set -euo pipefail
event="$1"
slug="$2"
# No artifact: a manual or bridge dispatch. The gate does not apply.
if ! jq -e '.issue // .pull_request' "$event" > /dev/null; then
  exit 0
fi
login=$(jq -r '.sender.login // ""' "$event")
type=$(jq -r '.sender.type // ""' "$event")
[ -n "$login" ] || { echo "::error::payload carries no sender.login" >&2; exit 2; }
# GitHub spells one App three ways: slug[bot], slug, app/slug.
normalized="${login%\[bot\]}"
normalized="${normalized#app/}"
if [ -n "$slug" ] && [ "$normalized" = "$slug" ]; then
  class=self
elif [ "$type" = "User" ]; then
  class=human
else
  class=bot
fi
printf 'actor-class=%s\nactor-login=%s\n' "$class" "$login"
