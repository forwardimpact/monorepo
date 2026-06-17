# Plan — fit-trace stats result-event parity

Spec: [spec.md](./spec.md) · Design: [design-a.md](./design-a.md). Single
executable unit; steps are ordered by dependency.

## Approach

Add `messageId` to assistant turns and bump the document to `1.2.0` in the
collector, fix `modelUsage` to an additive merge in `handleResult`, then rework
`TraceQuery.stats()` to account per API message (field-wise max), surface
population labels, a divergence block, and a labeled no-result fallback —
reading the document `version` to gate pre-change documents. Build the six
fixtures, pin every spec success criterion, and correct guidance.

Libraries used: libeval (TraceCollector, TraceQuery), libutil (isoTimestamp);
testing via node:test as in the existing corpus.

## Step 1 — Collector: capture messageId and bump version

Intent: give the query layer a per-message key and a deterministic post-change marker.

Files: modify `libraries/libeval/src/trace-collector.js`.

- In `handleAssistant`, add `messageId: message.id ?? null` to the pushed
  assistant turn object (alongside `index`, `role`, `source`, `content`, `usage`).
- In `toJSON`, change `version: "1.1.0"` to `version: "1.2.0"`.

Verify: `bun test libraries/libeval/test/trace-collector-schema.test.js` after
Step 6 adds a `toJSON().version === "1.2.0"` assertion and a `messageId`
assertion on a collected assistant turn (the suite has no version assertion
today; Step 6 adds one and renames the `v1.1 schema expansion` describe block to
`v1.2`).

## Step 2 — Collector: additive modelUsage merge

Intent: stop `modelUsage` last-wins; sum the additive allow-set across result events.

Files: modify `libraries/libeval/src/trace-collector.js`.

- Replace `modelUsage: event.modelUsage ?? prev.modelUsage` in `handleResult`
  with `modelUsage: mergeModelUsage(prev.modelUsage, event.modelUsage)`.
- Add module-level `mergeModelUsage(prevMU, nextMU)`: returns the non-null side
  if either is null; otherwise, for the union of model keys, per model sum the
  allow-set fields, present on either side, defaulting absent to 0:

  ```js
  const ADDITIVE_MODEL_FIELDS = [
    "inputTokens", "outputTokens",
    "cacheReadInputTokens", "cacheCreationInputTokens",
    "costUSD", "webSearchRequests",
  ];
  ```

  Carry every other per-model field first-seen (prev wins), never summed.

Verify: the dedicated `mergeModelUsage` unit test in Step 6 (two result events,
one shared model) asserts additive fields sum and a non-additive field (e.g.
`contextWindow`) is carried, not summed.

## Step 3 — Query: per-message accounting, totals, divergence, fallback

Intent: land decisions 1–5 in `stats()` over the shipped baseline.

Files: modify `libraries/libeval/src/trace-query.js`.

- Replace `perTurnUsage` with `perMessageUsage(turns)`: group assistant turns
  with `usage` by `messageId` (a `null` id is its own singleton key). Per
  message, take the **field-wise max** of `inputTokens`, `outputTokens`,
  `cacheReadInputTokens`, `cacheCreationInputTokens` across its snapshots.
  Return `{ perMessage, totals }` where each `perMessage` row is
  `{ messageId, inputTokens, outputTokens, cacheReadInputTokens,
  cacheCreationInputTokens, outputIsStreamingSnapshot: true,
  population: "api-message" }` and `totals` is the field-wise sum of rows.
- Add a module-level `isPreChangeDoc(version)`: parse `version` into numeric
  `[major, minor, patch]` and return true when it is present and numerically
  `< [1, 2, 0]` (numeric compare, so `1.10.0` is correctly post-change). A trace
  with no `version` (NDJSON-collected by this build) is not pre-change.
