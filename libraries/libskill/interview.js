/**
 * Engineering Pathway Interview Question Generation
 *
 * This module provides pure functions for generating interview questions
 * based on job definitions and question banks.
 */

import {
  RATIO_SKILL_BEHAVIOUR,
  DEFAULT_INTERVIEW_QUESTION_MINUTES,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
  WEIGHT_FOCUS_BOOST,
} from "./policies/thresholds.js";

import {
  getSkillQuestions,
  getBehaviourQuestions,
  calculateSkillPriority,
  calculateBehaviourPriority,
  generateSkillCandidates,
  generateBehaviourCandidates,
  selectWithinBudget,
  calculateTotalDuration,
} from "./interview-helpers.js";

/**
 * Derive interview questions for a job
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {Object} [params.options] - Generation options
 * @param {boolean} [params.options.includeBelowLevel=true] - Include one question from level below
 * @param {boolean} [params.options.deterministic=false] - Use deterministic selection
 * @param {number} [params.options.maxQuestionsPerSkill=2] - Max questions per skill
 * @param {number} [params.options.maxQuestionsPerBehaviour=2] - Max questions per behaviour
 * @param {number} [params.options.targetMinutes=60] - Target interview length in minutes
 * @param {number} [params.options.skillBehaviourRatio=RATIO_SKILL_BEHAVIOUR] - Ratio of time for skills vs behaviours
 * @param {string} [params.options.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveInterviewQuestions({ job, questionBank, options = {} }) {
  const {
    includeBelowLevel = true,
    deterministic = false,
    maxQuestionsPerSkill = 2,
    maxQuestionsPerBehaviour = 2,
    targetMinutes = 60,
    skillBehaviourRatio = RATIO_SKILL_BEHAVIOUR,
    roleType = "professionalQuestions",
  } = options;

  const allSkillQuestions = generateSkillCandidates({
    job,
    questionBank,
    roleType,
    maxQuestionsPerSkill,
    includeBelowLevel,
    deterministic,
  });

  const allBehaviourQuestions = generateBehaviourCandidates({
    job,
    questionBank,
    roleType,
    maxQuestionsPerBehaviour,
  });

  allSkillQuestions.sort((a, b) => b.priority - a.priority);
  allBehaviourQuestions.sort((a, b) => b.priority - a.priority);

  const skillTimeBudget = targetMinutes * skillBehaviourRatio;
  const behaviourTimeBudget = targetMinutes * (1 - skillBehaviourRatio);

  const skillResult = selectWithinBudget(
    allSkillQuestions,
    skillTimeBudget,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  const behaviourResult = selectWithinBudget(
    allBehaviourQuestions,
    behaviourTimeBudget,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  const selectedQuestions = [
    ...skillResult.selected,
    ...behaviourResult.selected,
  ];
  selectedQuestions.sort((a, b) => b.priority - a.priority);

  const expectedDurationMinutes = calculateTotalDuration(
    selectedQuestions,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes,
    coverage: {
      skills: Array.from(skillResult.coveredIds),
      behaviours: Array.from(behaviourResult.coveredIds),
    },
  };
}

/**
 * Derive a short/screening interview within a time budget
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=20] - Target interview length in minutes
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveShortInterview({
  job,
  questionBank,
  targetMinutes = 20,
}) {
  const fullInterview = deriveInterviewQuestions({
    job,
    questionBank,
    options: {
      includeBelowLevel: false,
      maxQuestionsPerSkill: 1,
      maxQuestionsPerBehaviour: 1,
    },
  });

  const selectedQuestions = [];
  let totalMinutes = 0;
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  const skillQuestions = fullInterview.questions.filter(
    (q) => q.targetType === "skill",
  );
  const behaviourQuestions = fullInterview.questions.filter(
    (q) => q.targetType === "behaviour",
  );

  let skillIndex = 0;
  let behaviourIndex = 0;
  let preferSkill = true;

  while (totalMinutes < targetMinutes) {
    const nextQuestion = pickNextAlternating(
      skillQuestions,
      behaviourQuestions,
      skillIndex,
      behaviourIndex,
      preferSkill,
    );

    if (!nextQuestion) break;

    if (nextQuestion.source === "skill") skillIndex++;
    else behaviourIndex++;

    const questionTime =
      nextQuestion.item.question.expectedDurationMinutes ||
      DEFAULT_INTERVIEW_QUESTION_MINUTES;

    if (
      totalMinutes + questionTime >
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      break;
    }

    selectedQuestions.push(nextQuestion.item);
    totalMinutes += questionTime;

    if (nextQuestion.item.targetType === "skill") {
      coveredSkills.add(nextQuestion.item.targetId);
    } else {
      coveredBehaviours.add(nextQuestion.item.targetId);
    }

    preferSkill = !preferSkill;
  }

  selectedQuestions.sort((a, b) => b.priority - a.priority);

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes: totalMinutes,
    coverage: {
      skills: Array.from(coveredSkills),
      behaviours: Array.from(coveredBehaviours),
    },
  };
}

/**
 * Pick the next question alternating between skill and behaviour lists
 * @param {Array} skillQuestions
 * @param {Array} behaviourQuestions
 * @param {number} skillIdx
 * @param {number} behaviourIdx
 * @param {boolean} preferSkill
 * @returns {{item: Object, source: string}|null}
 */
