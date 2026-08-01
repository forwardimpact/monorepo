/**
 * Shared helper that builds prior-context lines in pathway prompts.
 */

/** @param {object[]} levels @returns {string[]} */
function formatLevels(levels) {
  const valid = levels.filter(Boolean);
  if (valid.length === 0) return [];
  return [
    "Level titles:",
    ...valid.map((l) => `- ${l.id}: ${l.professionalTitle || l.id}`),
  ];
}

/** @param {object[]} behaviours @returns {string[]} */
function formatBehaviours(behaviours) {
  const valid = behaviours.filter(Boolean);
  if (valid.length === 0) return [];
  return [
    "Behaviour names:",
    ...valid.map((b) => `- ${b._id || b.id}: ${b.name || b._id || b.id}`),
  ];
}

/** @param {object[]} capabilities @returns {string[]} */
function formatCapabilities(capabilities) {
  const valid = capabilities.filter(Boolean);
  if (valid.length === 0) return [];
  return [
    "Capability names and skill IDs:",
    ...valid.map(
      (c) =>
        `- ${c._id || c.id}: ${c.name || c._id || c.id} (skills: ${(c.skills || []).map((s) => s.id || s).join(", ")})`,
    ),
  ];
}

/**
 * Build the prompt lines that describe previously generated context.
 * @param {object} [priorOutput]
 * @returns {string[]}
 */
export function buildPriorContextLines(priorOutput) {
  if (!priorOutput) return [];
  const lines = [];
  if (Array.isArray(priorOutput.levels))
    lines.push(...formatLevels(priorOutput.levels));
  if (Array.isArray(priorOutput.behaviours))
    lines.push(...formatBehaviours(priorOutput.behaviours));
  if (Array.isArray(priorOutput.capabilities))
    lines.push(...formatCapabilities(priorOutput.capabilities));
  if (lines.length === 0) return [];
  return ["", "## Previously generated context", ...lines];
}
