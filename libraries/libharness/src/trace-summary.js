/**
 * Scan an NDJSON trace and return the last orchestrator summary event,
 * the first `meta` event's `discussion_id`, and any structured replies
 * the discusser collected. This function skips malformed lines.
 *
 * The runner is verdict-agnostic. It passes through whatever the trace
 * carries, verbatim: "success"/"failure" from supervise and facilitate,
 * "stand_down" from facilitate, and the canonical
 * "adjourned"/"recessed"/"failed"/"stand_down" from discuss. The bridge
 * layer maps to its channel semantics. The cost verb reads the verdict.
 *
 * @param {string} content - Raw NDJSON trace content.
 * @returns {{verdict: string, summary: string, replies: object[], trigger?: object, discussionId?: string} | null}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: NDJSON scan with malformed-line tolerance + meta/summary dual extraction
export function readTraceSummary(content) {
  let summary = null;
  let metaDiscussionId = null;
  for (const line of content.split("\n")) {
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
