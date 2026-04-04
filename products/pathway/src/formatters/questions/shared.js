/**
 * Questions presentation helpers
 *
 * Shared utilities for formatting question data across output formats.
 */

/**
 * Skill proficiencies in order
 */
export const SKILL_PROFICIENCIES = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];

/**
 * Behaviour maturities in order
 */
export const BEHAVIOUR_MATURITIES = [
  "emerging",
  "developing",
  "practicing",
  "role_modeling",
  "exemplifying",
];

/**
 * @typedef {Object} QuestionsFilter
 * @property {string|null} level - Skill proficiency filter
 * @property {string|null} maturity - Behaviour maturity filter
 * @property {string[]|null} skills - Skill IDs to include
 * @property {string[]|null} behaviours - Behaviour IDs to include
 * @property {string|null} capability - Capability filter for skills
 */

/**
 * @typedef {Object} FlattenedQuestion
 * @property {string} source - Source skill/behaviour ID
 * @property {string} sourceName - Source skill/behaviour name
 * @property {string} sourceType - 'skill' or 'behaviour'
 * @property {string} level - Skill proficiency or behaviour maturity
 * @property {string} id - Question ID
 * @property {string} text - Question text
 * @property {string[]} lookingFor - Expected answer indicators
 * @property {number} expectedDurationMinutes - Time estimate
 * @property {string[]} [followUps] - Follow-up questions
 * @property {string} [context] - Scenario context
 * @property {string[]} [simulationPrompts] - Simulation steering prompts
 * @property {string[]} [decompositionPrompts] - Decomposition guidance prompts
 */

/**
 * @typedef {Object} QuestionsView
 * @property {QuestionsFilter} filter - Applied filters
 * @property {FlattenedQuestion[]} questions - Flattened questions
 * @property {Object} stats - Question statistics
 */

/**
 * Parse filter options from CLI args
 * @param {Object} options - CLI options
 * @returns {QuestionsFilter}
 */
export function parseFilters(options) {
  return {
    level: options.level || null,
    maturity: options.maturity || null,
    skills: options.skill ? options.skill.split(",") : null,
    behaviours: options.behaviour ? options.behaviour.split(",") : null,
    capability: options.capability || null,
  };
}

/**
 * Get skill name by ID
 * @param {string} skillId
 * @param {Array} skills
 * @returns {string}
 */
function getSkillName(skillId, skills) {
  const skill = skills.find((s) => s.id === skillId);
  return skill ? skill.name : skillId;
}

/**
 * Get behaviour name by ID
 * @param {string} behaviourId
 * @param {Array} behaviours
 * @returns {string}
 */
function getBehaviourName(behaviourId, behaviours) {
  const behaviour = behaviours.find((b) => b.id === behaviourId);
  return behaviour ? behaviour.name : behaviourId;
}

/**
 * Get skill capability by ID
 * @param {string} skillId
 * @param {Array} skills
 * @returns {string|null}
 */
function getSkillCapability(skillId, skills) {
  const skill = skills.find((s) => s.id === skillId);
  return skill ? skill.capability : null;
}

/**
 * Role type keys in question YAML files
 */
const ROLE_TYPES = ["professionalQuestions", "managementQuestions"];

/**
 * Check whether skill questions should be included given the current filter
 * @param {string} skillId
 * @param {Array} skills
 * @param {QuestionsFilter} filter
 * @returns {boolean}
 */
function shouldIncludeSkill(skillId, skills, filter) {
  if (filter.skills && !filter.skills.includes(skillId)) return false;
  if (filter.behaviours) return false;
  if (filter.maturity) return false;
  if (filter.capability) {
    const capability = getSkillCapability(skillId, skills);
    if (capability !== filter.capability) return false;
  }
  return true;
}

/**
 * Check whether behaviour questions should be included given the current filter
 * @param {string} behaviourId
 * @param {QuestionsFilter} filter
 * @returns {boolean}
 */
function shouldIncludeBehaviour(behaviourId, filter) {
  if (filter.behaviours && !filter.behaviours.includes(behaviourId))
    return false;
  if (filter.capability) return false;
  if (filter.skills) return false;
  if (filter.level) return false;
  return true;
}

/**
 * Flatten skill questions from a single skill entry
 * @param {string} skillId
 * @param {Object} roleTypes
 * @param {Array} skills
 * @param {QuestionsFilter} filter
 * @param {FlattenedQuestion[]} out
 */
function flattenSkillQuestions(skillId, roleTypes, skills, filter, out) {
  const skillName = getSkillName(skillId, skills);

  for (const roleType of ROLE_TYPES) {
    const levels = roleTypes[roleType];
    if (!levels) continue;

    for (const [level, levelQuestions] of Object.entries(levels)) {
      if (filter.level && level !== filter.level) continue;

      for (const q of levelQuestions) {
        out.push({
          source: skillId,
          sourceName: skillName,
          sourceType: "skill",
          level,
          id: q.id,
          text: q.text,
          lookingFor: q.lookingFor || [],
          expectedDurationMinutes: q.expectedDurationMinutes || 5,
          followUps: q.followUps || [],
          context: q.context || null,
          decompositionPrompts: q.decompositionPrompts || [],
        });
      }
    }
  }
}

