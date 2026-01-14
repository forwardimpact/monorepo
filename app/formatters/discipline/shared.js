/**
 * Discipline presentation helpers
 *
 * Shared utilities for formatting discipline data across DOM and markdown outputs.
 */

import { truncate } from "../shared.js";

/**
 * Get items by their IDs
 * @param {Array} items - Array of items with id property
 * @param {string[]} ids - Array of IDs to find
 * @returns {Array} - Found items
 */
function getItemsByIds(items, ids) {
  if (!ids) return [];
  return ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
}

/**
 * Get discipline display name
 * @param {Object} discipline
 * @returns {string}
 */
export function getDisciplineDisplayName(discipline) {
  return discipline.specialization || discipline.name || discipline.id;
}

/**
 * @typedef {Object} DisciplineListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} truncatedDescription
 * @property {number} coreSkillsCount
 * @property {number} supportingSkillsCount
 * @property {number} broadSkillsCount
 */

/**
 * Transform disciplines for list view
 * @param {Array} disciplines - Raw discipline entities
 * @param {number} [descriptionLimit=120] - Maximum description length
 * @returns {{ items: DisciplineListItem[] }}
 */
export function prepareDisciplinesList(disciplines, descriptionLimit = 120) {
  const items = disciplines.map((discipline) => ({
    id: discipline.id,
    name: getDisciplineDisplayName(discipline),
    description: discipline.description,
    truncatedDescription: truncate(discipline.description, descriptionLimit),
    coreSkillsCount: discipline.coreSkills?.length || 0,
    supportingSkillsCount: discipline.supportingSkills?.length || 0,
    broadSkillsCount: discipline.broadSkills?.length || 0,
  }));

  return { items };
}

/**
 * @typedef {Object} SkillReference
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} BehaviourModifier
 * @property {string} id
 * @property {string} name
 * @property {number} modifier
 */

/**
 * @typedef {Object} DisciplineDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {SkillReference[]} coreSkills
 * @property {SkillReference[]} supportingSkills
 * @property {SkillReference[]} broadSkills
 * @property {BehaviourModifier[]} behaviourModifiers
 */

/**
 * Transform discipline for detail view
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @returns {DisciplineDetailView|null}
 */
export function prepareDisciplineDetail(discipline, { skills, behaviours }) {
  if (!discipline) return null;

  const coreSkills = getItemsByIds(skills, discipline.coreSkills).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const supportingSkills = getItemsByIds(
    skills,
    discipline.supportingSkills,
  ).map((s) => ({ id: s.id, name: s.name }));

  const broadSkills = getItemsByIds(skills, discipline.broadSkills).map(
    (s) => ({ id: s.id, name: s.name }),
  );

  const behaviourModifiers = discipline.behaviourModifiers
    ? Object.entries(discipline.behaviourModifiers).map(
        ([behaviourId, modifier]) => {
          const behaviour = behaviours.find((b) => b.id === behaviourId);
          return {
            id: behaviourId,
            name: behaviour?.name || behaviourId,
            modifier,
          };
        },
      )
    : [];

  return {
    id: discipline.id,
    name: getDisciplineDisplayName(discipline),
    description: discipline.description,
    coreSkills,
    supportingSkills,
    broadSkills,
    behaviourModifiers,
  };
}
