/**
 * Engineering Pathway Interview Question Generation
 *
 * This module provides pure functions for generating interview questions
 * based on job definitions and question banks.
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
  RATIO_SKILL_BEHAVIOUR,
  DEFAULT_INTERVIEW_QUESTION_MINUTES,
  DEFAULT_DECOMPOSITION_QUESTION_MINUTES,
  DEFAULT_SIMULATION_QUESTION_MINUTES,
  TOLERANCE_INTERVIEW_BUDGET_MINUTES,
  WEIGHT_CAPABILITY_DECOMP_DELIVERY,
  WEIGHT_CAPABILITY_DECOMP_SCALE,
  WEIGHT_CAPABILITY_DECOMP_RELIABILITY,
  WEIGHT_FOCUS_BOOST,
} from "./policies/thresholds.js";

import { compareByMaturityDesc } from "./policies/orderings.js";

/**
 * Get questions from the question bank for a specific skill and level
 * @param {import('./levels.js').QuestionBank} questionBank - The question bank
 * @param {string} skillId - The skill ID
 * @param {string} level - The skill proficiency
 * @param {string} [roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').Question[]} Array of questions
 */
function getSkillQuestions(
  questionBank,
  skillId,
  level,
  roleType = "professionalQuestions",
) {
  return questionBank.skillProficiencies?.[skillId]?.[roleType]?.[level] || [];
}

/**
 * Get questions from the question bank for a specific behaviour and maturity
 * @param {import('./levels.js').QuestionBank} questionBank - The question bank
 * @param {string} behaviourId - The behaviour ID
 * @param {string} maturity - The maturity level
 * @param {string} [roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').Question[]} Array of questions
 */
