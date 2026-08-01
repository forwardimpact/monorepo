/**
 * Canonical APM source layout.
 *
 * APM discovers a package's primitives by directory convention: skills under
 * `.apm/skills/<name>/` and agents under `.apm/agents/<name>.agent.md`. The
 * `.agent.md` suffix is load-bearing. APM's agent discovery keys on it. APM
 * does not recognize a plain `.md` file under `.apm/agents/` as an agent. APM
 * does not recognize a root-level `agents/` directory as a package form at
 * all.
 *
 * A single definition of the layout prevents drift between the staging paths.
 * The sibling-repo publisher and the Pathway git packs both build the same
 * shape. So an agent never fails silently in one path while it installs in
 * the other.
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