function pickNextAlternating(
  skillQuestions,
  behaviourQuestions,
  skillIdx,
  behaviourIdx,
  preferSkill,
) {
  if (preferSkill && skillIdx < skillQuestions.length) {
    return { item: skillQuestions[skillIdx], source: "skill" };
  }
  if (!preferSkill && behaviourIdx < behaviourQuestions.length) {
    return { item: behaviourQuestions[behaviourIdx], source: "behaviour" };
  }
  if (skillIdx < skillQuestions.length) {
    return { item: skillQuestions[skillIdx], source: "skill" };
  }
  if (behaviourIdx < behaviourQuestions.length) {
    return { item: behaviourQuestions[behaviourIdx], source: "behaviour" };
  }
  return null;
}

/**
 * Derive behaviour-focused interview questions
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {string} [params.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveBehaviourQuestions({
  job,
  questionBank,
  roleType = "professionalQuestions",
}) {
  const interviewQuestions = [];
  const coveredBehaviours = new Set();

  for (const behaviour of job.behaviourProfile) {
    const targetMaturity = behaviour.maturity;
    const targetQuestions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      targetMaturity,
      roleType,
    );

    for (const question of targetQuestions) {
      interviewQuestions.push({
        question,
        targetId: behaviour.behaviourId,
        targetName: behaviour.behaviourName,
        targetType: "behaviour",
        targetLevel: targetMaturity,
        priority: calculateBehaviourPriority(behaviour),
      });
      coveredBehaviours.add(behaviour.behaviourId);
    }
  }

  interviewQuestions.sort((a, b) => b.priority - a.priority);

  const expectedDurationMinutes = calculateTotalDuration(
    interviewQuestions,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  return {
    job,
    questions: interviewQuestions,
    expectedDurationMinutes,
    coverage: {
      skills: [],
      behaviours: Array.from(coveredBehaviours),
    },
  };
}

/**
 * Generate a focused interview for specific skills/behaviours
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {string[]} [params.focusSkills] - Skill IDs to focus on
 * @param {string[]} [params.focusBehaviours] - Behaviour IDs to focus on
 * @param {string} [params.roleType='professionalQuestions'] - Role type
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveFocusedInterview({
  job,
  questionBank,
  focusSkills = [],
  focusBehaviours = [],
  roleType = "professionalQuestions",
}) {
  const interviewQuestions = [];
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  const focusSkillSet = new Set(focusSkills);
  for (const skill of job.skillMatrix) {
    if (!focusSkillSet.has(skill.skillId)) continue;

    const questions = getSkillQuestions(
      questionBank,
      skill.skillId,
      skill.proficiency,
      roleType,
    );
    for (const question of questions) {
      interviewQuestions.push({
        question,
        targetId: skill.skillId,
        targetName: skill.skillName,
        targetType: "skill",
        targetLevel: skill.proficiency,
        priority: calculateSkillPriority(skill) + WEIGHT_FOCUS_BOOST,
      });
      coveredSkills.add(skill.skillId);
    }
  }

  const focusBehaviourSet = new Set(focusBehaviours);
  for (const behaviour of job.behaviourProfile) {
    if (!focusBehaviourSet.has(behaviour.behaviourId)) continue;

    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      behaviour.maturity,
      roleType,
    );
    for (const question of questions) {
      interviewQuestions.push({
        question,
        targetId: behaviour.behaviourId,
        targetName: behaviour.behaviourName,
        targetType: "behaviour",
        targetLevel: behaviour.maturity,
        priority: calculateBehaviourPriority(behaviour) + WEIGHT_FOCUS_BOOST,
      });
      coveredBehaviours.add(behaviour.behaviourId);
    }
  }

  interviewQuestions.sort((a, b) => b.priority - a.priority);

  const expectedDurationMinutes = calculateTotalDuration(
    interviewQuestions,
    DEFAULT_INTERVIEW_QUESTION_MINUTES,
  );

  return {
    job,
    questions: interviewQuestions,
    expectedDurationMinutes,
    coverage: {
      skills: Array.from(coveredSkills),
      behaviours: Array.from(coveredBehaviours),
    },
  };
}

export {
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "./interview-specialized.js";
