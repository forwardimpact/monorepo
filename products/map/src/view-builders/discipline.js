/**
 * View builder for discipline entities.
 */

import { disciplineIri, skillIri } from "../iri.js";

const toSkillRefs = (ids) =>
  (ids || []).map((id) => ({ iri: skillIri(id), id }));

/**
 * @param {object} discipline - Raw discipline entity
 * @returns {object}
 */
export function buildDisciplineView(discipline) {
  return {
    iri: disciplineIri(discipline.id),
    id: discipline.id,
    name: discipline.specialization || discipline.roleTitle || discipline.id,
    specialization: discipline.specialization || null,
    roleTitle: discipline.roleTitle || null,
    description: discipline.description || "",
    coreSkills: toSkillRefs(discipline.coreSkills),
    supportingSkills: toSkillRefs(discipline.supportingSkills),
    broadSkills: toSkillRefs(discipline.broadSkills),
  };
}
