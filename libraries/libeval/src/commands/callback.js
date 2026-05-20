import { readFileSync } from "node:fs";

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

  const lines = readFileSync(traceFile, "utf8").split("\n");
  let verdict = null;
  let summary = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.source === "orchestrator" && record.event?.type === "summary") {
      verdict = record.event.verdict ?? "failure";
      summary = record.event.summary ?? "";
    }
  }

  if (verdict === null) {
    throw new Error("No orchestrator summary event found in trace");
  }

  const payload = {
    correlation_id: correlationId,
    verdict,
    summary,
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
