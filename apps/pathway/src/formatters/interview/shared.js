/**
 * Interview presentation helpers
 *
 * Shared utilities for formatting interview data across DOM and markdown outputs.
 */

import {
  isValidJobCombination,
  generateJobTitle,
  getDisciplineSkillIds,
} from "@forwardimpact/libpathway/derivation";
import {
  deriveMissionFitInterview,
  deriveDecompositionInterview,
  deriveStakeholderInterview,
} from "@forwardimpact/libpathway/interview";
import { getOrCreateJob } from "@forwardimpact/libpathway/job-cache";

/**
 * Interview type configurations
 */
export const INTERVIEW_TYPES = {
  mission: {
    id: "mission",
    name: "Mission Fit",
    description:
      "Assess technical skills and alignment with role expectations. Focus on depth of knowledge, problem-solving approach, and ability to articulate technical decisions.",
    icon: "🎯",
    expectedDurationMinutes: 45,
    panel: "Recruiting Manager + 1 Senior Engineer",
    questionTypes: ["skill"],
  },
  decomposition: {
    id: "decomposition",
    name: "Decomposition",
    description:
      "Evaluate how candidates break down ambiguous problems into actionable components. Inspired by Palantir's technique—focus on structured thinking, trade-off analysis, and communication under uncertainty.",
    icon: "🧩",
    expectedDurationMinutes: 60,
    panel: "2 Senior Engineers",
    questionTypes: ["capability"],
  },
  stakeholder: {
    id: "stakeholder",
    name: "Stakeholder Simulation",
    description:
      "Simulate real-world stakeholder interactions through behaviour-focused assessment. Focus on communication style, influence, and ability to navigate competing priorities.",
    icon: "👥",
    expectedDurationMinutes: 60,
    panel: "3-4 Stakeholders",
    questionTypes: ["behaviour"],
  },
};

/**
 * Transform raw interview questions into sections
 * @param {Array} questions - Raw questions from interview module
 * @returns {Array}
 */
function groupQuestionsIntoSections(questions) {
  const sections = {};

  for (const q of questions) {
    const id = q.targetId;
    const name = q.targetName;
    const type = q.targetType;
    const level = q.targetLevel;

    if (!sections[id]) {
      sections[id] = {
        id,
        name,
        type,
        level,
        questions: [],
      };
    }

    const questionEntry = {
      skillOrBehaviourId: id,
      skillOrBehaviourName: name,
      type,
      level,
      question: q.question.text,
      followUps: q.question.followUps || [],
      lookingFor: q.question.lookingFor || [],
    };

    if (q.question.decompositionPrompts) {
      questionEntry.decompositionPrompts = q.question.decompositionPrompts;
    }
    if (q.question.simulationPrompts) {
      questionEntry.simulationPrompts = q.question.simulationPrompts;
    }
    if (q.question.context) {
      questionEntry.context = q.question.context;
    }

    sections[id].questions.push(questionEntry);
  }

  return Object.values(sections);
}

/**
 * @typedef {Object} InterviewDetailView
 * @property {string} title
 * @property {string} interviewType - 'mission', 'decomposition', or 'stakeholder'
 * @property {string} disciplineId
 * @property {string} disciplineName
 * @property {string} gradeId
 * @property {string} trackId
 * @property {string} trackName
 * @property {Array} sections
 * @property {number} totalQuestions
 * @property {number} expectedDurationMinutes
 * @property {Object} typeInfo
 */

/**
 * Prepare interview questions for a job
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} params.questions
 * @param {string} [params.interviewType='mission']
 * @returns {InterviewDetailView|null}
 */
