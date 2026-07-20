/**
 * Cost aggregation over Claude Code NDJSON traces — the single source of
 * truth for "how much did this run cost, across every participant?".
 *
 * The SDK reports the cumulative session cost on each `result` event as
 * `total_cost_usd`. Supervised, facilitated, and discuss sessions interleave
 * one runner's events with another's in a single combined trace, wrapping
 * each in a `{source, seq, event}` envelope; a plain `run` trace carries bare
 * events with no envelope. A judge runs as its own session in a separate
 * trace. In every case the rule is the same: sum the `total_cost_usd` of each
 * `result` event, and keep a per-source breakdown so callers can attribute
 * spend to the agent, supervisor, judge, or any named participant.
 *
 * This mirrors `TraceCollector.handleResult`, which accumulates the same
 * figure for its summary footer — kept as a standalone pure helper so the
 * benchmark runner, the callback command, and `gemba-trace cost` share one
 * implementation rather than each re-deriving it (and drifting).
 */

/** Bucket key for bare (un-enveloped) `run`-mode events: a lone agent session. */
export const UNSOURCED = "agent";

/**
 * Sum `total_cost_usd` across every `result` event in an NDJSON trace.
 *
 * @param {Iterable<string>} lines - NDJSON lines (e.g. `content.split("\n")`).
 *   Blank and malformed lines are skipped.
 * @returns {{totalCostUsd: number, bySource: Record<string, number>}}
 *   `totalCostUsd` is the sum across all participants; `bySource` maps each
 *   envelope `source` (or {@link UNSOURCED} for bare events) to its subtotal.
 */
export function sumTraceCost(lines) {
  let totalCostUsd = 0;
  /** @type {Record<string, number>} */
  const bySource = {};

  for (const line of lines) {
    const parsed = parseCostLine(line);
    if (!parsed) continue;
    const { source, cost } = parsed;
    totalCostUsd += cost;
    bySource[source] = (bySource[source] ?? 0) + cost;
  }

  return { totalCostUsd, bySource };
}

/**
 * Parse a single NDJSON line and return its `result`-event cost contribution,
 * or null when the line is blank, malformed, not a result event, or carries
 * no numeric `total_cost_usd`.
 *
 * @param {string} line
 * @returns {{source: string, cost: number} | null}
 */
function parseCostLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Unwrap the combined-trace envelope {source, seq, event}; bare events
  // (plain `run` traces) have a `type` and no `source`.
  let source = UNSOURCED;
  if (event.event && !event.type && typeof event.source === "string") {
    source = event.source;
    event = event.event;
  }

  if (event.type !== "result") return null;
  if (typeof event.total_cost_usd !== "number") return null;

  return { source, cost: event.total_cost_usd };
}
