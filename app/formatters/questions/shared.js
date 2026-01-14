/**
 * Questions presentation helpers
 *
 * Shared utilities for formatting question data across output formats.
 */

/**
 * Skill levels in order
 */
export const SKILL_LEVELS = [
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
 * @property {string|null} level - Skill level filter
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
 * @property {string} level - Skill level or behaviour maturity
 * @property {string} id - Question ID
 * @property {string} text - Question text
 * @property {string[]} lookingFor - Expected answer indicators
 * @property {number} expectedDurationMinutes - Time estimate
 * @property {string[]} [followUps] - Follow-up questions
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
 * Flatten all questions from question bank
 * @param {Object} questionBank
 * @param {Array} skills
 * @param {Array} behaviours
 * @param {QuestionsFilter} filter
 * @returns {FlattenedQuestion[]}
 */
export function flattenQuestions(questionBank, skills, behaviours, filter) {
  const questions = [];

  // Process skill questions
  for (const [skillId, levels] of Object.entries(
    questionBank.skillLevels || {},
  )) {
    const skillName = getSkillName(skillId, skills);
    const capability = getSkillCapability(skillId, skills);

    // Filter by skill IDs
    if (filter.skills && !filter.skills.includes(skillId)) continue;

    // Skip skills if filtering by specific behaviours
    if (filter.behaviours) continue;

    // Filter by capability
    if (filter.capability && capability !== filter.capability) continue;

    for (const [level, levelQuestions] of Object.entries(levels)) {
      // Filter by level
      if (filter.level && level !== filter.level) continue;

      // Skip if filtering by maturity (behaviour-only filter)
      if (filter.maturity) continue;

      for (const q of levelQuestions) {
        questions.push({
          source: skillId,
          sourceName: skillName,
          sourceType: "skill",
          level,
          id: q.id,
          text: q.text,
          lookingFor: q.lookingFor || [],
          expectedDurationMinutes: q.expectedDurationMinutes || 5,
          followUps: q.followUps || [],
        });
      }
    }
  }

  // Process behaviour questions
  for (const [behaviourId, maturities] of Object.entries(
    questionBank.behaviourMaturities || {},
  )) {
    const behaviourName = getBehaviourName(behaviourId, behaviours);

    // Filter by behaviour IDs
    if (filter.behaviours && !filter.behaviours.includes(behaviourId)) continue;

    // Skip behaviours if filtering by capability (skill-only filter)
    if (filter.capability) continue;

    // Skip behaviours if filtering by specific skills
    if (filter.skills) continue;

    for (const [maturity, maturityQuestions] of Object.entries(maturities)) {
      // Filter by maturity
      if (filter.maturity && maturity !== filter.maturity) continue;

      // Skip if filtering by level (skill-only filter)
      if (filter.level) continue;

      for (const q of maturityQuestions) {
        questions.push({
          source: behaviourId,
          sourceName: behaviourName,
          sourceType: "behaviour",
          level: maturity,
          id: q.id,
          text: q.text,
          lookingFor: q.lookingFor || [],
          expectedDurationMinutes: q.expectedDurationMinutes || 5,
          followUps: q.followUps || [],
        });
      }
    }
  }

  return questions;
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
  for (const [skillId, levels] of Object.entries(
    questionBank.skillLevels || {},
  )) {
    skillStats[skillId] = {};
    for (const level of SKILL_LEVELS) {
      skillStats[skillId][level] = (levels[level] || []).length;
    }
    skillStats[skillId].total = Object.values(skillStats[skillId]).reduce(
      (a, b) => a + b,
      0,
    );
  }

  const behaviourStats = {};
  for (const [behaviourId, maturities] of Object.entries(
    questionBank.behaviourMaturities || {},
  )) {
    behaviourStats[behaviourId] = {};
    for (const maturity of BEHAVIOUR_MATURITIES) {
      behaviourStats[behaviourId][maturity] = (
        maturities[maturity] || []
      ).length;
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
