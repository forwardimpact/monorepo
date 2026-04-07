/**
 * View builder for capability entities.
 *
 * Returns the flat shape consumed by `templates/capability.html`. Skills are
 * inlined as nested view models so the template can render them via the
 * `skill-inline.html` partial.
 */

import { capabilityIri } from "../iri.js";
import { buildSkillView } from "./skill.js";

/**
 * @param {object} capability - Raw capability entity (from DataLoader)
 * @param {object} ctx
 * @param {Array} ctx.skills - All skills (used to find skills for this capability)
 * @param {Array} ctx.capabilities
 * @param {Array} ctx.disciplines
 * @param {Array} ctx.tracks
 * @param {Array} ctx.drivers
 * @returns {object}
 */
export function buildCapabilityView(capability, ctx) {
  const { skills = [] } = ctx || {};

  const ownedSkills = skills
    .filter((s) => s.capability === capability.id)
    .map((s) => buildSkillView(s, ctx));

  const professionalResponsibilities = Object.entries(
    capability.professionalResponsibilities || {},
  ).map(([level, description]) => ({ level, description }));

  const managementResponsibilities = Object.entries(
    capability.managementResponsibilities || {},
  ).map(([level, description]) => ({ level, description }));

  return {
    iri: capabilityIri(capability.id),
    id: capability.id,
    name: capability.name,
    description: (capability.description || "").trim(),
    professionalResponsibilities,
    managementResponsibilities,
    skills: ownedSkills,
  };
}
