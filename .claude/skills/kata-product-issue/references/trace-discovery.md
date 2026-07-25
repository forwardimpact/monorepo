# PM-Trace Discovery

How to locate a PM activation's trace slice inside `Kata: Dispatch` artifacts
when studying product-manager behavior from dispatch runs.

## Why This Runbook Exists

`gemba-trace runs <pattern>` filters on **workflow name**, not participant name.
PM activations run under workflow `Kata: Dispatch`, so
`gemba-trace runs product-manager` returns `[]` correctly — there is no workflow
named `product-manager`. The PM trace slice is emitted as a per-participant
artifact inside the dispatch run's artifact set, under the canonical
`trace--<case>--product-manager.agent.ndjson` filename. No other
participant's artifact collides with that substring, so the recipe below is
robust to participant-set changes.

## Procedure

```sh
# 1. List candidate dispatch runs in the window.
gh run list --workflow "Kata: Dispatch" \
  --created "YYYY-MM-DD..YYYY-MM-DD" \
  --status completed \
  --json databaseId,createdAt,displayTitle

# 2. Download each candidate's artifacts.
gemba-trace download <run-id> --dir /tmp/<run-id>

# 3. Filter for PM slices.
ls /tmp/<run-id>/ | grep -- '--product-manager.'

# 4. Grade against shape predicates from
#    trace--<case>--product-manager.agent.ndjson.
```

Participant filtering is also available directly:
`gemba-trace find <run-id> product-manager` resolves the lane in one keyed
lookup, and errors listing the candidates when several members match (keep
the `grep` recipe for that multi-match case). Each download directory
contains both an `.agent.ndjson` slice (the participant's turn-level trace)
and a `.raw.ndjson` slice per participant.
