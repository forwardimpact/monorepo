import { sumTraceCost } from "../cost.js";
import { readTraceSummary } from "../trace-summary.js";

/** Terminal summary when the run wrote no trace the verb can read. */
const NO_TRACE_SUMMARY = "The run produced no trace file. See the run log.";

/** Terminal summary when a trace exists but carries no orchestrator summary. */
const NO_SUMMARY_TEXT = "The run ended and produced no summary.";

/**
 * Callback command — read an NDJSON trace and extract the terminal
 * orchestrator summary. POST a canonical callback body to the configured
 * URL.
 *
 * `--trace-file` is optional: an absent or empty path posts the same shape
 * with `verdict: failed`, so a run that produced no trace never strands its
 * caller.
 *
 * Wire shape (single shape across modes):
 *
 * ```
 * {
 *   correlation_id, kind, verdict, summary, run_url, cost_usd,
 *   replies: [], last_acted_seq, discussion_id?, trigger?
 * }
 * ```
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runCallbackCommand(ctx) {
  const values = ctx.options;
  const runtime = ctx.deps.runtime;
  const traceFile = values["trace-file"];
  const callbackUrl = values["callback-url"];
  const correlationId = values["correlation-id"];
  const runUrl = values["run-url"] ?? "";
  const discussionIdOverride = values["discussion-id"] ?? null;

  if (!callbackUrl)
    return { ok: false, code: 1, error: "--callback-url is required" };

  const content =
    traceFile && runtime.fsSync.existsSync(traceFile)
      ? runtime.fsSync.readFileSync(traceFile, "utf8")
      : null;
  const found =
    content === null
      ? { verdict: "failed", summary: NO_TRACE_SUMMARY, replies: [] }
      : (readTraceSummary(content) ?? {
          verdict: "failed",
          summary: NO_SUMMARY_TEXT,
          replies: [],
        });
  // Total spend across every participant in the trace. The bridge surfaces
  // it alongside the verdict, so a dispatched run reports what it cost.
  const { totalCostUsd } = sumTraceCost(
    content === null ? [] : content.split("\n"),
  );

  const discussionId = found.discussionId ?? discussionIdOverride ?? null;
  const payload = {
    correlation_id: correlationId,
    kind: "terminal",
    verdict: found.verdict,
    summary: found.summary,
    run_url: runUrl,
    cost_usd: totalCostUsd,
    replies: found.replies,
    last_acted_seq: found.lastActedSeq ?? -1,
    ...(discussionId && { discussion_id: discussionId }),
    ...(found.trigger && { trigger: found.trigger }),
  };
  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, code: 1, error: `Callback POST failed: ${res.status}` };
  }
  return { ok: true };
}