export function prepareInterviewDetail({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  questions,
  interviewType = "mission",
}) {
  if (!discipline || !grade) return null;

  const job = getOrCreateJob({
    discipline,
    grade,
    track,
    skills,
    behaviours,
  });

  if (!job) return null;

  let interviewGuide;
  switch (interviewType) {
    case "mission":
      interviewGuide = deriveMissionFitInterview({
        job,
        questionBank: questions,
      });
      break;
    case "decomposition":
      interviewGuide = deriveDecompositionInterview({
        job,
        questionBank: questions,
      });
      break;
    case "stakeholder":
      interviewGuide = deriveStakeholderInterview({
        job,
        questionBank: questions,
      });
      break;
    default:
      interviewGuide = deriveMissionFitInterview({
        job,
        questionBank: questions,
      });
      break;
  }

  // Extract the questions array from the interview guide
  const rawQuestions = interviewGuide.questions || [];

  // Separate questions by type
  const skillQuestions = rawQuestions.filter((q) => q.targetType === "skill");
  const behaviourQuestions = rawQuestions.filter(
    (q) => q.targetType === "behaviour",
  );
  const capabilityQuestions = rawQuestions.filter(
    (q) => q.targetType === "capability",
  );

  const skillSections = groupQuestionsIntoSections(skillQuestions);
  const behaviourSections = groupQuestionsIntoSections(behaviourQuestions);
  const capabilitySections = groupQuestionsIntoSections(capabilityQuestions);

  const allSections = [
    ...skillSections,
    ...behaviourSections,
    ...capabilitySections,
  ];
  const totalQuestions = rawQuestions.length;

  const typeConfig = INTERVIEW_TYPES[interviewType] || INTERVIEW_TYPES.mission;

  return {
    title: job.title,
    interviewType,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    sections: allSections,
    totalQuestions,
    expectedDurationMinutes: typeConfig.expectedDurationMinutes,
    typeInfo: typeConfig,
  };
}

/**
 * @typedef {Object} InterviewBuilderPreview
 * @property {boolean} isValid
 * @property {string|null} title
 * @property {number} totalSkills
 * @property {number} totalBehaviours
 * @property {string|null} invalidReason
 */

/**
 * Prepare interview builder preview for form validation
 * @param {Object} params
 * @param {Object|null} params.discipline
 * @param {Object|null} params.grade
 * @param {Object|null} params.track
 * @param {number} params.behaviourCount - Total behaviours in the system
 * @param {Array} [params.grades] - All grades for validation
 * @returns {InterviewBuilderPreview}
 */
export function prepareInterviewBuilderPreview({
  discipline,
  grade,
  track,
  behaviourCount,
  grades,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !grade) {
    return {
      isValid: false,
      title: null,
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: null,
    };
  }

  const validCombination = isValidJobCombination({
    discipline,
    grade,
    track,
    grades,
  });

  if (!validCombination) {
    const reason = track
      ? `The ${track.name} track is not available for ${discipline.specialization}.`
      : `${discipline.specialization} requires a track specialization.`;
    return {
      isValid: false,
      title: null,
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: reason,
    };
  }

  const title = generateJobTitle(discipline, grade, track);
  const totalSkills = getDisciplineSkillIds(discipline).length;

  return {
    isValid: true,
    title: `Interview for: ${title}`,
    totalSkills,
    totalBehaviours: behaviourCount,
    invalidReason: null,
  };
}

/**
 * @typedef {Object} AllInterviewsView
 * @property {string} title
 * @property {string} disciplineId
 * @property {string} disciplineName
 * @property {string} gradeId
 * @property {string} trackId
 * @property {string} trackName
 * @property {Object.<string, Object>} interviews - Keyed by type
 */

/**
 * Prepare all interview types for a job (for toggle UI)
 * @param {Object} params
 * @param {Object} params.discipline
 * @param {Object} params.grade
 * @param {Object} params.track
 * @param {Array} params.skills
 * @param {Array} params.behaviours
 * @param {Array} params.questions
 * @returns {AllInterviewsView|null}
 */
export function prepareAllInterviews({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  questions,
}) {
  // Track is optional (null = generalist)
  if (!discipline || !grade) return null;

  const job = getOrCreateJob({
    discipline,
    grade,
    track,
    skills,
    behaviours,
  });

  if (!job) return null;

  // Generate all interview types
  const missionInterview = deriveMissionFitInterview({
    job,
    questionBank: questions,
  });

  const decompositionInterview = deriveDecompositionInterview({
    job,
    questionBank: questions,
  });

  const stakeholderInterview = deriveStakeholderInterview({
    job,
    questionBank: questions,
  });

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    trackId: track?.id || null,
    trackName: track?.name || null,
    interviews: {
      mission: {
        ...missionInterview,
        type: "mission",
        typeInfo: INTERVIEW_TYPES.mission,
      },
      decomposition: {
        ...decompositionInterview,
        type: "decomposition",
        typeInfo: INTERVIEW_TYPES.decomposition,
      },
      stakeholder: {
        ...stakeholderInterview,
        type: "stakeholder",
        typeInfo: INTERVIEW_TYPES.stakeholder,
      },
    },
  };
}
