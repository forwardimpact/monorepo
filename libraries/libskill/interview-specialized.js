/**
 * Specialized Interview Question Generation
 *
 * Pure functions for generating specialized interview formats:
 * Mission Fit, Decomposition, and Stakeholder Simulation.
 * Extracted from interview.js for max-lines compliance.
 */

import {
  getSkillProficiencyIndex,
  SKILL_PROFICIENCY_ORDER,
} from "@forwardimpact/map/levels";

import {
  DEFAULT_INTERVIEW_QUESTION_MINUTES,
  DEFAULT_DECOMPOSITION_QUESTION_MINUTES,
  DEFAULT_SIMULATION_QUESTION_MINUTES,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
} from "./policies/thresholds.js";

import { compareByMaturityDesc } from "./policies/orderings.js";

import {
  getSkillQuestions,
  getBehaviourQuestions,
  getCapabilityQuestions,
  deriveCapabilityLevels,
  calculateSkillPriority,
  calculateBehaviourPriority,
  calculateCapabilityPriority,
  selectWithinBudget,
} from "./interview-helpers.js";

/**
 * Build candidate questions for mission fit interview
 * @param {Object} job - The job definition
 * @param {Object} questionBank - The question bank
 * @param {string} roleType - Role type
 * @returns {Array} Candidate questions
 */
function buildMissionFitCandidates(job, questionBank, roleType) {
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

    for (const question of targetQuestions) {
      allSkillQuestions.push({
        question,
        targetId: skill.skillId,
        targetName: skill.skillName,
        targetType: "skill",
        targetLevel,
        priority: calculateSkillPriority(skill, false),
      });
    }

    if (targetLevelIndex > 0) {
      const belowLevel = SKILL_PROFICIENCY_ORDER[targetLevelIndex - 1];
      const belowQuestions = getSkillQuestions(
        questionBank,
        skill.skillId,
        belowLevel,
        roleType,
      );

      for (const question of belowQuestions) {
        allSkillQuestions.push({
          question,
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
 * Build candidate questions for decomposition interview
 * @param {Object} job - The job definition
 * @param {Object} questionBank - The question bank
 * @param {string} roleType - Role type
 * @returns {Array} Candidate questions
 */
function buildDecompositionCandidates(job, questionBank, roleType) {
  const allCapabilityQuestions = [];
  const capabilityLevels = deriveCapabilityLevels(job);

  for (const [capabilityId, levelInfo] of capabilityLevels) {
    const { level, levelIndex } = levelInfo;

    const questions = getCapabilityQuestions(
      questionBank,
      capabilityId,
      level,
      roleType,
    );

    for (const question of questions) {
      allCapabilityQuestions.push({
        question,
        targetId: capabilityId,
        targetName: capabilityId,
        targetType: "capability",
        targetLevel: level,
        priority: calculateCapabilityPriority(capabilityId, levelIndex),
      });
    }

    if (levelIndex > 0) {
      const belowLevel = SKILL_PROFICIENCY_ORDER[levelIndex - 1];
      const belowQuestions = getCapabilityQuestions(
        questionBank,
        capabilityId,
        belowLevel,
        roleType,
      );

      for (const question of belowQuestions) {
        allCapabilityQuestions.push({
          question,
          targetId: capabilityId,
          targetName: capabilityId,
          targetType: "capability",
          targetLevel: belowLevel,
          priority: calculateCapabilityPriority(capabilityId, levelIndex - 1),
        });
      }
    }
  }

  return allCapabilityQuestions;
}

/**
 * Derive Mission Fit interview questions (skill-focused)
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=45] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveMissionFitInterview({
  job,
  questionBank,
  targetMinutes = 45,
  roleType = "professionalQuestions",
}) {
  const allSkillQuestions = buildMissionFitCandidates(
    job,
    questionBank,
    roleType,
  );

  allSkillQuestions.sort((a, b) => b.priority - a.priority);

  const result = selectWithinBudget(
    allSkillQuestions,
    targetMinutes,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  result.selected.sort((a, b) => b.priority - a.priority);

  return {
    job,
    questions: result.selected,
    expectedDurationMinutes: result.totalMinutes,
    coverage: {
      skills: Array.from(result.coveredIds),
      behaviours: [],
      capabilities: [],
    },
  };
}

/**
 * Derive Decomposition interview questions (capability-focused)
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=60] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveDecompositionInterview({
  job,
  questionBank,
  targetMinutes = 60,
  roleType = "professionalQuestions",
}) {
  const allCapabilityQuestions = buildDecompositionCandidates(
    job,
    questionBank,
    roleType,
  );

  allCapabilityQuestions.sort((a, b) => b.priority - a.priority);

  const result = selectWithinBudget(
    allCapabilityQuestions,
    targetMinutes,
    DEFAULT_DECOMPOSITION_QUESTION_MINUTES,
  );

  result.selected.sort((a, b) => b.priority - a.priority);

  return {
    job,
    questions: result.selected,
    expectedDurationMinutes: result.totalMinutes,
    coverage: {
      skills: [],
      behaviours: [],
      capabilities: Array.from(result.coveredIds),
    },
  };
}

/**
 * Derive Stakeholder Simulation interview questions (behaviour-focused)
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=60] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveStakeholderInterview({
  job,
  questionBank,
  targetMinutes = 60,
  roleType = "professionalQuestions",
}) {
  const coveredBehaviours = new Set();

  const sortedBehaviours = [...job.behaviourProfile].sort(
    compareByMaturityDesc,
  );

  const selectedQuestions = [];
  let totalMinutes = 0;

  for (const behaviour of sortedBehaviours) {
    const targetMaturity = behaviour.maturity;

    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      targetMaturity,
      roleType,
    );

    const question = questions[0];
    if (!question) continue;

    const questionTime =
      question.expectedDurationMinutes || DEFAULT_SIMULATION_QUESTION_MINUTES;
    if (
      totalMinutes + questionTime >
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    )
      break;

    selectedQuestions.push({
      question,
      targetId: behaviour.behaviourId,
      targetName: behaviour.behaviourName,
      targetType: "behaviour",
      targetLevel: targetMaturity,
      priority: calculateBehaviourPriority(behaviour),
    });
    coveredBehaviours.add(behaviour.behaviourId);
    totalMinutes += questionTime;
  }

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes: totalMinutes,
    coverage: {
      skills: [],
      behaviours: Array.from(coveredBehaviours),
      capabilities: [],
    },
  };
}
