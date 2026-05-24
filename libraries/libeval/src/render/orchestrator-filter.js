/**
 * Orchestrator filter — predicate for the orchestrator lifecycle events that
 * should be suppressed from the human-readable log.
 *
 * NDJSON artifacts still carry every orchestrator event; this module only
 * controls what the live `textStream` and offline `toText()` show.
 */

const SUPPRESSED = new Set(["session_start", "agent_start", "summary", "meta"]);

/**
 * @param {{type?: string}|null|undefined} event
 * @returns {boolean} true when the event's type is one we hide from text output
 */
export function isSuppressedOrchestratorEvent(event) {
  return Boolean(
    event && typeof event === "object" && SUPPRESSED.has(event.type),
  );
}
