#!/bin/sh
set -u
SPEC="$WORKDIR/spec.md"
JTBD="$WORKDIR/specs/jtbd-excerpt.md"
FAIL=0

emit() { printf '%s\n' "$1" >&"$RESULTS_FD"; }

# 1. File present
if [ ! -f "$SPEC" ]; then
  emit '{"test":"file-present","pass":false,"message":"spec.md missing at WORKDIR/spec.md"}'
  exit 1
fi
emit '{"test":"file-present","pass":true}'

# 2. Has a Problem heading (any position)
if grep -qiE '^## Problem' "$SPEC"; then
  emit '{"test":"has-problem","pass":true}'
else
  emit '{"test":"has-problem","pass":false,"message":"missing ## Problem heading"}'
  FAIL=1
fi

# 3. Has a Scope heading (exclusions may be inline or a subheading)
if grep -qiE '^##+ (In )?Scope|^##+ Non.?Goals' "$SPEC"; then
  emit '{"test":"has-scope","pass":true}'
else
  emit '{"test":"has-scope","pass":false,"message":"missing scope or non-goals heading"}'
  FAIL=1
fi

# 4. Verifiable success: "## Success Criteria" (or "## Success") heading
if grep -qiE '^## Success' "$SPEC"; then
  emit '{"test":"verifiable-success","pass":true}'
else
  emit '{"test":"verifiable-success","pass":false,"message":"missing ## Success Criteria"}'
  FAIL=1
fi

# 5. No HOW leak: file:line references suggest implementation detail
if grep -qE '[A-Za-z0-9_/.-]+\.(js|ts|sh|py|yml|yaml):[0-9]+' "$SPEC"; then
  emit '{"test":"no-how-leak","pass":false,"message":"file:line reference detected"}'
  FAIL=1
else
  emit '{"test":"no-how-leak","pass":true}'
fi

# 6. Cites JTBD: spec contains the canonical "<persona>: <job>" string from the staged <job> tag.
# The string matches the h2 heading inside the excerpt (e.g. "## Platform Builders: Evaluate and Improve Agents")
# and is what the brief tells the agent to quote.
persona_job="$(awk '
  match($0, /<job user="[^"]*" goal="[^"]*">/) {
    s = substr($0, RSTART, RLENGTH)
    match(s, /user="[^"]*"/); u = substr(s, RSTART+6, RLENGTH-7)
    match(s, /goal="[^"]*"/); g = substr(s, RSTART+6, RLENGTH-7)
    print u": "g
    exit
  }' "$JTBD")"
if [ -n "$persona_job" ] && grep -qF "$persona_job" "$SPEC"; then
  emit '{"test":"cites-jtbd","pass":true}'
else
  emit "{\"test\":\"cites-jtbd\",\"pass\":false,\"message\":\"missing '$persona_job'\"}"
  FAIL=1
fi

[ "$FAIL" = 0 ] && exit 0 || exit 1