function getBehaviourQuestions(
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
 * @param {import('./levels.js').QuestionBank} questionBank - The question bank
 * @param {string} capabilityId - The capability ID
 * @param {string} level - The skill proficiency (capabilities use same levels as skills)
 * @param {string} [roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').Question[]} Array of questions
 */
function getCapabilityQuestions(
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
 * Uses the maximum skill proficiency in each capability.
 * @param {import('./levels.js').JobDefinition} job - The job definition
 * @returns {Map<string, {capabilityId: string, level: string, levelIndex: number}>} Map of capability to level info
 */
function deriveCapabilityLevels(job) {
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
 * @param {import('./levels.js').SkillMatrixEntry} skill - The skill entry
 * @param {boolean} includeBelowLevel - Whether this is a below-level question
 * @returns {number} Priority score (higher = more important)
 */
function calculateSkillPriority(skill, includeBelowLevel = false) {
  let priority = 0;

  // Skill type priority from policy weights
  priority += WEIGHT_SKILL_TYPE[skill.type] || WEIGHT_SKILL_TYPE.broad;

  // AI skills get a boost for "AI-era focus"
  if (skill.capability === Capability.AI) {
    priority += WEIGHT_CAPABILITY_BOOST.ai;
  }

  // Delivery skills get a core technical boost
  if (skill.capability === Capability.DELIVERY) {
    priority += WEIGHT_CAPABILITY_BOOST.delivery;
  }

  // Higher skill proficiency = higher priority
  priority +=
    getSkillProficiencyIndex(skill.proficiency) * WEIGHT_SKILL_PROFICIENCY;

  // Below-level questions have lower priority
  if (includeBelowLevel) {
    priority += WEIGHT_BELOW_LEVEL_PENALTY;
  }

  return priority;
}

/**
 * Calculate priority for a behaviour question
 * @param {import('./levels.js').BehaviourProfileEntry} behaviour - The behaviour entry
 * @returns {number} Priority score (higher = more important)
 */
function calculateBehaviourPriority(behaviour) {
  let priority = WEIGHT_BEHAVIOUR_BASE;

  // Higher maturity level = higher priority
  priority +=
    getBehaviourMaturityIndex(behaviour.maturity) * WEIGHT_BEHAVIOUR_MATURITY;

  return priority;
}

/**
 * Calculate priority for a capability decomposition question
 * @param {string} capabilityId - The capability ID
 * @param {number} levelIndex - The skill proficiency index
 * @returns {number} Priority score (higher = more important)
 */
function calculateCapabilityPriority(capabilityId, levelIndex) {
  let priority = 0;

  // Delivery and scale capabilities are typically more important for decomposition
  if (capabilityId === Capability.DELIVERY) {
    priority += WEIGHT_CAPABILITY_DECOMP_DELIVERY;
  } else if (capabilityId === Capability.SCALE) {
    priority += WEIGHT_CAPABILITY_DECOMP_SCALE;
  } else if (capabilityId === Capability.RELIABILITY) {
    priority += WEIGHT_CAPABILITY_DECOMP_RELIABILITY;
  }

  // Higher level = higher priority
  priority += levelIndex * WEIGHT_SKILL_PROFICIENCY;

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
 * @param {number} [params.options.skillBehaviourRatio=RATIO_SKILL_BEHAVIOUR] - Ratio of time for skills vs behaviours
 * @param {string} [params.options.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
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

  const allSkillQuestions = [];
  const allBehaviourQuestions = [];
  const coveredSkills = new Set();
  const coveredBehaviours = new Set();

  // Generate all potential skill questions with priority
  for (const skill of job.skillMatrix) {
    const targetLevel = skill.proficiency;
    const targetLevelIndex = getSkillProficiencyIndex(targetLevel);

    // Get questions at target level
    const targetQuestions = getSkillQuestions(
      questionBank,
      skill.skillId,
      targetLevel,
      roleType,
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

  // Generate all potential behaviour questions with priority
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
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      skillMinutes + questionTime <=
      skillTimeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
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
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      skillMinutes + questionTime <=
      skillTimeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
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
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      behaviourMinutes + questionTime <=
      behaviourTimeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
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
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      behaviourMinutes + questionTime <=
      behaviourTimeBudget + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
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
      sum +
      (q.question.expectedDurationMinutes ||
        DEFAULT_INTERVIEW_QUESTION_MINUTES),
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
      nextQuestion.question.expectedDurationMinutes ||
      DEFAULT_INTERVIEW_QUESTION_MINUTES;

    // Don't exceed budget by too much
    if (
      totalMinutes + questionTime >
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
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
 * @param {string} [params.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveBehaviourQuestions({
  job,
  questionBank,
  roleType = "professionalQuestions",
}) {
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

  // Sort by priority
  interviewQuestions.sort((a, b) => b.priority - a.priority);

  // Calculate total time
  const expectedDurationMinutes = interviewQuestions.reduce(
    (sum, q) =>
      sum +
      (q.question.expectedDurationMinutes ||
        DEFAULT_INTERVIEW_QUESTION_MINUTES),
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
 * @param {string} [params.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
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

  // Focus skills
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

  // Focus behaviours
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

  // Sort by priority
  interviewQuestions.sort((a, b) => b.priority - a.priority);

  const expectedDurationMinutes = interviewQuestions.reduce(
    (sum, q) =>
      sum +
      (q.question.expectedDurationMinutes ||
        DEFAULT_INTERVIEW_QUESTION_MINUTES),
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

/**
 * Derive Mission Fit interview questions (skill-focused)
 *
 * 45-minute interview with Recruiting Manager + 1 Senior Engineer
 * Focuses on skill questions to assess technical capability and fit.
 *
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=45] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveMissionFitInterview({
  job,
  questionBank,
  targetMinutes = 45,
  roleType = "professionalQuestions",
}) {
  const allSkillQuestions = [];
  const coveredSkills = new Set();

  // Generate all potential skill questions with priority
  for (const skill of job.skillMatrix) {
    const targetLevel = skill.proficiency;
    const targetLevelIndex = getSkillProficiencyIndex(targetLevel);

    // Get questions at target level
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

    // Also add question from level below for depth
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

  // Sort by priority (highest first)
  allSkillQuestions.sort((a, b) => b.priority - a.priority);

  // Select questions within budget, prioritizing coverage diversity
  const selectedQuestions = [];
  const selectedSkillIds = new Set();
  let totalMinutes = 0;

  // First pass: one question per skill (highest priority first)
  for (const q of allSkillQuestions) {
    if (selectedSkillIds.has(q.targetId)) continue;
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      totalMinutes + questionTime <=
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selectedQuestions.push(q);
      selectedSkillIds.add(q.targetId);
      coveredSkills.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  // Second pass: add more questions if time allows
  for (const q of allSkillQuestions) {
    if (selectedQuestions.includes(q)) continue;
    const questionTime =
      q.question.expectedDurationMinutes || DEFAULT_INTERVIEW_QUESTION_MINUTES;
    if (
      totalMinutes + questionTime <=
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selectedQuestions.push(q);
      coveredSkills.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  // Re-sort by priority
  selectedQuestions.sort((a, b) => b.priority - a.priority);

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes: totalMinutes,
    coverage: {
      skills: Array.from(coveredSkills),
      behaviours: [],
      capabilities: [],
    },
  };
}

/**
 * Derive Decomposition interview questions (capability-focused)
 *
 * 60-minute interview with 2 Senior Engineers
 * Focuses on capability decomposition questions inspired by Palantir's technique.
 * Capabilities are selected based on the job's skill matrix.
 *
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=60] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveDecompositionInterview({
  job,
  questionBank,
  targetMinutes = 60,
  roleType = "professionalQuestions",
}) {
  const allCapabilityQuestions = [];
  const coveredCapabilities = new Set();

  // Derive capability levels from the job's skill matrix
  const capabilityLevels = deriveCapabilityLevels(job);

  // Generate capability questions based on derived levels
  for (const [capabilityId, levelInfo] of capabilityLevels) {
    const { level, levelIndex } = levelInfo;

    // Get questions at the derived level
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
        targetName: capabilityId, // Capability name can be enhanced if needed
        targetType: "capability",
        targetLevel: level,
        priority: calculateCapabilityPriority(capabilityId, levelIndex),
      });
    }

    // Also try level below if available
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

  // Sort by priority (highest first)
  allCapabilityQuestions.sort((a, b) => b.priority - a.priority);

  // Select questions within budget, prioritizing coverage diversity
  const selectedQuestions = [];
  const selectedCapabilityIds = new Set();
  let totalMinutes = 0;

  // First pass: one question per capability (highest priority first)
  for (const q of allCapabilityQuestions) {
    if (selectedCapabilityIds.has(q.targetId)) continue;
    const questionTime =
      q.question.expectedDurationMinutes ||
      DEFAULT_DECOMPOSITION_QUESTION_MINUTES;
    if (
      totalMinutes + questionTime <=
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selectedQuestions.push(q);
      selectedCapabilityIds.add(q.targetId);
      coveredCapabilities.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  // Second pass: add more questions if time allows
  for (const q of allCapabilityQuestions) {
    if (selectedQuestions.includes(q)) continue;
    const questionTime =
      q.question.expectedDurationMinutes ||
      DEFAULT_DECOMPOSITION_QUESTION_MINUTES;
    if (
      totalMinutes + questionTime <=
      targetMinutes + TOLERANCE_INTERVIEW_BUDGET_MINUTES
    ) {
      selectedQuestions.push(q);
      coveredCapabilities.add(q.targetId);
      totalMinutes += questionTime;
    }
  }

  // Re-sort by priority
  selectedQuestions.sort((a, b) => b.priority - a.priority);

  return {
    job,
    questions: selectedQuestions,
    expectedDurationMinutes: totalMinutes,
    coverage: {
      skills: [],
      behaviours: [],
      capabilities: Array.from(coveredCapabilities),
    },
  };
}

/**
 * Derive Stakeholder Simulation interview questions (behaviour-focused)
 *
 * 60-minute interview with 3-4 stakeholders.
 * Selects the highest-maturity behaviours for the role and picks one chunky
 * simulation question per behaviour. For most jobs this means 2-3 behaviours
 * with ~20-minute simulation scenarios each.
 *
 * @param {Object} params
 * @param {import('./levels.js').JobDefinition} params.job - The job definition
 * @param {import('./levels.js').QuestionBank} params.questionBank - The question bank
 * @param {number} [params.targetMinutes=60] - Target interview length in minutes
 * @param {string} [params.roleType='professionalQuestions'] - Role type ('professionalQuestions' or 'managementQuestions')
 * @returns {import('./levels.js').InterviewGuide}
 */
export function deriveStakeholderInterview({
  job,
  questionBank,
  targetMinutes = 60,
  roleType = "professionalQuestions",
}) {
  const coveredBehaviours = new Set();

  // Sort behaviours by maturity (highest first) to prioritize the most emphasized
  const sortedBehaviours = [...job.behaviourProfile].sort(
    compareByMaturityDesc,
  );

  // Select one question per behaviour, highest maturity first, within budget
  const selectedQuestions = [];
  let totalMinutes = 0;

  for (const behaviour of sortedBehaviours) {
    const targetMaturity = behaviour.maturity;

    // Get questions at target maturity
    const questions = getBehaviourQuestions(
      questionBank,
      behaviour.behaviourId,
      targetMaturity,
      roleType,
    );

    // Pick the first available question (1 per behaviour)
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