- Rework `stats()`:
  - If `isPreChangeDoc(this.trace.version)`, return the carried-document shape:
    `totals` from `summary.tokenUsage`/`totalCostUsd`/`durationMs` with
    `population: "carried-document-summary"`; `perTurn` = the existing
    per-stream-event snapshot rows (keyed by `index`, since old turns carry no
    `messageId`) each labeled `population: "carried-document-per-turn"`;
    `modelUsage: summary.modelUsage ?? null`; `divergence: null`. The corrected
    figures come from re-running the NDJSON source. (Decision: pre-change docs —
    report what the document carries, labeled, never fabricate parity.)
  - Otherwise compute `perMessageUsage`. Let `re = this.summary.tokenUsage`.
  - **Result events present** (`re` truthy): `totals` = `re` plus
    `totalCostUsd`, `durationMs`, `durationLabel: "cumulative invocation time"`,
    `resultEventTurns: summary.numTurns ?? 0`, `population: "result-event-sum"`,
    `resultEventsPresent: true`. Compute `divergence`: for each of
    `inputTokens`/`cacheReadInputTokens`/`cacheCreationInputTokens`, if the
    per-message sum ≠ `re` value, return the first differing
    `{ field, perMessageSum, resultEventSum }`; else `null`. (Output is never
    part of the divergence check.)
  - **No result events** (`re` falsy): `totals` = per-message token sums plus
    `outputIsStreamingSnapshot: true` (output is a lower bound),
    `totalCostUsd: null`, `durationMs: null`, `resultEventTurns: null`,
    `population: "per-message-fallback"`, `resultEventsPresent: false`;
    `divergence: null`. `stats()` returns normally (exit zero), never silent 0s.
  - `perTurn` = the per-message rows (key name kept for CLI stability — note its
    rows now key on `messageId`, not `index`); `modelUsage = summary.modelUsage
    ?? null`; include the `divergence` field.

Verify: `bun test libraries/libeval/test/trace-query-analysis.test.js` after the
assertions in Step 6 are updated for the per-message shape.

## Step 4 — Query: labeled overview turn populations

Intent: kill the 294-vs-41 confusion (decision 5).

Files: modify `libraries/libeval/src/trace-query.js` `overview()`.

- Add `resultEventTurns: this.summary.numTurns ?? null` and a `turnPopulations`
  label object `{ turnCount: "rendered-trace-turns", resultEventTurns:
  "result-event-turns" }` to the returned object; keep `turnCount` as-is.

Verify: overview output carries both counts each named.

## Step 5 — Build the six fixtures

Intent: pin the Problem-table figures and every delta criterion.

Files: create under `libraries/libeval/test/fixtures/trace-parity/`:
`single-result.ndjson`, `multi-result.ndjson`, `multi-lane.ndjson`,
`no-result-event.ndjson`, `divergence.ndjson`, `pre-change-structured.json`.

- Derive `single-result` and `multi-result` from the spec's run 27329648271 and
  27330905698 figures: preserve duplicate message-id sets (byte-identical usage
  snapshots) and **all** result events; redact non-usage content; scrub any
  sensitive strings. Their summed result events must reproduce the spec's exact
  Problem-table totals.
- `multi-lane`: one file interleaving ≥2 envelope `source` lanes, each with its
  own result events; total = sum across every lane.
- `no-result-event`: assistant turns with usage and zero `result` events.
- `divergence`: synthetic — a message whose per-message input/cacheRead/
  cacheCreation sum differs from the (hand-set) result-event sums.
- `pre-change-structured.json`: a structured document with `version: "1.1.0"`,
  last-wins summary, turns without `messageId`.

Verify: each NDJSON fixture loads via `createTraceCollector` without throwing
and `pre-change-structured.json` loads via `createTraceQuery` (both exported);
each fixture's summed result events match the design's fixture table.

## Step 6 — Tests pinning every success criterion

Intent: assert the spec's success-criteria table.

Files: modify `libraries/libeval/test/trace-query-helpers.js`,
`libraries/libeval/test/trace-query-analysis.test.js`,
`libraries/libeval/test/trace-collector-schema.test.js`; add
`libraries/libeval/test/trace-parity.test.js`.

- In `trace-query-helpers.js`, bump `buildTrace`'s default `version` to
  `"1.2.0"` (it exercises post-change behavior); give each default assistant
  turn a **distinct** `messageId` (so the per-message assertions test identity,
  not the null-singleton accident); and set the default `summary.tokenUsage` to
  the field-wise sum of the default per-turn snapshots so the trace routes to
  the result-event-present branch and the existing `totalCostUsd: 0.0523`
  assertion stays valid. This is the fix for the version-gating regression:
  without it, every existing `stats` test routes to the carried-document branch
  (and a null-`tokenUsage` default would route to the fallback, nulling cost).
