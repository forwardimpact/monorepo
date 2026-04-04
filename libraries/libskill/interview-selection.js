/**
 * Interview Question Selection Helpers
 *
 * Pure functions for selecting and budgeting interview questions.
 * Extracted from interview.js to satisfy max-lines and complexity rules.
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
  SKILL_PROFICIENCY_ORDER,
  Capability,
} from "@forwardimpact/map/levels";

import {
  WEIGHT_SKILL_TYPE,
  WEIGHT_CAPABILITY_BOOST,
  WEIGHT_BEHAVIOUR_BASE,
  WEIGHT_BEHAVIOUR_MATURITY,
  WEIGHT_SKILL_PROFICIENCY,
  WEIGHT_BELOW_LEVEL_PENALTY,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
} from "./policies/thresholds.js";

/**
 * Get questions from the question bank for a specific skill and level
 * @param {Object} questionBank - The question bank
 * @param {string} skillId - The skill ID
 * @param {string} level - The skill proficiency
 * @param {string} [roleType='professionalQuestions'] - Role type
 * @returns {Array} Array of questions
 */
export function getSkillQuestions(
  questionBank,
  skillId,
  level,
  roleType = "professionalQuestions",
) {
  return questionBank.skillProficiencies?.[skillId]?.[roleType]?.[level] || [];
}

/**
 * Get questions from the question bank for a specific behaviour and maturity
 * @param {Object} questionBank - The question bank
 * @param {string} behaviourId - The behaviour ID
 * @param {string} maturity - The maturity level
 * @param {string} [roleType='professionalQuestions'] - Role type
 * @returns {Array} Array of questions
 */
export function getBehaviourQuestions(
  questionBank,
  behaviourId,
  maturity,
  roleType = "professionalQuestions",
) {
  return (
    questionBank.behaviourMaturities?.[behaviourId]?.[roleType]?.[maturity] ||
    []
  );
}

/**
 * Get decomposition questions from the question bank for a capability
 * @param {Object} questionBank - The question bank
 * @param {string} capabilityId - The capability ID
 * @param {string} level - The skill proficiency
 * @param {string} [roleType='professionalQuestions'] - Role type
 * @returns {Array} Array of questions
 */
export function getCapabilityQuestions(
  questionBank,
  capabilityId,
  level,
  roleType = "professionalQuestions",
) {
  return (
    questionBank.capabilityLevels?.[capabilityId]?.[roleType]?.[level] || []
  );
}

/**
 * Calculate priority for a skill question
 * @param {Object} skill - The skill entry
 * @param {boolean} includeBelowLevel - Whether this is a below-level question
 * @returns {number} Priority score (higher = more important)
 */
export function calculateSkillPriority(skill, includeBelowLevel = false) {
  let priority = 0;
  priority += WEIGHT_SKILL_TYPE[skill.type] || WEIGHT_SKILL_TYPE.broad;
  if (skill.capability === Capability.AI) {
    priority += WEIGHT_CAPABILITY_BOOST.ai;
  }
  if (skill.capability === Capability.DELIVERY) {
    priority += WEIGHT_CAPABILITY_BOOST.delivery;
  }
  priority +=
    getSkillProficiencyIndex(skill.proficiency) * WEIGHT_SKILL_PROFICIENCY;
  if (includeBelowLevel) {
    priority += WEIGHT_BELOW_LEVEL_PENALTY;
  }
  return priority;
}

/**
 * Calculate priority for a behaviour question
 * @param {Object} behaviour - The behaviour entry
 * @returns {number} Priority score
 */
export function calculateBehaviourPriority(behaviour) {
  return (
    WEIGHT_BEHAVIOUR_BASE +
    getBehaviourMaturityIndex(behaviour.maturity) * WEIGHT_BEHAVIOUR_MATURITY
  );
}

/**
 * Select questions within a time budget, prioritizing coverage diversity
 * First pass: one question per target (highest priority first)
 * Second pass: fill remaining budget with additional questions
 * @param {Array} allQuestions - All candidate questions sorted by priority
 * @param {number} timeBudget - Time budget in minutes
 * @param {number} defaultMinutes - Default question duration
 * @returns {{selected: Array, totalMinutes: number, coveredIds: Set<string>}}
 */
export function selectWithinBudget(allQuestions, timeBudget, defaultMinutes) {
  const selected = [];
  const selectedIds = new Set();
  const coveredIds = new Set();
  let totalMinutes = 0;

  for (const q of allQuestions) {
    if (selectedIds.has(q.targetId)) continue;
    const questionTime = q.question.expectedDurationMinutes || defaultMinutes;
    if (
      totalMinutes + questionTime <=
      timeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selected.push(q);
      selectedIds.add(q.targetId);
      coveredIds.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  for (const q of allQuestions) {
    if (selected.includes(q)) continue;
    const questionTime = q.question.expectedDurationMinutes || defaultMinutes;
    if (
      totalMinutes + questionTime <=
      timeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selected.push(q);
      coveredIds.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  return { selected, totalMinutes, coveredIds };
}

/**
 * Generate all potential skill questions for a job with priorities
 * @param {Object} job - The job definition
 * @param {Object} questionBank - The question bank
 * @param {Object} options - Generation options
 * @param {boolean} options.includeBelowLevel - Include below-level questions
 * @param {boolean} options.deterministic - Deterministic selection
 * @param {number} options.maxQuestionsPerSkill - Max questions per skill
 * @param {string} options.roleType - Role type
 * @returns {Array} All skill questions with priority
 */
export function generateSkillCandidates(job, questionBank, options) {
  const { includeBelowLevel, deterministic, maxQuestionsPerSkill, roleType } =
    options;
  const allSkillQuestions = [];

  for (const skill of job.skillMatrix) {
    const targetLevel = skill.proficiency;
    const targetLevelIndex = getSkillProficiencyIndex(targetLevel);

    const targetQuestions = getSkillQuestions(
      questionBank,
      skill.skillId,
      targetLevel,
      roleType,
    );
    let questionsAdded = 0;

    for (const question of targetQuestions) {
      if (questionsAdded >= maxQuestionsPerSkill) break;
      allSkillQuestions.push({
        question,
        targetId: skill.skillId,
        targetName: skill.skillName,
        targetType: "skill",
        targetLevel,
        priority: calculateSkillPriority(skill, false),
      });
      questionsAdded++;
    }

    if (
      includeBelowLevel &&
      targetLevelIndex > 0 &&
      questionsAdded < maxQuestionsPerSkill
    ) {
      const belowLevel = SKILL_PROFICIENCY_ORDER[targetLevelIndex - 1];
      const belowQuestions = getSkillQuestions(
        questionBank,
        skill.skillId,
        belowLevel,
        roleType,
      );
      const belowQuestion = selectQuestion(belowQuestions, deterministic);
      if (belowQuestion) {
        allSkillQuestions.push({
          question: belowQuestion,
          targetId: skill.skillId,
          targetName: skill.skillName,
          targetType: "skill",
          targetLevel: belowLevel,
          priority: calculateSkillPriority(skill, true),
        });
      }
    }
  }

  return allSkillQuestions;
}

/**
 * Select a random question from an array (or first if deterministic)
 * @param {Array} questions - Array of questions
 * @param {boolean} deterministic - If true, always select first question
 * @returns {Object|null} Selected question or null
 */
export function selectQuestion(questions, deterministic = false) {
  if (!questions || questions.length === 0) return null;
  if (deterministic) return questions[0];
  return questions[Math.floor(Math.random() * questions.length)];
}
