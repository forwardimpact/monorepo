/**
 * Interview Question Generation Helpers
 *
 * Pure functions for question selection, priority calculation, and time
 * budget management. Extracted from interview.js for max-lines compliance.
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
  WEIGHT_CAPABILITY_DECOMP_DELIVERY,
  WEIGHT_CAPABILITY_DECOMP_SCALE,
  WEIGHT_CAPABILITY_DECOMP_RELIABILITY,
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
 * Get decomposition questions from the question bank for a specific capability and level
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
 * Derive capability levels from a job's skill matrix
 * @param {Object} job - The job definition
 * @returns {Map<string, {capabilityId: string, level: string, levelIndex: number}>}
 */
export function deriveCapabilityLevels(job) {
  const capabilityLevels = new Map();

  for (const skill of job.skillMatrix) {
    const capabilityId = skill.capability;
    const levelIndex = getSkillProficiencyIndex(skill.proficiency);

    const existing = capabilityLevels.get(capabilityId);
    if (!existing || levelIndex > existing.levelIndex) {
      capabilityLevels.set(capabilityId, {
        capabilityId,
        level: skill.proficiency,
        levelIndex,
      });
    }
  }

  return capabilityLevels;
}

/**
 * Calculate priority for a skill question
 * @param {Object} skill - The skill entry
 * @param {boolean} includeBelowLevel - Whether this is a below-level question
 * @returns {number} Priority score
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
  let priority = WEIGHT_BEHAVIOUR_BASE;
  priority +=
    getBehaviourMaturityIndex(behaviour.maturity) * WEIGHT_BEHAVIOUR_MATURITY;
  return priority;
}

/**
 * Calculate priority for a capability decomposition question
 * @param {string} capabilityId - The capability ID
 * @param {number} levelIndex - The skill proficiency index
 * @returns {number} Priority score
 */
export function calculateCapabilityPriority(capabilityId, levelIndex) {
  let priority = 0;

  if (capabilityId === Capability.DELIVERY) {
    priority += WEIGHT_CAPABILITY_DECOMP_DELIVERY;
  } else if (capabilityId === Capability.SCALE) {
    priority += WEIGHT_CAPABILITY_DECOMP_SCALE;
  } else if (capabilityId === Capability.RELIABILITY) {
    priority += WEIGHT_CAPABILITY_DECOMP_RELIABILITY;
  }

  priority += levelIndex * WEIGHT_SKILL_PROFICIENCY;

  return priority;
}

/**
 * Select a random question from an array (or first if deterministic)
 * @param {Array} questions - Array of questions
 * @param {boolean} deterministic - If true, always select first question
 * @returns {Object|null} Selected question or null
 */
export function selectQuestion(questions, deterministic = false) {
  if (!questions || questions.length === 0) {
    return null;
  }
  if (deterministic) {
    return questions[0];
  }
  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * Generate all potential skill questions with priority from a job's skill matrix
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.questionBank - The question bank
 * @param {string} params.roleType - Role type
 * @param {number} params.maxQuestionsPerSkill - Max questions per skill
 * @param {boolean} params.includeBelowLevel - Include below-level questions
 * @param {boolean} params.deterministic - Use deterministic selection
 * @returns {Array} All potential skill questions with priority
 */
export function generateSkillCandidates({
  job,
  questionBank,
  roleType,
  maxQuestionsPerSkill,
  includeBelowLevel,
  deterministic,
}) {
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
 * Generate all potential behaviour questions with priority
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.questionBank - The question bank
 * @param {string} params.roleType - Role type
 * @param {number} params.maxQuestionsPerBehaviour - Max questions per behaviour
 * @returns {Array} All potential behaviour questions with priority
 */
export function generateBehaviourCandidates({
  job,
  questionBank,
  roleType,
  maxQuestionsPerBehaviour,
}) {
  const allBehaviourQuestions = [];

  for (const behaviour of job.behaviourProfile) {
    const targetMaturity = behaviour.maturity;
    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      targetMaturity,
      roleType,
      targetMaturity,
    );
    let questionsAdded = 0;

    for (const question of questions) {
      if (questionsAdded >= maxQuestionsPerBehaviour) break;
      allBehaviourQuestions.push({
        question,
        targetId: behaviour.behaviourId,
        targetName: behaviour.behaviourName,
        targetType: "behaviour",
        targetLevel: targetMaturity,
        priority: calculateBehaviourPriority(behaviour),
      });
      questionsAdded++;
    }
  }

  return allBehaviourQuestions;
}

/**
 * Select questions within a time budget, prioritizing coverage diversity
 * First pass: one question per target (highest priority first)
 * Second pass: fill remaining time with additional questions
 * @param {Array} candidates - Sorted candidate questions (highest priority first)
 * @param {number} timeBudget - Time budget in minutes
 * @param {number} defaultMinutes - Default question duration
 * @returns {{selected: Array, coveredIds: Set, totalMinutes: number}}
 */
export function selectWithinBudget(candidates, timeBudget, defaultMinutes) {
  const selected = [];
  const coveredIds = new Set();
  let totalMinutes = 0;

  for (const q of candidates) {
    if (coveredIds.has(q.targetId)) continue;
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

  for (const q of candidates) {
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

  return { selected, coveredIds, totalMinutes };
}

/**
 * Calculate total expected duration for a set of questions
 * @param {Array} questions - Selected questions
 * @param {number} defaultMinutes - Default question duration
 * @returns {number} Total minutes
 */
export function calculateTotalDuration(questions, defaultMinutes) {
  return questions.reduce(
    (sum, q) => sum + (q.question.expectedDurationMinutes || defaultMinutes),
    0,
  );
}