- In `trace-collector-schema.test.js`, rename the `v1.1 schema expansion`
  describe to `v1.2`, assert `collector.toJSON().version === "1.2.0"`, and
  assert a collected assistant turn carries `messageId`.
- In `trace-query-analysis.test.js`, update the existing `stats` tests to the
  post-change shape: "aggregates token totals" keeps `totalCostUsd === 0.0523`
  (now from the result-event branch) and asserts `population:
  "result-event-sum"`; "totals prefer result-event usage" keeps its totals
  assertions; "includes per-turn breakdown" **replaces** the `perTurn[0].index
  === 0` assertion with `perTurn[0].messageId` (the distinct id set on the
  helper) and `perTurn[0].population === "api-message"`, and asserts
  `perTurn.length` equals the helper's **unique-messageId** count. Add one
  explicit pre-change-document test (a `version: "1.1.0"` trace) asserting
  `population: "carried-document-summary"` and per-turn rows labeled
  `carried-document-per-turn`.
- New `trace-parity.test.js`, loading NDJSON fixtures via `createTraceCollector`
  + `createTraceQuery` and the structured fixture via `createTraceQuery` (the
  same exported path `loadTrace` uses), asserts per spec success criteria:
  single-result parity; multi-result parity (incl. `resultEventTurns: 19`);
  multi-lane totals; **`durationMs` equals the sum of the result events'
  durations** with `durationLabel`, plus merged `modelUsage` field-wise sums;
  `perTurn` length = 14 (not 34) with no byte-identical duplicate message rows;
  population labels on totals/perTurn/overview; fallback (`null`
  cost/duration/turns, `outputIsStreamingSnapshot` lower-bound label,
  `resultEventsPresent:false`, no throw); divergence surfaced with result-event
  totals intact; pre-change doc labeled `carried-document-summary`; rendering
  (`timeline`/`turn`/`head`/`tail`) identical on the repro fixtures.
- **Pin direction (criterion "fixtures pin the defect family").** Add an
  assertion that the naive pre-#1703 arithmetic differs from the pinned figures:
  for each repro fixture compute the per-stream-event sum (the old multiply-count
  path) and the last-result-event-only cost (the old last-wins path) inline and
  assert each ≠ the pinned result-event totals — demonstrating the pin's failure
  direction without checking out `dd62ecc8`.

Verify: `bun test libraries/libeval/` is green.

## Step 7 — Correct guidance and stage release notes

Intent: documented semantics match the corrected behavior (decisions; "sum all
result events").

Files: modify `.claude/skills/fit-trace/SKILL.md`,
`websites/fit/docs/libraries/prove-changes/trace-analysis/index.md`; create
`specs/1820-fit-trace-stats-result-event-parity/release-notes.md`.

- In both docs: describe result-event-sum totals, per-API-message `perTurn`,
  the population labels, and the no-result fallback; any interim workaround
  reads "sum **all** result events". Update the guide's `stats` example JSON to
  the new shape (`perTurn` rows keyed by `messageId`, `population`,
  `durationLabel`, `resultEventTurns`). Ensure no published guidance reads "the
  result event" singular for multi-result traces.
- `release-notes.md`: a libeval entry naming the changed `stats`/`perTurn`/
  turn-count semantics and what each figure now measures, for the release
  engineer to fold into the cut (`kata-release-cut`). Writing the docs is best
  handed to `technical-writer`.

Verify: `rg "the result event" .claude/skills/fit-trace websites/fit/docs/libraries/prove-changes`
finds no singular-for-multi-result usage; `bunx fit-doc build` (or the repo's
docs check) passes.

## Risks

- **Fixture figures must reconcile to the spec's exact integers.** Build the
  NDJSON from the real per-message usage snapshots; a hand-rounded fixture
  silently passes a weaker assertion. Cross-check each fixture's summed result
  events against the Problem tables before writing the test.
- **`modelUsage` key names vary by SDK version.** The allow-set is fixed from
  the captured fixtures; if a fixture's per-model block uses a key outside the
  allow-set for a token/cost/counter field, extend the set rather than letting
  it fall to first-seen — verify against the actual fixture content.

## Execution

Single engineering agent, sequential. Steps 1–4 are code, 5–6 fixtures+tests,
7 docs (route the doc edits to `technical-writer`; the implementing agent stages
`release-notes.md`). No parallelism warranted.

— Staff Engineer 🛠️
