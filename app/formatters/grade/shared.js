/**
 * Grade presentation helpers
 *
 * Shared utilities for formatting grade data across DOM and markdown outputs.
 */

/**
 * Get grade display name (shows both professional and management titles)
 * @param {Object} grade
 * @returns {string}
 */
export function getGradeDisplayName(grade) {
  if (grade.professionalTitle && grade.managementTitle) {
    if (grade.professionalTitle === grade.managementTitle) {
      return grade.professionalTitle;
    }
    return `${grade.professionalTitle} / ${grade.managementTitle}`;
  }
  return grade.professionalTitle || grade.managementTitle || grade.id;
}

/**
 * @typedef {Object} GradeListItem
 * @property {string} id
 * @property {string} displayName
 * @property {number} ordinalRank
 * @property {string|null} typicalExperienceRange
 * @property {Object} baseSkillLevels
 * @property {string|null} impactScope
 */

/**
 * Transform grades for list view
 * @param {Array} grades - Raw grade entities
 * @returns {{ items: GradeListItem[] }}
 */
export function prepareGradesList(grades) {
  const sortedGrades = [...grades].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );

  const items = sortedGrades.map((grade) => ({
    id: grade.id,
    displayName: getGradeDisplayName(grade),
    ordinalRank: grade.ordinalRank,
    typicalExperienceRange: grade.typicalExperienceRange || null,
    baseSkillLevels: grade.baseSkillLevels || {},
    impactScope: grade.expectations?.impactScope || null,
  }));

  return { items };
}

/**
 * @typedef {Object} GradeDetailView
 * @property {string} id
 * @property {string} displayName
 * @property {string} professionalTitle
 * @property {string} managementTitle
 * @property {number} ordinalRank
 * @property {string|null} typicalExperienceRange
 * @property {Object} baseSkillLevels
 * @property {Object} baseBehaviourMaturity
 * @property {Object} expectations
 */

/**
 * Transform grade for detail view
 * @param {Object} grade - Raw grade entity
 * @returns {GradeDetailView|null}
 */
export function prepareGradeDetail(grade) {
  if (!grade) return null;

  return {
    id: grade.id,
    displayName: getGradeDisplayName(grade),
    professionalTitle: grade.professionalTitle || null,
    managementTitle: grade.managementTitle || null,
    ordinalRank: grade.ordinalRank,
    typicalExperienceRange: grade.typicalExperienceRange || null,
    baseSkillLevels: grade.baseSkillLevels || {},
    baseBehaviourMaturity: grade.baseBehaviourMaturity || {},
    expectations: grade.expectations || {},
  };
}
