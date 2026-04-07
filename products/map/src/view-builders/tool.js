/**
 * View builder for tool entities.
 *
 * Tool entities are derived from the `toolReferences` arrays on skills.
 * The exporter is responsible for aggregating tools across skills before
 * passing them in here. The view builder itself is a pure transform.
 */

import { toolIri, skillIri } from "../iri.js";

/**
 * Slugify a tool name into a stable id usable in an IRI path.
 * @param {string} name
 * @returns {string}
 */
export function slugifyToolName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {object} tool - Aggregated tool entity
 * @param {string} tool.name
 * @param {string} [tool.url]
 * @param {string} [tool.description]
 * @param {string} [tool.useWhen]
 * @param {Array<{ skillId: string }>} [tool.usages]
 * @returns {object}
 */
export function buildToolView(tool) {
  const id = slugifyToolName(tool.name);
  const usedBySkills = (tool.usages || []).map((u) => ({
    iri: skillIri(u.skillId),
    id: u.skillId,
  }));

  return {
    iri: toolIri(id),
    id,
    name: tool.name,
    url: tool.url || null,
    description: tool.description || null,
    useWhen: tool.useWhen || null,
    usedBySkills,
  };
}

/**
 * Aggregate tools from a list of skills, deduplicating by name. Returns the
 * raw aggregated objects (not yet transformed into views).
 *
 * @param {Array} skills
 * @returns {Array<{name: string, url?: string, description?: string, usages: Array}>}
 */
export function aggregateTools(skills) {
  const map = new Map();
  for (const skill of skills) {
    if (!skill.toolReferences) continue;
    for (const tool of skill.toolReferences) {
      const usage = {
        skillId: skill.id,
        skillName: skill.name,
        capabilityId: skill.capability,
        useWhen: tool.useWhen,
      };
      const existing = map.get(tool.name);
      if (existing) {
        existing.usages.push(usage);
      } else {
        map.set(tool.name, {
          name: tool.name,
          url: tool.url,
          description: tool.description,
          useWhen: tool.useWhen,
          usages: [usage],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
