/**
 * Discipline presentation helpers
 *
 * These shared utilities format discipline data across DOM and markdown
 * outputs.
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
 * @property {boolean} isProfessional
 * @property {boolean} isManagement
 */

/**
 * Transform a single discipline to list item format
 * @param {Object} discipline - Raw discipline entity
 * @param {number} descriptionLimit - Maximum description length
 * @returns {DisciplineListItem}
 */
function disciplineToListItem(discipline, descriptionLimit) {
  return {
    id: discipline.id,
    name: getDisciplineDisplayName(discipline),
    description: discipline.description,
    truncatedDescription: truncate(discipline.description, descriptionLimit),
    coreSkillsCount: discipline.coreSkills?.length || 0,
    supportingSkillsCount: discipline.supportingSkills?.length || 0,
    broadSkillsCount: discipline.broadSkills?.length || 0,
    isProfessional: discipline.isProfessional || false,
    isManagement: discipline.isManagement || false,
  };
}

/**
 * Transform disciplines for list view. Group them by type
 * (professional/management)
 * @param {Array} disciplines - Raw discipline entities
 * @param {number} [descriptionLimit=120] - Maximum description length
 * @returns {{ items: DisciplineListItem[], groups: Object<string, DisciplineListItem[]>, groupOrder: string[] }}
 */
export function prepareDisciplinesList(disciplines, descriptionLimit = 120) {
  const professional = [];
  const management = [];

  for (const discipline of disciplines) {
    const item = disciplineToListItem(discipline, descriptionLimit);
    if (discipline.isManagement) {
      management.push(item);
    } else {
      // Default to professional if the discipline is not explicitly management
      professional.push(item);
    }
  }

  // Order the groups for display. Professional comes first, then management.
  const groups = {};
  const groupOrder = [];

  if (professional.length > 0) {
    groups.professional = professional;
    groupOrder.push("professional");
  }
  if (management.length > 0) {
    groups.management = management;
    groupOrder.push("management");
  }

  // items maintains backward compatibility (professional first, then management)
  const items = [...professional, ...management];

  return { items, groups, groupOrder };
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
