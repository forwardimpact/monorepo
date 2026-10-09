import path from "node:path";
import {
  AGENT_PROFILES_DIR,
  frontmatterField,
  isAgentProfile,
} from "@forwardimpact/libutil";
import { BROADCAST_TARGET } from "./constants.js";

/**
 * List the agent profiles in the agents directory. Return the roster keys and
 * the summary paths. A file is on the roster when it is a profile (`name` and
 * `description` frontmatter). A reference file under the directory is not. The
 * key is the file stem with a trailing `.agent` removed, so a pack-installed
 * `<stem>.agent.md` keys as `<stem>`. An absent directory is an empty roster.
 * The roster is in file-name order, so the sections it seeds are stable.
 * @param {{agentsDir: string, wikiRoot: string}} dirs
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 * @param {{warn?: function(string): void}} [hooks] - `warn` fires once per
 *   profile whose `name` differs from its roster key.
 * @returns {Array<{agent: string, summaryPath: string}>}
 */
export function listAgents({ agentsDir, wikiRoot }, fs, { warn } = {}) {
  if (!fs.existsSync(agentsDir)) return [];
  const agents = [];

  for (const entry of [...fs.readdirSync(agentsDir)].sort()) {
    if (!entry.endsWith(".md")) continue;
    const fullPath = path.join(agentsDir, entry);
    if (!fs.statSync(fullPath).isFile()) continue;
    const text = fs.readFileSync(fullPath, "utf-8");
    if (!isAgentProfile(text)) continue;

    const key = entry.slice(0, -3).replace(/\.agent$/, "");
    if (key === BROADCAST_TARGET) {
      throw new Error(
        `agent name '${BROADCAST_TARGET}' is reserved for broadcast`,
      );
    }
    const name = frontmatterField(text, "name");
    if (warn && name !== key) {
      warn(`profile ${entry} names '${name}', roster key is '${key}'`);
    }

    agents.push({
      agent: key,
      summaryPath: path.join(wikiRoot, key + ".md"),
    });
  }

  return agents;
}

/**
 * The roster of a project: `listAgents` under `<projectRoot>/AGENT_PROFILES_DIR`.
 * @param {{projectRoot: string, wikiRoot: string}} dirs
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 * @param {{warn?: function(string): void}} [hooks]
 * @returns {Array<{agent: string, summaryPath: string}>}
 */
export function listProjectAgents(
  { projectRoot, wikiRoot },
  fs,
  { warn } = {},
) {
  return listAgents(
    { agentsDir: path.join(projectRoot, AGENT_PROFILES_DIR), wikiRoot },
    fs,
    { warn },
  );
}
