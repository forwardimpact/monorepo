/**
 * View builder for skill entities.
 *
 * Pure function that flattens a raw skill YAML object into the flat shape
 * consumed by `templates/skill.html` and the `skill-inline.html` partial.
 */

import {
  skillIri,
  capabilityIri,
  disciplineIri,
  trackIri,
  driverIri,
} from "../iri.js";

/**
 * @param {object} skill - Raw skill entity (from DataLoader)
 * @param {object} ctx
 * @param {Array} ctx.capabilities
 * @param {Array} ctx.disciplines
 * @param {Array} ctx.tracks
 * @param {Array} ctx.drivers
 * @returns {object}
 */
export function buildSkillView(skill, ctx) {
  const {
    capabilities = [],
    disciplines = [],
    tracks = [],
    drivers = [],
  } = ctx || {};

  const capability = capabilities.find((c) => c.id === skill.capability);

  const proficiencies = Object.entries(skill.proficiencyDescriptions || {}).map(
    ([level, description]) => ({ level, description }),
  );

  const relatedDisciplines = disciplines
    .filter(
      (d) =>
        (d.coreSkills || []).includes(skill.id) ||
        (d.supportingSkills || []).includes(skill.id) ||
        (d.broadSkills || []).includes(skill.id),
    )
    .map((d) => ({
      iri: disciplineIri(d.id),
      id: d.id,
      name: d.specialization || d.roleTitle || d.id,
    }));

  const relatedTracks = tracks
    .filter((t) => t.skillModifiers && t.skillModifiers[skill.id] !== undefined)
    .map((t) => ({
      iri: trackIri(t.id),
      id: t.id,
      name: t.name,
      modifier: t.skillModifiers[skill.id],
    }));

  const relatedDrivers = drivers
    .filter((d) => (d.contributingSkills || []).includes(skill.id))
    .map((d) => ({ iri: driverIri(d.id), id: d.id, name: d.name }));

  return {
    iri: skillIri(skill.id),
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    capabilityIri: capability ? capabilityIri(capability.id) : null,
    capabilityName: capability?.name || skill.capability || "",
    isHumanOnly: Boolean(skill.isHumanOnly),
    proficiencies,
    relatedDisciplines,
    relatedTracks,
    relatedDrivers,
  };
}
