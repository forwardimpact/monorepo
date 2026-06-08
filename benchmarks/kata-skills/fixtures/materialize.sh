#!/bin/sh
# Shared fixture materializer for the kata-skills benchmark family.
#
# Copies the single source-of-truth mock app and any named canonical artifacts
# from fixtures/ into a task's agent CWD. Called by each task's preflight.sh so
# the family maintains exactly one app and one artifact chain.
#
# Usage: materialize.sh <workdir> [artifact ...]
#   <workdir>    agent CWD ($WORKDIR) to populate
#   artifact     0+ of: brief.md jtbd-excerpt.md spec.md design-a.md plan-a.md
#
# brief.md / jtbd-excerpt.md land at the workdir root; spec/design/plan land in
# specs/042-todo-filter/ (the path the agent tasks and invariants expect).
set -eu

WORKDIR="$1"
shift

FIXTURES=$(CDPATH= cd "$(dirname "$0")" && pwd)
SPEC_DIR="$WORKDIR/specs/042-todo-filter"

# The mock app is materialized for every task.
mkdir -p "$WORKDIR"
cp -r "$FIXTURES/app" "$WORKDIR/app"

for artifact in "$@"; do
  case "$artifact" in
    brief.md | jtbd-excerpt.md)
      cp "$FIXTURES/$artifact" "$WORKDIR/$artifact"
      ;;
    spec.md | design-a.md | plan-a.md)
      mkdir -p "$SPEC_DIR"
      cp "$FIXTURES/specs/042-todo-filter/$artifact" "$SPEC_DIR/$artifact"
      ;;
    *)
      echo "materialize: unknown artifact '$artifact'" >&2
      exit 1
      ;;
  esac
done
