/**
 * Raw-trace summary for the benchmark runner: one post-session read of the
 * preserved raw combined trace derives cost, turns, and submission. Named as
 * its own module so summarization never re-entangles with splitting — the
 * coupling that caused the original split-policy divergence.
 */

import { sumTraceCost } from "../cost.js";
import { parseEnvelopeLine } from "../trace-split.js";

/**
 * One read of the preserved raw combined trace:
 *   cost       — `sumTraceCost` over the lines (the one cost path),
 *   turns      — last orchestrator-source `summary` event's `turns`,
 *   submission — last agent-source assistant text block.
 *
 * An empty (materialized-stub) raw file yields zeros and an empty
 * submission; malformed and blank lines are tolerated.
 *
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} rawTracePath
 * @returns {Promise<{costUsd: number,
 *   costBreakdown: {agent: number, supervisor: number},
 *   turns: number, submission: string}>}
 */
export async function summarizeRawTrace(runtime, rawTracePath) {
  const content = await runtime.fs.readFile(rawTracePath, "utf8");
  const lines = content.split("\n");
  const { totalCostUsd, bySource } = sumTraceCost(lines);
  const { turns, submission } = deriveTurnsAndSubmission(lines);

  return {
    costUsd: totalCostUsd,
    costBreakdown: {
      agent: bySource.agent ?? 0,
      supervisor: bySource.supervisor ?? 0,
    },
    turns,
    submission,
  };
}

/**
 * One walk of the parsed envelope lines: the last orchestrator `summary`
 * event's `turns` and the last agent assistant text block.
 * @param {string[]} lines
 * @returns {{turns: number, submission: string}}
 */
function deriveTurnsAndSubmission(lines) {
  let turns = 0;
  let submission = "";
  for (const line of lines) {
    const envelope = parseEnvelopeLine(line);
    if (!envelope) continue;
    const inner = envelope.event;
    if (envelope.source === "agent" && inner.type === "assistant") {
      const text = extractText(inner);
      if (text) submission = text;
    }
    if (envelope.source === "orchestrator" && inner.type === "summary") {
      turns = inner.turns ?? 0;
    }
  }
  return { turns, submission };
}

/**
 * Last text block of an assistant event's content, or null when none exists.
 * @param {object} inner - Unwrapped event.
 * @returns {string|null}
 */
function extractText(inner) {
  const content = inner.message?.content ?? inner.content;
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "text" && content[i].text) return content[i].text;
  }
  return null;
}
