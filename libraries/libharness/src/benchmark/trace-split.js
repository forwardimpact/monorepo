/**
 * Split the combined supervisor trace for the benchmark runner. One pass
 * over the tagged NDJSON envelope stream separates agent events from
 * supervisor and orchestrator events. The same pass extracts the run summary.
 */

import { createInterface } from "node:readline";

/**
 * Split the combined supervisor trace into agent and supervisor files. The
 * same pass extracts the turn count and the submission. Agent-source events
 * go to `agentPath`. Supervisor and orchestrator events go to
 * `supervisorPath`.
 *
 * This function deliberately does not sum cost. The caller derives it from
 * the same combined trace with `sumTraceCost`. One cost path then serves the
 * benchmark, callback, and `gemba-trace cost` consumers.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} combinedPath
 * @param {string} agentPath
 * @param {string} supervisorPath
 * @returns {Promise<{turns: number, submission: string}>}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stream-splitting state machine
export async function splitAndSummarize(
  runtime,
  combinedPath,
  agentPath,
  supervisorPath,
) {
  const fs = runtime.fs;
  const agentStream = fs.createWriteStream(agentPath);
  const supStream = fs.createWriteStream(supervisorPath);
  const rl = createInterface({
    input: fs.createReadStream(combinedPath),
    crlfDelay: Infinity,
  });
  let turns = 0;
  let submission = "";
  for await (const line of rl) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const target = event.source === "agent" ? agentStream : supStream;
    target.write(line + "\n");
    const inner = event.event;
    if (!inner) continue;
    if (event.source === "agent" && inner.type === "assistant") {
      const text = extractText(inner);
      if (text) submission = text;
    }
    if (event.source === "orchestrator" && inner.type === "summary") {
      turns = inner.turns ?? 0;
    }
  }
  await Promise.all([
    new Promise((r) => agentStream.end(r)),
    new Promise((r) => supStream.end(r)),
  ]);
  return { turns, submission };
}

function extractText(inner) {
  const content = inner.message?.content ?? inner.content;
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "text" && content[i].text) return content[i].text;
  }
  return null;
}
