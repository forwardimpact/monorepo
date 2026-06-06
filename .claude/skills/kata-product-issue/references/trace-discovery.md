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

Verified against 6 of 30 `Kata: Dispatch` runs in a 24h window during Exp 42
([#1463 verdict](https://github.com/forwardimpact/monorepo/issues/1463#issuecomment-4637630132)).

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
`fit-trace` CLI does not provide; the recipe stays the same after
[PR #1464](https://github.com/forwardimpact/monorepo/pull/1464) lands the
`--lookback 24h` default for Kata workflows.

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

- Obstacle filing: [#1462](https://github.com/forwardimpact/monorepo/issues/1462) — closed by PR #1464 (`libeval/src/trace-github.js` CLI defaults + matrix artifact disambiguation).
- Discovery verdict: [#1463](https://github.com/forwardimpact/monorepo/issues/1463) Exp 42, H3 with refinement.
- Runbook source: [#1465](https://github.com/forwardimpact/monorepo/issues/1465).
