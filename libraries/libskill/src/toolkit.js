/**
 * Toolkit Derivation Functions
 *
 * Derives a de-duplicated list of tools from a skill matrix. It looks up
 * toolReferences from skill definitions. Only skills at the highest derived
 * level contribute tools. This keeps toolkits focused for both jobs and
 * agents.
 */

import { filterToolkitSkills } from "./policies/composed.js";

/**
 * @typedef {Object} ToolkitEntry
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {string} [url] - Tool documentation URL
 * @property {string} [simpleIcon] - Simple Icons slug for the tool icon
 * @property {string[]} skillIds - IDs of skills that reference this tool
 */

/**
 * Derive a de-duplicated toolkit from a skill matrix
 *
 * Extracts tools from skills at the highest derived level. De-duplicates the
 * tools by name. Collects which skills reference each tool. This keeps
 * toolkits focused on the engineer's core competencies for both jobs and
 * agents.
 *
 * @param {Object} params
 * @param {Array<{skillId: string, level: string}>} params.skillMatrix - Skill matrix with skill IDs and levels
 * @param {Array} params.skills - All skill definitions with toolReferences
 * @returns {ToolkitEntry[]} De-duplicated toolkit sorted by name
 */
/** Merge a tool reference into an existing entry. Fill missing metadata. */
function mergeToolEntry(existing, tool, skillId) {
  if (!existing.skillIds.includes(skillId)) {
    existing.skillIds.push(skillId);
  }
  if (!existing.url && tool.url) {
    existing.url = tool.url;
  }
  if (!existing.simpleIcon && tool.simpleIcon) {
    existing.simpleIcon = tool.simpleIcon;
  }
}

/** Insert or merge a single tool reference into the dedup map. */
function upsertTool(toolMap, tool, skillId) {
  const existing = toolMap.get(tool.name);
  if (existing) {
    mergeToolEntry(existing, tool, skillId);
  } else {
    toolMap.set(tool.name, {
      name: tool.name,
      description: tool.description,
      url: tool.url,
      simpleIcon: tool.simpleIcon,
      skillIds: [skillId],
    });
  }
}

/** Derive a de-duplicated, sorted toolkit from the highest-level skills in a skill matrix. */
export function deriveToolkit({ skillMatrix, skills }) {
  const sourceMatrix = filterToolkitSkills(skillMatrix);
  const skillMap = new Map(skills.map((s) => [s.id, s]));
  const toolMap = new Map();

  for (const entry of sourceMatrix) {
    const skill = skillMap.get(entry.skillId);
    if (!skill?.toolReferences) continue;

    for (const tool of skill.toolReferences) {
      upsertTool(toolMap, tool, skill.id);
    }
  }

  return Array.from(toolMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
