import path from "node:path";
import { BROADCAST_TARGET } from "./constants.js";

/**
 * List all agent markdown files in the agents directory, returning agent names
 * and summary paths.
 * @param {{agentsDir: string, wikiRoot: string}} dirs
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function listAgents({ agentsDir, wikiRoot }, fs) {
  const entries = fs.readdirSync(agentsDir);
  const agents = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const fullPath = path.join(agentsDir, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const agent = entry.slice(0, -3);
    if (agent === BROADCAST_TARGET) {
      throw new Error(
        `agent name '${BROADCAST_TARGET}' is reserved for broadcast`,
      );
    }

    agents.push({
      agent,
      summaryPath: path.join(wikiRoot, agent + ".md"),
    });
  }

  return agents;
}
