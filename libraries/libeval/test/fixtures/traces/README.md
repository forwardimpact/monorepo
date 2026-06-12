# Trace fixtures — result-event parity

Real-trace fixtures for the `fit-trace` stats result-event-parity spec
(`specs/1820-fit-trace-stats-result-event-parity/`, PR #1649). Fixture-family
home for the spec's implementation; see the spec's Scope § Fixture tests for the
full set.

## run-481-divergence.scrubbed.ndjson

The first wild trace where per-message accounting cannot reach zero residual
against the result event — adopted as an implementation-time addition to the
spec's synthetic divergence fixture, per the dispositions on PR #1649 (PM
[comment 4689080319](https://github.com/forwardimpact/monorepo/pull/1649#issuecomment-4689080319),
security
[comment 4689097073](https://github.com/forwardimpact/monorepo/pull/1649#issuecomment-4689097073))
and issue [#1676](https://github.com/forwardimpact/monorepo/issues/1676).

- **Source**: workflow run 27401632821 (run-481), release-engineer agent lane,
  artifact `trace--default`, file
  `trace--default--release-engineer.agent.ndjson`. The artifact expires
  2026-09-10 under 90-day Actions retention, after which
  `npx fit-trace download 27401632821` stops working — **this committed file is
  the durable artifact**, pulled and scrubbed 2026-06-12.
- **Evidence datum**:
  [#1624 comment 4689060858](https://github.com/forwardimpact/monorepo/issues/1624#issuecomment-4689060858).

### Scrub applied (security conditions, comment 4689097073)

All message/tool content stripped to structure: assistant `thinking`/`text`
bodies and `tool_use` inputs emptied (block types and tool-use ids/names kept),
user `tool_result` contents and `tool_use_result` payloads emptied, system
free-text fields (`output`, `stdout`, `stderr`, `description`, `summary`,
`output_file`) emptied. Kept byte-exact: every message id, every usage block
(all duplicate snapshots), and the entire `result` event line. Event count (187)
and per-type counts are unchanged from the source.

### Pinned figures (verified post-scrub, 2026-06-12)

| Property                                   | Value                                          |
| ------------------------------------------ | ---------------------------------------------- |
| Unique assistant message ids               | 28 (71 assistant stream events)                |
| Duplicate usage snapshots per id           | byte-identical                                 |
| Per-message Σ input − result event         | **+2**                                         |
| Per-message Σ cacheRead − result event     | **+68,799**                                    |
| Per-message Σ cacheCreation − result event | **+693**                                       |
| Result events                              | 1 (`subtype: success`, byte-exact from source) |

A scrub or edit that perturbs any figure above has destroyed the fixture's job:
it exists to pin the divergence-surfacing clause (the spec's decision 1 — result
events win, divergence surfaced) on a real trace. Secret-scanned with gitleaks
8.24.3 (CI-pinned build) before landing; any future hit on this file is a scrub
failure, never an allowlist candidate.
