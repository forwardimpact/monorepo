/**
 * Shared envelope-writing helpers for benchmark runner tests.
 *
 * The `runAgent` seam contract is: run the session, stream `{source, seq,
 * event}` envelopes to `workdir.rawTracePath`, return `{agentError?}` — cost,
 * turns, and submission are derived from the raw file by the real
 * split/summary pipeline. These helpers build and write those envelope
 * fixtures so every hook-using test exercises that pipeline instead of
 * fabricating totals.
 *
 * Intentionally a regular module (not a `.test.js` file).
 */

/**
 * Build a standard cell's envelope fixture: an agent assistant message (the
 * submission), agent and supervisor result events carrying cost, and an
 * orchestrator summary event carrying turns.
 * @param {object} [opts]
 * @param {string} [opts.submission="done"] - Last agent assistant text.
 * @param {number} [opts.agentCost=0.02] - Agent result event cost (USD).
 * @param {number} [opts.supervisorCost=0.01] - Supervisor result event cost (USD).
 * @param {number} [opts.turns=3] - Orchestrator summary turn count.
 * @returns {object[]} Envelope objects, in stream order.
 */
export function cellEnvelopes({
  submission = "done",
  agentCost = 0.02,
  supervisorCost = 0.01,
  turns = 3,
} = {}) {
  return [
    {
      source: "agent",
      seq: 0,
      event: {
        type: "assistant",
        message: { content: [{ type: "text", text: submission }] },
      },
    },
    {
      source: "agent",
      seq: 1,
      event: { type: "result", total_cost_usd: agentCost },
    },
    {
      source: "supervisor",
      seq: 2,
      event: { type: "result", total_cost_usd: supervisorCost },
    },
    {
      source: "orchestrator",
      seq: 3,
      event: { type: "summary", turns },
    },
  ];
}

/**
 * Write envelopes to `workdir.rawTracePath` as NDJSON — the seam-contract
 * write every `runAgent` hook performs.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {import("../src/benchmark/workdir.js").Workdir} workdir
 * @param {object[]} [envelopes] - Defaults to `cellEnvelopes()`.
 * @returns {Promise<void>}
 */
export async function writeRawTrace(
  runtime,
  workdir,
  envelopes = cellEnvelopes(),
) {
  const lines = envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await runtime.fs.writeFile(workdir.rawTracePath, lines);
}
