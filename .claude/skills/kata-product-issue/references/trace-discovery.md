# PM-Trace Discovery

How to locate a PM activation's trace slice inside `Kata: Dispatch` artifacts
when grading PM-lane experiments against shape predicates (P1–P4 or successor
falsifiers).

## Why this runbook exists

`fit-trace runs <pattern>` filters on **workflow name**, not participant name.
PM activations run under workflow `Kata: Dispatch`, so
`fit-trace runs product-manager` returns `[]` correctly — there is no workflow
named `product-manager`. The PM trace slice is emitted as a per-participant
artifact inside the dispatch run's artifact set, under the canonical
`trace--<case>--product-manager.agent.ndjson` filename.

Verified across a 24h sample of `Kata: Dispatch` runs: every run that
dispatched a PM activation surfaced its slice under the
`--product-manager.` filename, and no other participant's artifact collided
with that substring — so the recipe below is robust to participant set
changes.

## Procedure

```sh
# 1. List candidate dispatch runs in the window.
gh run list --workflow "Kata: Dispatch" \
  --created "YYYY-MM-DD..YYYY-MM-DD" \
  --status completed \
  --json databaseId,createdAt,displayTitle

# 2. Download each candidate's artifacts.
fit-trace download <run-id> --dir /tmp/<run-id>

# 3. Filter for PM slices.
ls /tmp/<run-id>/ | grep -- '--product-manager.'

# 4. Grade against shape predicates from
#    trace--<case>--product-manager.agent.ndjson.
```

The `grep -- '--product-manager.'` step is participant filtering, which the
`fit-trace` CLI does not provide directly. Once `fit-trace` defaults the
lookback window to 24h for Kata workflows, step 1 can drop the explicit
`--created` flag, but the participant-filter step remains the same.

## Worked example

Dispatch run `27053803760` (2026-06-05 multi-agent rollup) contains a
356-line `trace--<case>--product-manager.agent.ndjson` slice — a usable
shape exemplar for grading parallelism and tool-call distribution.

```sh
gh run list --workflow "Kata: Dispatch" --created "2026-06-05..2026-06-06" \
  --status completed --json databaseId,createdAt,displayTitle
fit-trace download 27053803760 --dir /tmp/27053803760
ls /tmp/27053803760/ | grep -- '--product-manager.'
# trace--<case>--product-manager.agent.ndjson
# trace--<case>--product-manager.raw.ndjson
```

## Related

- Obstacle filing: [#1462](https://github.com/forwardimpact/monorepo/issues/1462) — `libeval/src/trace-github.js` CLI defaults + matrix artifact disambiguation.
- Discovery verdict: [#1463](https://github.com/forwardimpact/monorepo/issues/1463) — workflow-name filtering confirmed as the root reason `fit-trace runs product-manager` returns empty; per-participant artifact discovery is the documented escape hatch.
- Runbook source: [#1465](https://github.com/forwardimpact/monorepo/issues/1465).
