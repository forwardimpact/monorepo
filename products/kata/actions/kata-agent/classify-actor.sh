#!/usr/bin/env bash
# Classify the acting account of a GitHub event payload against the App slug
# the run's own token mint yielded. Prints two GITHUB_OUTPUT lines, or nothing
# when the payload names no issue and no pull request. Exits 2 when it cannot
# read the payload, when the payload names no sender, or when a non-User
# sender meets an empty slug. The rule has one home: this file. The task
# composer renders the class it is handed.
#
# Usage: classify-actor.sh <event-path> <app-slug>
set -euo pipefail
event="$1"
slug="$2"
# No artifact: a manual or bridge dispatch. The gate does not apply. jq exits
# 1 on a null result only. Any other failure is an unreadable payload, and
# doubt must not open the gate.
rc=0
jq -e '.issue // .pull_request' "$event" > /dev/null || rc=$?
case "$rc" in
  0) ;;
  1) exit 0 ;;
  *) echo "::error::cannot read the event payload (jq exit ${rc})" >&2; exit 2 ;;
esac
login=$(jq -r '.sender.login // ""' "$event")
type=$(jq -r '.sender.type // ""' "$event")
[ -n "$login" ] || { echo "::error::payload carries no sender.login" >&2; exit 2; }
# A User sender is human whatever the slug, so a bad mint stops only the line
# that could be self.
if [ "$type" != "User" ] && [ -z "$slug" ]; then
  echo "::error::the token mint yielded no app-slug" >&2
  exit 2
fi
# GitHub spells one App three ways: slug[bot], slug, app/slug. A User
# account is never self, so a human whose login equals the slug stays human.
normalized="${login%\[bot\]}"
normalized="${normalized#app/}"
if [ "$type" != "User" ] && [ "$normalized" = "$slug" ]; then
  class=self
elif [ "$type" = "User" ]; then
  class=human
else
  class=bot
fi
printf 'actor-class=%s\nactor-login=%s\n' "$class" "$login"
