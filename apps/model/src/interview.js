/**
 * Engineering Pathway Interview Question Generation
 *
 * This module provides pure functions for generating interview questions
 * based on job definitions and question banks.
 */

import {
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
  SKILL_LEVEL_ORDER,
  Capability,
} from "@forwardimpact/schema/levels";

/**
 * Default question time estimate if not specified
 */
const DEFAULT_QUESTION_MINUTES = 5;

/**
 * Get questions from the question bank for a specific skill and level
 * @param {import('./levels.js').QuestionBank} questionBank - The question bank
 * @param {string} skillId - The skill ID
 * @param {string} level - The skill level
 * @returns {import('./levels.js').Question[]} Array of questions
 */
function getSkillQuestions(questionBank, skillId, level) {
  return questionBank.skillLevels?.[skillId]?.[level] || [];
}

/**
 * Get questions from the question bank for a specific behaviour and maturity
 * @param {import('./levels.js').QuestionBank} questionBank - The question bank
 * @param {string} behaviourId - The behaviour ID
 * @param {string} maturity - The maturity level
 * @returns {import('./levels.js').Question[]} Array of questions
 */
function getBehaviourQuestions(questionBank, behaviourId, maturity) {
  return questionBank.behaviourMaturities?.[behaviourId]?.[maturity] || [];
}

/**
 * Calculate priority for a skill question
 * @param {import('./levels.js').SkillMatrixEntry} skill - The skill entry
 * @param {boolean} includeBelowLevel - Whether this is a below-level question
 * @returns {number} Priority score (higher = more important)
 */
function calculateSkillPriority(skill, includeBelowLevel = false) {
  let priority = 0;

  // Primary skills are highest priority
  if (skill.type === "primary") {
    priority += 30;
  } else if (skill.type === "secondary") {
    priority += 20;
  } else {
    priority += 10;
  }

  // AI skills get a boost for "AI-era focus"
  if (skill.capability === Capability.AI) {
    priority += 15;
  }

  // Delivery skills are core technical skills
  if (skill.capability === Capability.DELIVERY) {
    priority += 5;
  }

  // Higher skill level = higher priority
  priority += getSkillLevelIndex(skill.level) * 2;

  // Below-level questions have lower priority
  if (includeBelowLevel) {
    priority -= 5;
  }

  return priority;
}

/**
 * Calculate priority for a behaviour question
 * @param {import('./levels.js').BehaviourProfileEntry} behaviour - The behaviour entry
 * @returns {number} Priority score (higher = more important)
 */
function calculateBehaviourPriority(behaviour) {
  let priority = 15;

  // Higher maturity level = higher priority
  priority += getBehaviourMaturityIndex(behaviour.maturity) * 3;

  return priority;
}

/**
 * Select a random question from an array (or first if deterministic)
 * @param {import('./levels.js').Question[]} questions - Array of questions
 * @param {boolean} deterministic - If true, always select first question
 * @returns {import('./levels.js').Question|null} Selected question or null
 */
