import { readFileSync } from "node:fs";

/**
 * Scan an NDJSON trace and return the last orchestrator summary event, or
 * null if none is present. Skips malformed lines (a trace writer that
 * crashed mid-flush can leave a partial trailing record).
 *
 * @param {string} traceFile
 * @returns {{verdict: string, summary: string} | null}
 */
function findOrchestratorSummary(traceFile) {
  let result = null;
  for (const line of readFileSync(traceFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.source === "orchestrator" && record.event?.type === "summary") {
      result = {
        verdict: record.event.verdict ?? "failure",
        summary: record.event.summary ?? "",
      };
    }
  }
  return result;
}

/**
 * Callback command — read an NDJSON trace file, extract the orchestrator's
 * summary event, and POST it to a callback URL. Used by agent-react.yml to
 * deliver the facilitator's conclusion to an external caller (e.g. the
 * Microsoft Teams bridge) after the facilitate session completes.
 *
 * @param {object} values - Parsed option values from cli.parse()
 * @param {string[]} _args - Positional arguments
 */
export async function runCallbackCommand(values, _args) {
  const traceFile = values["trace-file"];
  const callbackUrl = values["callback-url"];
  const correlationId = values["correlation-id"];
  const runUrl = values["run-url"] ?? "";

  if (!traceFile) throw new Error("--trace-file is required");
  if (!callbackUrl) throw new Error("--callback-url is required");

  const found = findOrchestratorSummary(traceFile);
  if (found === null) {
    throw new Error("No orchestrator summary event found in trace");
  }

  const payload = {
    correlation_id: correlationId,
    verdict: found.verdict,
    summary: found.summary,
    run_url: runUrl,
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