/**
 * Flatten behaviour questions from a single behaviour entry
 * @param {string} behaviourId
 * @param {Object} roleTypes
 * @param {Array} behaviours
 * @param {QuestionsFilter} filter
 * @param {FlattenedQuestion[]} out
 */
function flattenBehaviourQuestions(
  behaviourId,
  roleTypes,
  behaviours,
  filter,
  out,
) {
  const behaviourName = getBehaviourName(behaviourId, behaviours);

  for (const roleType of ROLE_TYPES) {
    const maturities = roleTypes[roleType];
    if (!maturities) continue;

    for (const [maturity, maturityQuestions] of Object.entries(maturities)) {
      if (filter.maturity && maturity !== filter.maturity) continue;

      for (const q of maturityQuestions) {
        out.push({
          source: behaviourId,
          sourceName: behaviourName,
          sourceType: "behaviour",
          level: maturity,
          id: q.id,
          text: q.text,
          lookingFor: q.lookingFor || [],
          expectedDurationMinutes: q.expectedDurationMinutes || 5,
          followUps: q.followUps || [],
          context: q.context || null,
          simulationPrompts: q.simulationPrompts || [],
        });
      }
    }
  }
}

/**
 * Flatten all questions from question bank
 * @param {Object} questionBank
 * @param {Array} skills
 * @param {Array} behaviours
 * @param {QuestionsFilter} filter
 * @returns {FlattenedQuestion[]}
 */
export function flattenQuestions(questionBank, skills, behaviours, filter) {
  const questions = [];

  for (const [skillId, roleTypes] of Object.entries(
    questionBank.skillProficiencies || {},
  )) {
    if (!shouldIncludeSkill(skillId, skills, filter)) continue;
    flattenSkillQuestions(skillId, roleTypes, skills, filter, questions);
  }

  for (const [behaviourId, roleTypes] of Object.entries(
    questionBank.behaviourMaturities || {},
  )) {
    if (!shouldIncludeBehaviour(behaviourId, filter)) continue;
    flattenBehaviourQuestions(
      behaviourId,
      roleTypes,
      behaviours,
      filter,
      questions,
    );
  }

  return questions;
}

/**
 * Count questions across role types for a given level/maturity
 * @param {Object} roleTypes - Role type map
 * @param {string} levelKey - Level or maturity key
 * @returns {number}
 */
function countQuestionsForLevel(roleTypes, levelKey) {
  let count = 0;
  for (const roleType of ROLE_TYPES) {
    count += (roleTypes[roleType]?.[levelKey] || []).length;
  }
  return count;
}

/**
 * Calculate question statistics
 * @param {FlattenedQuestion[]} questions
 * @param {Object} questionBank
 * @returns {Object}
 */
export function calculateStats(questions, questionBank) {
  const bySource = {};
  const byLevel = {};

  for (const q of questions) {
    bySource[q.source] = (bySource[q.source] || 0) + 1;
    byLevel[q.level] = (byLevel[q.level] || 0) + 1;
  }

  // Calculate full stats for skills and behaviours
  const skillStats = {};
  for (const [skillId, roleTypes] of Object.entries(
    questionBank.skillProficiencies || {},
  )) {
    skillStats[skillId] = {};
    for (const level of SKILL_PROFICIENCIES) {
      skillStats[skillId][level] = countQuestionsForLevel(roleTypes, level);
    }
    skillStats[skillId].total = Object.values(skillStats[skillId]).reduce(
      (a, b) => a + b,
      0,
    );
  }

  const behaviourStats = {};
  for (const [behaviourId, roleTypes] of Object.entries(
    questionBank.behaviourMaturities || {},
  )) {
    behaviourStats[behaviourId] = {};
    for (const maturity of BEHAVIOUR_MATURITIES) {
      behaviourStats[behaviourId][maturity] = countQuestionsForLevel(
        roleTypes,
        maturity,
      );
    }
    behaviourStats[behaviourId].total = Object.values(
      behaviourStats[behaviourId],
    ).reduce((a, b) => a + b, 0);
  }

  return {
    totalQuestions: questions.length,
    bySource,
    byLevel,
    skillStats,
    behaviourStats,
  };
}

/**
 * Prepare questions view for rendering
 * @param {Object} params
 * @param {Object} params.questionBank
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {QuestionsFilter} params.filter
 * @returns {QuestionsView}
 */
export function prepareQuestionsView({
  questionBank,
  skills,
  behaviours,
  filter,
}) {
  const questions = flattenQuestions(questionBank, skills, behaviours, filter);
  const stats = calculateStats(questions, questionBank);

  return {
    filter,
    questions,
    stats,
  };
}