function selectQuestion(questions, deterministic = false) {
  if (!questions || questions.length === 0) {
    return null;
  }
  if (deterministic) {
    return questions[0];
  }
  return questions[Math.floor(Math.random() * questions.length)];
}

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
 * @param {number} [params.options.skillBehaviourRatio=0.6] - Ratio of time for skills vs behaviours (0.6 = 60% skills, 40% behaviours)
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveInterviewQuestions({ job, questionBank, options = {} }) {
  const {
    includeBelowLevel = true,
    deterministic = false,
    maxQuestionsPerSkill = 2,
    maxQuestionsPerBehaviour = 2,
    targetMinutes = 60,
    skillBehaviourRatio = 0.6,
  } = options;

  const allSkillQuestions = [];
  const allBehaviourQuestions = [];
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  // Generate all potential skill questions with priority
  for (const skill of job.skillMatrix) {
    const targetLevel = skill.level;
    const targetLevelIndex = getSkillLevelIndex(targetLevel);

    // Get questions at target level
    const targetQuestions = getSkillQuestions(
      questionBank,
      skill.skillId,
      targetLevel,
    );
    let questionsAdded = 0;

    // Add question(s) at target level
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

    // Optionally add question from level below
    if (
      includeBelowLevel &&
      targetLevelIndex > 0 &&
      questionsAdded < maxQuestionsPerSkill
    ) {
      const belowLevel = SKILL_LEVEL_ORDER[targetLevelIndex - 1];
      const belowQuestions = getSkillQuestions(
        questionBank,
        skill.skillId,
        belowLevel,
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

  // Generate all potential behaviour questions with priority
  for (const behaviour of job.behaviourProfile) {
    const targetMaturity = behaviour.maturity;
    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
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

  // Sort both lists by priority (highest first)
  allSkillQuestions.sort((a, b) => b.priority - a.priority);
  allBehaviourQuestions.sort((a, b) => b.priority - a.priority);

  // Calculate time budgets
  const skillTimeBudget = targetMinutes * skillBehaviourRatio;
  const behaviourTimeBudget = targetMinutes * (1 - skillBehaviourRatio);

  // Select skill questions within budget, prioritizing coverage diversity
  // First pass: one question per skill (highest priority first)
  const selectedQuestions = [];
  const selectedSkillIds = new Set();
  let skillMinutes = 0;

  for (const q of allSkillQuestions) {
    if (selectedSkillIds.has(q.targetId)) continue; // Skip if we already have this skill
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES;
    if (skillMinutes + questionTime <= skillTimeBudget + 5) {
      selectedQuestions.push(q);
      selectedSkillIds.add(q.targetId);
      coveredSkills.add(q.targetId);
      skillMinutes += questionTime;
    }
  }

  // Second pass: add more questions if time allows
  for (const q of allSkillQuestions) {
    if (selectedQuestions.includes(q)) continue; // Skip already selected
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES;
    if (skillMinutes + questionTime <= skillTimeBudget + 5) {
      selectedQuestions.push(q);
      coveredSkills.add(q.targetId);
      skillMinutes += questionTime;
    }
  }

  // Select behaviour questions within budget, prioritizing coverage diversity
  // First pass: one question per behaviour (highest priority first)
  const selectedBehaviourIds = new Set();
  let behaviourMinutes = 0;

  for (const q of allBehaviourQuestions) {
    if (selectedBehaviourIds.has(q.targetId)) continue; // Skip if we already have this behaviour
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES;
    if (behaviourMinutes + questionTime <= behaviourTimeBudget + 5) {
      selectedQuestions.push(q);
      selectedBehaviourIds.add(q.targetId);
      coveredBehaviours.add(q.targetId);
      behaviourMinutes += questionTime;
    }
  }

  // Second pass: add more behaviour questions if time allows
  for (const q of allBehaviourQuestions) {
    if (selectedQuestions.includes(q)) continue; // Skip already selected
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES;
    if (behaviourMinutes + questionTime <= behaviourTimeBudget + 5) {
      selectedQuestions.push(q);
      coveredBehaviours.add(q.targetId);
      behaviourMinutes += questionTime;
    }
  }

  // Re-sort selected questions by priority
  selectedQuestions.sort((a, b) => b.priority - a.priority);

  // Calculate total time
  const expectedDurationMinutes = selectedQuestions.reduce(
    (sum, q) =>
      sum + (q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES),
    0,
  );

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes,
    coverage: {
      skills: Array.from(coveredSkills),
      behaviours: Array.from(coveredBehaviours),
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
  // First get all potential questions with priority
  const fullInterview = deriveInterviewQuestions({
    job,
    questionBank,
    options: {
      includeBelowLevel: false, // Skip below-level for short interviews
      maxQuestionsPerSkill: 1,
      maxQuestionsPerBehaviour: 1,
    },
  });

  // Select questions until we hit the time budget
  const selectedQuestions = [];
  let totalMinutes = 0;
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  // Ensure we have at least some skill and behaviour coverage
  // by alternating between skill and behaviour questions
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
    let nextQuestion = null;

    if (preferSkill && skillIndex < skillQuestions.length) {
      nextQuestion = skillQuestions[skillIndex++];
    } else if (!preferSkill && behaviourIndex < behaviourQuestions.length) {
      nextQuestion = behaviourQuestions[behaviourIndex++];
    } else if (skillIndex < skillQuestions.length) {
      nextQuestion = skillQuestions[skillIndex++];
    } else if (behaviourIndex < behaviourQuestions.length) {
      nextQuestion = behaviourQuestions[behaviourIndex++];
    } else {
      break; // No more questions
    }

    const questionTime =
      nextQuestion.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES;

    // Don't exceed budget by too much
    if (totalMinutes + questionTime > targetMinutes + 5) {
      break;
    }

    selectedQuestions.push(nextQuestion);
    totalMinutes += questionTime;

    if (nextQuestion.targetType === "skill") {
      coveredSkills.add(nextQuestion.targetId);
    } else {
      coveredBehaviours.add(nextQuestion.targetId);
    }

    preferSkill = !preferSkill;
  }

  // Re-sort selected questions by priority
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
 * Derive behaviour-focused interview questions
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveBehaviourQuestions({ job, questionBank }) {
  const interviewQuestions = [];
  const coveredBehaviours = new Set();

  // Focus only on behaviours, with more depth
  for (const behaviour of job.behaviourProfile) {
    const targetMaturity = behaviour.maturity;

    // Get questions at target maturity
    const targetQuestions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      targetMaturity,
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

  // Sort by priority
  interviewQuestions.sort((a, b) => b.priority - a.priority);

  // Calculate total time
  const expectedDurationMinutes = interviewQuestions.reduce(
    (sum, q) =>
      sum + (q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES),
    0,
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
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveFocusedInterview({
  job,
  questionBank,
  focusSkills = [],
  focusBehaviours = [],
}) {
  const interviewQuestions = [];
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  // Focus skills
  const focusSkillSet = new Set(focusSkills);
  for (const skill of job.skillMatrix) {
    if (!focusSkillSet.has(skill.skillId)) continue;

    const questions = getSkillQuestions(
      questionBank,
      skill.skillId,
      skill.level,
    );
    for (const question of questions) {
      interviewQuestions.push({
        question,
        targetId: skill.skillId,
        targetName: skill.skillName,
        targetType: "skill",
        targetLevel: skill.level,
        priority: calculateSkillPriority(skill) + 10, // Boost for focus
      });
      coveredSkills.add(skill.skillId);
    }
  }

  // Focus behaviours
  const focusBehaviourSet = new Set(focusBehaviours);
  for (const behaviour of job.behaviourProfile) {
    if (!focusBehaviourSet.has(behaviour.behaviourId)) continue;

    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      behaviour.maturity,
    );
    for (const question of questions) {
      interviewQuestions.push({
        question,
        targetId: behaviour.behaviourId,
        targetName: behaviour.behaviourName,
        targetType: "behaviour",
        targetLevel: behaviour.maturity,
        priority: calculateBehaviourPriority(behaviour) + 10, // Boost for focus
      });
      coveredBehaviours.add(behaviour.behaviourId);
    }
  }

  // Sort by priority
  interviewQuestions.sort((a, b) => b.priority - a.priority);

  const expectedDurationMinutes = interviewQuestions.reduce(
    (sum, q) =>
      sum + (q.question.expectedDurationMinutes || DEFAULT_QUESTION_MINUTES),
    0,
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
