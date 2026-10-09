/**
 * The one home for the agent-profile test and the runtime profiles
 * directory. `libpack` stages a profile under a different name than a
 * reference, `libinvariant` partitions the layers by it, `libwiki` builds
 * its roster from it, and the repository invariants scan the directory it
 * names. Claude Code's agent loader applies the same test: a markdown file
 * whose frontmatter carries `name` and `description` loads as an agent.
 */

/** The directory the runtime loads agent profiles from, relative to the project root. */
export const AGENT_PROFILES_DIR = ".claude/agents";

/**
 * The first `key:` frontmatter value at line start, or "".
 * @param {string} text - The markdown file contents.
 * @param {string} key - The frontmatter key.
 * @returns {string}
 */
export function frontmatterField(text, key) {
  const m =
    typeof text === "string" &&
    text.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
  return m ? m[1].trim() : "";
}

/**
 * A markdown file is an agent profile when its frontmatter carries `name`
 * and `description`. Every other file under the profiles directory is a
 * reference.
 * @param {string} text - The markdown file contents.
 * @returns {boolean}
 */
export function isAgentProfile(text) {
  return (
    frontmatterField(text, "name") !== "" &&
    frontmatterField(text, "description") !== ""
  );
}
