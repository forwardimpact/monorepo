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

# 2. Problem first: first level-2 heading is "Problem" (case-insensitive)
first_h2="$(awk '/^## / { sub(/^## /,""); sub(/[[:space:]]*$/,""); print; exit }' "$SPEC")"
lc_first="$(printf '%s' "$first_h2" | tr '[:upper:]' '[:lower:]')"
case "$lc_first" in
  problem*) emit '{"test":"problem-first","pass":true}' ;;
  *) emit "{\"test\":\"problem-first\",\"pass\":false,\"message\":\"first level-2 heading is '$first_h2'\"}"
     FAIL=1 ;;
esac

# 3. Specific scope: has Scope section AND an exclusion heading
HAS_SCOPE=0; HAS_EXCL=0
grep -qiE '^## (In )?Scope( |$)' "$SPEC" && HAS_SCOPE=1
grep -qiE '^## Out of scope|^### Out of scope' "$SPEC" && HAS_EXCL=1
if [ "$HAS_SCOPE" = 1 ] && [ "$HAS_EXCL" = 1 ]; then
  emit '{"test":"specific-scope","pass":true}'
else
  emit "{\"test\":\"specific-scope\",\"pass\":false,\"message\":\"scope=$HAS_SCOPE exclusion=$HAS_EXCL\"}"
  FAIL=1
fi

# 4. Verifiable success: "## Success Criteria" (or "## Success") heading
if grep -qiE '^## Success' "$SPEC"; then
  emit '{"test":"verifiable-success","pass":true}'
else
  emit '{"test":"verifiable-success","pass":false,"message":"missing ## Success Criteria"}'
  FAIL=1
fi

# 5. No HOW leak: design § Grading rubric — absence of file:line or function-signature patterns
if grep -qE '[A-Za-z0-9_/.-]+\.(js|ts|sh|py|yml|yaml):[0-9]+|function +[A-Za-z_]+ *\(|async +function' "$SPEC"; then
  emit '{"test":"no-how-leak","pass":false,"message":"file:line or function signature detected"}'
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
