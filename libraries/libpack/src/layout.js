/**
 * Canonical APM source layout.
 *
 * APM discovers a package's primitives by directory convention: skills under
 * `.apm/skills/<name>/` and agents under `.apm/agents/<name>.agent.md`. The
 * `.agent.md` suffix is load-bearing — APM's agent discovery keys on it; a
 * plain `.md` file under `.apm/agents/` is not recognized as an agent, and a
 * root-level `agents/` directory is not a recognized package form at all.
 *
 * Defining the layout once keeps every staging path from drifting: the
 * sibling-repo publisher and the Pathway git packs both build the same shape,
 * so agents can never silently fail to install in one path but not the other.
 */
export const APM_SKILLS_DIR = ".apm/skills";
export const APM_AGENTS_DIR = ".apm/agents";

/**
 * Canonical APM agent filename for an agent whose stem (basename without
 * extension) is `stem`.
 * @param {string} stem
 * @returns {string}
 */
export function apmAgentFilename(stem) {
  return `${stem}.agent.md`;
}
