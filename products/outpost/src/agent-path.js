/**
 * agent-path — validate a config-supplied agent name before you use it as a
 * filesystem path component.
 *
 * The agent-state writer maps an agent name to a per-agent state filename.
 * A name that carries `/` or `..` segments would let a rewritten
 * `scheduler.json` direct writes outside `~/.cache/fit/outpost/state/`. This
 * module validates the name and rejects an unsafe one. It never sanitises the
 * name silently. So an unexpected path segment surfaces as an intrusion
 * signal. It does not become a quietly rewritten filename.
 */

/**
 * `agentNameToStatePrefix` raises this when an agent name cannot map to a
 * safe state-file prefix.
 */
export class UnsafeAgentNameError extends Error {
  /** @param {string} name */
  constructor(name) {
    super(`unsafe agent name for state path: ${JSON.stringify(name)}`);
    this.name = "UnsafeAgentNameError";
    this.agentName = name;
  }
}

/**
 * Map an agent name to a safe state-file prefix (hyphen → underscore).
 * @param {string} name
 * @returns {string} safe filename prefix
 * @throws {UnsafeAgentNameError} when `name` is empty, non-string, or contains
 *   `/`, `\`, `..`, NUL, or a leading `~`.
 */
export function agentNameToStatePrefix(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name.includes("\0") ||
    name.startsWith("~")
  ) {
    throw new UnsafeAgentNameError(String(name));
  }
  return name.replace(/-/g, "_");
}
