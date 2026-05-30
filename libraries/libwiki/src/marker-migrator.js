import { MEMO_INBOX_MARKER, INBOX_HEADING } from "./constants.js";
import { listAgents } from "./agent-roster.js";

/**
 * Insert memo:inbox markers into agent summary files that have an inbox heading
 * but no marker yet.
 * @param {{agentsDir: string, wikiRoot: string}} dirs
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function insertMarkers({ agentsDir, wikiRoot }, fs) {
  const agents = listAgents({ agentsDir, wikiRoot }, fs);
  const inserted = [];
  const skipped = [];
  const errors = [];

  for (const { agent, summaryPath } of agents) {
    const content = fs.readFileSync(summaryPath, "utf-8");

    if (content.includes(MEMO_INBOX_MARKER)) {
      skipped.push(agent);
      continue;
    }

    const lines = content.split("\n");
    const headingIndex = lines.findIndex(
      (line) => line.trim() === INBOX_HEADING,
    );

    if (headingIndex === -1) {
      errors.push({ agent, reason: "missing-heading" });
      continue;
    }

    lines.splice(headingIndex + 1, 0, "", MEMO_INBOX_MARKER);
    fs.writeFileSync(summaryPath, lines.join("\n"));
    inserted.push(agent);
  }

  return { inserted, skipped, errors };
}
