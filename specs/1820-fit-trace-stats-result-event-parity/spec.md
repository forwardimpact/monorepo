# Spec 1820 — fit-trace stats totals agree with the trace's own result events

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | `fit-trace stats` is the Study-phase token/cost instrument. Its totals were wrong in both directions at once — output undercounted ~52–75×, input/cache figures overcounted 2.2–3.9×, session cost undercounted 8× on facilitated traces. PR #1703 repaired the totals (see § Shipped baseline) but left them unpinned by fixtures, and the `perTurn` breakdown, per-model figures, partial-trace fallback, and population labels still mislead — efficiency analyses built on anything below the totals line still inherit false or unlabeled figures. |
| Platform Builders | [Evaluate and Improve Agents](../../JTBD.md#platform-builders-evaluate-and-improve-agents) | Proving an agent change improved outcomes requires trustworthy measurement. The trace collector and trace query engine in `libeval` are the shared trace instrument; every consumer that builds measurement on the structured trace document — not just the `fit-trace` CLI — inherits the remaining multiply-counted per-turn usage, last-wins `modelUsage`, and unlabeled populations. |

## Problem

`npx fit-trace stats` returned totals that contradict the authoritative
`result` events in the same trace file (issue
[#1624](https://github.com/forwardimpact/monorepo/issues/1624)). Two repro
files, both deterministic. The `stats` columns below are the behavior at
pre-#1703 main (reproducible from a worktree at `dd62ecc8`); PR
[#1703](https://github.com/forwardimpact/monorepo/pull/1703) has since
shipped part of this spec's contract — see § Shipped baseline.

Run 27329648271, agent lane, 1 result event:

| Figure | stats | result event | error |
|---|---|---|---|
| inputTokens | 24,749 | 6,301 | 3.9× over |
| outputTokens | 536 | 28,095 | ~52× under |
| cacheReadInputTokens | 6,892,708 | 2,524,055 | 2.7× over |
| cacheCreationInputTokens | 520,378 | 160,162 | 3.2× over |
| totalCostUsd | 5.99384 | 5.99384 | agrees (single result event) |

Run 27330905698, facilitator lane, 6 result events:

| Figure | stats | Σ result events | error |
|---|---|---|---|
| inputTokens | 29,924 | 8,166 | 3.7× over |
| outputTokens | 102 | 7,654 | ~75× under |
| cacheReadInputTokens | 1,610,102 | 742,072 | 2.2× over |
| cacheCreationInputTokens | 361,090 | 110,587 | 3.3× over |
| totalCostUsd | 0.32071 | 2.58877 | **8.07× under** |

Three mechanisms, each confirmed first-hand (staff-engineer verification,
[#1624 issuecomment-4686600406](https://github.com/forwardimpact/monorepo/issues/1624#issuecomment-4686600406)):

1. **Usage events are multiply-counted.** The collector records one
   assistant turn per *stream event*, each carrying that API message's
   usage snapshot; the stats query then sums usage once per turn. A
   message split across N stream events is counted N times. Evidence is
   exact, not ratio-shaped: counting usage **once per API message**
   reproduces the summed result events **exactly — zero residual — for
   input, cacheRead, and cacheCreation on three independent traces**
   (the two repro files above plus the same run's agent lane). On the
   facilitator file, 34 assistant stream events span 14 unique message
   ids; usage is byte-identical across every duplicate set.
2. **Output truth lives only in result events.** Assistant stream events
   carry message-start usage snapshots and never the final output count;
   even after perfect per-message dedup, summed per-message output is 42
   vs the true 7,654 on the facilitator file (351 vs 28,095 on the
   original repro). Per-file output totals are recoverable only from the
   trace's `result` events.
3. **Result-event aggregation is last-wins.** The collector's result
   handling overwrites the summary on every `result` event, so a
   multi-invocation trace (one result event per SDK invocation — the
   general case for facilitated and supervised sessions) reports only the
   final invocation: totalCostUsd 0.32071 vs the true session cost
   2.58877 (8.07× under), numTurns 2 vs 19. Single-invocation agent
   traces, where stats cost "agrees", are the special case.

The same population confusion shows in `turnCount`: the overview reports
294 (rendered trace turns, one per collected trace event of any type)
against the
result event's `num_turns: 41` (API turns), with nothing labeling which
population either number measures.

### Shipped baseline (PR #1703)

PR [#1703](https://github.com/forwardimpact/monorepo/pull/1703) (fixes
[#1696](https://github.com/forwardimpact/monorepo/issues/1696), merged
2026-06-12 at `1a98306d`, released as libeval 0.1.61) landed after this
spec was authored and ships part of the target condition. At current main:

- `TraceCollector.handleResult` accumulates `totalCostUsd`, `durationMs`,
  `numTurns`, and `tokenUsage` across **all** result events; `isError`
  ORs; the text-replay result footer shows the aggregates. Mechanism 3 is
  fixed for those figures.
- `TraceQuery.stats()` totals prefer the accumulated result-event usage
  over per-turn stream snapshots, falling back to per-turn sums only when
  no result event exists. Mechanisms 1–2 no longer distort **totals** on
  traces carrying a result event — decision 1's parity (single-result,
  multi-result, and merged multi-lane) holds at HEAD.

The remaining delta — what this spec still buys, each verified against
`1a98306d` first-hand:

- **`modelUsage` is still last-wins** in `handleResult` — decision 3's
  additive-field merge is unshipped; multi-result traces report only the
  final invocation's per-model figures.
- **`perTurn` is still one row per assistant stream event** — decision 2's
  per-message population is unshipped; the 34-rows-for-14-messages
  inflation and byte-identical duplicate rows persist in the breakdown.
- **No population labeling** — decision 5 is unshipped: the overview's
  `turnCount` is the unlabeled rendered-trace-turn count, summed duration
  carries no cumulative-invocation-time label, and no published count
  names its population.
- **The no-result-event fallback violates decision 4** — cost and duration
  report as silent `0`, output carries no lower-bound label, absence of
  result events goes unstated, and the fallback population is
  per-stream-event, not per-message.
- **Divergence surfacing (decision 1) does not exist** — there is no
  per-message accounting to check against the result-event sums.
- **None of this spec's six fixtures exist** — #1703's regression coverage
  is synthetic unit tests; the repro-derived fixtures pinning the Problem
  tables' exact figures are unbuilt, so the shipped parity has no
  fixture-level regression pin.
- **Guidance and release-notes criteria are untouched.**

Decisions 1–5 below are unchanged — they remain the contract. The
implementation shape is now *remaining delta plus regression pins for the
shipped baseline*, not a greenfield fix.

## Decisions

The repair arithmetic is pinned by the verification evidence; this spec
commits to it as the contract:

1. **Result events are authoritative for totals.** When a trace contains
   at least one `result` event, `stats` totals for inputTokens,
   outputTokens, cacheReadInputTokens, cacheCreationInputTokens, and
   totalCostUsd equal the sum over **all** result events in the file.
   This holds for merged multi-lane traces too (one file carrying several
   sources' events): the totals are the file's total spend across every
   lane and invocation. If per-message accounting (decision 2) ever
   diverges from the result-event sums for input, cacheRead, or
   cacheCreation on some future trace, the result events win — the
   divergence is surfaced in the output, never silently absorbed in
   either direction. (Per-message *output* always diverges, by mechanism
   2; it is not part of this divergence check.)
2. **Per-message counting.** Input, cacheRead, and cacheCreation are
   accounted **once per API message** — the population validated to
   reproduce result-event sums with zero residual on three traces. A
   message's per-message figure is derived from its observed usage
   snapshots by a deterministic, order-insensitive rule fixed in the
   design; the rule reproduces the result-event sums with zero residual
   on the evidence traces (where a message's duplicate snapshots are
   byte-identical), and its per-message output figure is a floor — it
   never overstates. This population defines the `perTurn` breakdown
   and the no-result-event fallback (decision 4). How message identity
   is tracked, and whether the accounting lives in the collector or the
   query layer, are design decisions, with one constraint:
   stream-rendering commands (timeline, turn-by-index, head/tail) keep
   working — this spec changes measurement populations, not the ability
   to inspect the stream.
3. **Multi-result aggregation sums across all result events.** Per-file
   outputTokens, totalCostUsd, numTurns, and durationMs are sums across
   all result events. Summed durationMs is **cumulative invocation
   time**, not wall-clock session time (invocations in merged multi-lane
   traces can overlap), and is labeled as such. Per-model usage
   (`modelUsage`), which suffers the same last-wins overwrite, merges
   across result events by summing each model's **additive** fields —
   token counts, per-model cost, and request counters; non-additive
   per-model fields (e.g. a context-window size) are never summed.
4. **No-result-event fallback.** A trace with zero result events
   (crashed or partial run) still produces totals: the per-message
   figures, with output explicitly labeled as a streaming-snapshot
   **lower bound** and the output stating that no result event was
   present. totalCostUsd, durationMs, and the result-event turn total
   are reported as explicitly unavailable on such a trace — never a
   silent 0. `stats` never crashes or returns silence on a partial
   trace.
5. **Population labeling.** Every published count and duration names its
   population. `stats` reports result-event totals and the per-message
   breakdown (decisions 1–3); `perTurn` becomes one entry per API
   message, labeled as such — its per-message output figure labeled as a
   streaming snapshot — and the overview's `turnCount` (rendered trace
   turns) is labeled as such alongside the result-event turn total, so
   the 294-vs-41 confusion cannot recur.

## Scope

### In scope

| Component | What changes |
|---|---|
| Token totals in the stats query. | Decisions 1–4: parity with summed result events when present (**shipped by #1703**; regression-pinned by the fixtures below); per-message accounting, divergence surfacing, and labeled fallback (**remaining**). |
| Summary/result aggregation in the trace document. | Decision 3: multi-result traces aggregate across all result events instead of keeping only the last — cost, turns, duration, token usage, and the result footer **shipped by #1703**; per-model usage (`modelUsage`) additive merge **remaining**; where it lives is a design decision. Consumers of the document summary inherit the aggregated figures. |
| `perTurn` and turn-count reporting. | Decision 5: per-API-message rows; populations labeled in `stats` and overview output. This is a published-CLI output-contract change. |
| Previously collected structured documents. | `stats` accepts pre-collected structured JSON as well as raw NDJSON. A structured document produced **before** this change preserves only the last-wins summary and turn rows without message identity — neither a per-result-event record nor a per-message population — so result-event parity and per-message reporting are both unsatisfiable on that input: `stats` reports what the document carries, labeled as such, and the corrected figures come from re-running against the NDJSON source. Structured documents produced **after** this change carry whatever the design needs for `stats` on them to meet decisions 1–5. |
| Fixture tests. | Both repro files become fixtures with tests pinning the exact figures in the Problem tables (single-result and multi-result cases) — for the parity figures #1703 already delivers, these are the regression pins the shipped baseline currently lacks. Fixtures must preserve the event/usage structure that produces those figures — duplicate message-id sets and all result events intact; non-usage content may be redacted for size and must be scrubbed of sensitive content before landing in the repository. Four further fixtures cover the no-result-event fallback, the divergence-surfacing clause (a synthetic trace whose per-message sums differ from its result-event sums), a pre-change structured document, and a merged multi-lane trace (several sources' events in one file). |
| Published guidance on token measurement from traces. | The `fit-trace` skill and the trace-analysis guide describe the corrected semantics. Any documented interim workaround reads "sum **all** result events" — reading *the* result event on a multi-result trace reproduces the 8× cost distortion. |
| Release posture. | Changed `stats`/overview output shape and semantics ship with a release-notes entry stating what each figure now measures; version bump per the repo's release procedure for a CLI output-contract change. |

### Out of scope

- **Where per-message accounting lives** (collector vs query) and any
  internal trace-schema versioning — design decisions, constrained only
  by decision 2's rendering guarantee.
- **Per-line token snippets in rendering commands** (e.g. the timeline's
  per-turn `in:`/`out:` figures) — stream-level detail by design and
  unchanged by this spec. The text-replay result *footer* is not in
  this exclusion: it is a summary surface and inherits decision 3's
  aggregated figures (see In scope).
- **The remaining fit-trace QoL backlog** (#996) — unrelated CLI
  improvements.
- **Per-invocation breakdown of multi-result traces** (cost/turns per SDK
  invocation as a new output section) — a possible follow-up; this spec
  fixes the file-level totals only.
- **Trace download/collection mechanics** — the defect is in
  measurement, not capture.

## Success Criteria

Token figures compare as exact integers; cost figures compare at the
5-decimal precision shown (summation-order-insensitive). The status
column reconciles each criterion against the #1703 baseline
(`1a98306d`): **pin** = behavior already shipped, criterion is satisfied
by adding the fixture-level regression pin; **delta** = behavior not yet
shipped, criterion fails at baseline and passes post-fix.

| Claim | Verification | At #1703 baseline |
|---|---|---|
| Single-result parity. | `npx fit-trace stats` on the fixture derived from run 27329648271 reports totals input 6,301 · output 28,095 · cacheRead 2,524,055 · cacheCreation 160,162 · cost 5.99384 — equal to the file's single result event. | pin |
| Multi-result parity. | `npx fit-trace stats` on the fixture derived from run 27330905698 (six result events) reports totals input 8,166 · output 7,654 · cacheRead 742,072 · cacheCreation 110,587 · cost 2.58877 · result-event turns 19 — equal to the sum over all six result events, not the last one. | pin |
| Multi-lane totals. | `npx fit-trace stats` on the merged multi-lane fixture reports totals equal to the sum over all result events across every lane in the file — the file's total spend, per decision 1. | pin |
| Duration and per-model aggregation. | On the multi-result fixture, the reported duration equals the sum of the six result events' durations, labeled cumulative invocation time; each model's merged `modelUsage` figures (tokens, cost, request counters) equal the field-wise sums across the six result events. | duration sum: pin · label + `modelUsage` merge: delta |
| Per-message perTurn. | On the multi-result fixture, `perTurn` contains one entry per unique assistant message id (14, not 34); no byte-identical rows repeated from one API message remain. | delta |
| Populations labeled. | Fixture tests assert that `stats` and overview output carry an explicit population label on each count and duration — distinguishing at minimum API messages, result-event turns, rendered trace turns, and cumulative invocation time — on both repro fixtures. | delta |
| Fallback on partial traces. | `stats` on the no-result-event fixture exits zero, reports the per-message totals precomputed from the fixture's message population, labels output as a streaming-snapshot lower bound with the absence of result events stated, and reports cost, duration, and result-event turns as unavailable rather than 0. | delta (baseline reports silent 0s and unlabeled per-stream-event sums) |
| Divergence is surfaced. | `stats` on the synthetic divergence fixture (per-message input/cacheRead/cacheCreation sums differing from the result-event sums) reports the result-event totals and surfaces the divergence in its output; the fixture test asserts both. | delta |
| Pre-existing structured documents stay readable. | `stats` on a structured document collected before this change exits zero and labels its figures as carried-over document summary, not result-event parity. | delta (reads fine, carries no label) |
| Rendering output unaffected. | Timeline, turn-by-index, and head/tail commands on both repro fixtures render the stream identically before and after the change, except the text-replay result footer, which shows the aggregated document summary per decision 3 (footer aggregation shipped in #1703); only measurement assertions (totals, populations) change in the existing test corpus. | invariant |
| Fixtures pin the defect family. | The new fixture tests' parity assertions fail against pre-#1703 main (`dd62ecc8` — multiply-counted totals, last-wins cost) and pass at the #1703 baseline; the delta assertions (per-message rows, labels, `modelUsage` merge, fallback, divergence) fail at the baseline and pass post-fix. | partial (see row) |
| Guidance is corrected. | The `fit-trace` skill and trace-analysis guide describe result-event-sum semantics; a search of the published skills and docs trees finds no guidance reading "the result event" in the singular for multi-result traces. | delta |
| Contract change is announced. | The shipping release's notes name the changed `stats`/`perTurn`/turn-count semantics and what each figure now measures. | delta |

— Product Manager 🌱
