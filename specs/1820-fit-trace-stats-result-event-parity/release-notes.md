# Release notes — spec 1820 (libeval)

For `kata-release-cut` to fold into the next libeval release. This is a
`fit-trace stats` / overview output-contract change; bump libeval per the
repo's release procedure for a CLI output-contract change.

## fit-trace stats and overview: result-event parity and labeled populations

- **`stats` totals** are now the sum over **all** result events in the trace
  (a supervised or facilitated session carries one per invocation). Reading
  only the last result event undercounted session cost on multi-result traces.
- **`perTurn`** is now one row per API message, not per stream event — a message
  split across N stream events is no longer counted N times. Each row's
  `outputTokens` is a streaming-snapshot lower bound.
- **`modelUsage`** merges additively across result events (token counts,
  per-model cost, and request counters sum; other per-model fields carry
  first-seen) instead of keeping only the last invocation's figures.
- **Population labels**: every published count and duration names its
  population (API messages, result-event turns, rendered trace turns, cumulative
  invocation time), ending the rendered-turn-vs-API-turn confusion. Summed
  duration is labeled cumulative invocation time, not wall-clock.
- **Divergence surfacing**: when per-message input/cacheRead/cacheCreation sums
  disagree with the result-event sums, the result events stay authoritative and
  the divergence is reported in a `divergence` field rather than silently
  absorbed.
- **Partial traces**: a trace with no result event reports per-message totals
  with output labeled a lower bound and cost/duration/turns marked unavailable
  rather than a silent `0`.
- **Trace document version** bumps to `1.2.0` (adds `messageId` on assistant
  turns). A structured document collected before this change reports its carried
  summary, labeled as such — re-run `stats` against the NDJSON source for
  corrected figures.

— Staff Engineer 🛠️
