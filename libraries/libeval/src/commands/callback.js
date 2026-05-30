import { readFileSync } from "node:fs";

/**
 * Scan an NDJSON trace and return the last orchestrator summary event,
 * the first `meta` event's `discussion_id`, and any structured replies
 * collected by the discusser. Skips malformed lines.
 *
 * The runner is verdict-agnostic — verbatim passthrough of whatever the
 * trace carries ("success"/"failure" from supervise/facilitate; canonical
 * "adjourned"/"recessed"/"failed" from discuss). The bridge layer maps to
 * its channel semantics.
 *
 * @param {string} traceFile
 * @returns {{verdict: string, summary: string, replies: object[], trigger?: object, discussionId?: string} | null}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: NDJSON scan with malformed-line tolerance + meta/summary dual extraction
function readTraceSummary(traceFile) {
  let summary = null;
  let metaDiscussionId = null;
  for (const line of readFileSync(traceFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.source !== "orchestrator") continue;
    if (record.event?.type === "meta" && !metaDiscussionId) {
      metaDiscussionId = record.event.discussion_id ?? null;
    }
    if (record.event?.type === "summary") {
      summary = {
        verdict: record.event.verdict ?? "failed",
        summary: record.event.summary ?? "",
        replies: Array.isArray(record.event.replies)
          ? record.event.replies
          : [],
        ...(record.event.trigger && { trigger: record.event.trigger }),
        ...(record.event.discussion_id && {
          discussionId: record.event.discussion_id,
        }),
        ...(typeof record.event.lastActedSeq === "number" && {
          lastActedSeq: record.event.lastActedSeq,
        }),
      };
    }
  }
  if (summary && !summary.discussionId && metaDiscussionId) {
    summary.discussionId = metaDiscussionId;
  }
  return summary;
}

/**
 * Callback command — read an NDJSON trace, extract the terminal
 * orchestrator summary, and POST a canonical callback body to the
 * configured URL. Used by `kata-dispatch.yml` to deliver the lead's
 * conclusion to the bridge that dispatched the run.
 *
 * Wire shape (single shape across modes):
 *
 * ```
 * {
 *   correlation_id, verdict, summary, run_url,
 *   discussion_id?, replies: [], trigger?
 * }
 * ```
 *
 * @param {object} values - Parsed option values from cli.parse()
 * @param {string[]} _args - Positional arguments
 */
export async function runCallbackCommand(values, _args) {
  const traceFile = values["trace-file"];
  const callbackUrl = values["callback-url"];
  const correlationId = values["correlation-id"];
  const runUrl = values["run-url"] ?? "";
  const discussionIdOverride = values["discussion-id"] ?? null;

  if (!traceFile) throw new Error("--trace-file is required");
  if (!callbackUrl) throw new Error("--callback-url is required");

  const found = readTraceSummary(traceFile) ?? {
    verdict: "failed",
    summary: "Run ended without producing a summary.",
    replies: [],
  };

  const discussionId = found.discussionId ?? discussionIdOverride ?? null;
  const payload = {
    correlation_id: correlationId,
    kind: "terminal",
    verdict: found.verdict,
    summary: found.summary,
    run_url: runUrl,
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
    throw new Error(`Callback POST failed: ${res.status}`);
  }
}
