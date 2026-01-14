/**
 * Interview presentation helpers
 *
 * Shared utilities for formatting interview data across DOM and markdown outputs.
 */

import {
  isValidJobCombination,
  generateJobTitle,
  getDisciplineSkillIds,
} from "../../model/derivation.js";
import {
  deriveInterviewQuestions,
  deriveShortInterview,
  deriveBehaviourQuestions,
} from "../../model/interview.js";
import { getOrCreateJob } from "../../lib/job-cache.js";

/**
 * Interview type configurations
 */
export const INTERVIEW_TYPES = {
  short: {
    id: "short",
    name: "Screening",
    description: "20-minute screening interview",
    icon: "⏱️",
    expectedDurationMinutes: 20,
  },
  behaviour: {
    id: "behaviour",
    name: "Behavioural",
    description: "Focus on behaviours and mindsets",
    icon: "🧠",
    expectedDurationMinutes: 45,
  },
  full: {
    id: "full",
    name: "Full Interview",
    description: "Comprehensive interview covering all skills and behaviours",
    icon: "📋",
    expectedDurationMinutes: 90,
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

    sections[id].questions.push({
      skillOrBehaviourId: id,
      skillOrBehaviourName: name,
      type,
      level,
      question: q.question.text,
      followUps: q.question.followUps || [],
    });
  }

  return Object.values(sections);
}

/**
 * @typedef {Object} InterviewDetailView
 * @property {string} title
 * @property {string} interviewType - 'full', 'short', or 'behaviour'
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
 * @param {string} [params.interviewType='full']
 * @returns {InterviewDetailView|null}
 */
export function prepareInterviewDetail({
  discipline,
  grade,
  track,
  skills,
  behaviours,
  questions,
  interviewType = "full",
}) {
  if (!discipline || !grade || !track) return null;

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
    case "short":
      interviewGuide = deriveShortInterview({ job, questionBank: questions });
      break;
    case "behaviour":
      interviewGuide = deriveBehaviourQuestions({
        job,
        questionBank: questions,
      });
      break;
    case "full":
    default:
      interviewGuide = deriveInterviewQuestions({
        job,
        questionBank: questions,
      });
      break;
  }

  // Extract the questions array from the interview guide
  const rawQuestions = interviewGuide.questions || [];

  // Separate skill and behaviour questions based on targetType
  const skillQuestions = rawQuestions.filter((q) => q.targetType === "skill");
  const behaviourQuestions = rawQuestions.filter(
    (q) => q.targetType === "behaviour",
  );

  const skillSections = groupQuestionsIntoSections(skillQuestions);
  const behaviourSections = groupQuestionsIntoSections(behaviourQuestions);

  const allSections = [...skillSections, ...behaviourSections];
  const totalQuestions = rawQuestions.length;

  const typeConfig = INTERVIEW_TYPES[interviewType] || INTERVIEW_TYPES.full;

  return {
    title: job.title,
    interviewType,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    trackId: track.id,
    trackName: track.name,
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
  if (!discipline || !grade || !track) {
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
    return {
      isValid: false,
      title: null,
      totalSkills: 0,
      totalBehaviours: 0,
      invalidReason: `The ${track.name} track is not available for ${discipline.specialization}.`,
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
  if (!discipline || !grade || !track) return null;

  const job = getOrCreateJob({
    discipline,
    grade,
    track,
    skills,
    behaviours,
  });

  if (!job) return null;

  // Generate all interview types
  const shortInterview = deriveShortInterview({
    job,
    questionBank: questions,
    targetMinutes: 20,
  });

  const behaviourInterview = deriveBehaviourQuestions({
    job,
    questionBank: questions,
  });

  const fullInterview = deriveInterviewQuestions({
    job,
    questionBank: questions,
    options: {
      targetMinutes: 60,
      skillBehaviourRatio: 0.6,
    },
  });

  return {
    title: job.title,
    disciplineId: discipline.id,
    disciplineName: discipline.specialization || discipline.name,
    gradeId: grade.id,
    trackId: track.id,
    trackName: track.name,
    interviews: {
      short: {
        ...shortInterview,
        type: "short",
        typeInfo: INTERVIEW_TYPES.short,
      },
      behaviour: {
        ...behaviourInterview,
        type: "behaviour",
        typeInfo: INTERVIEW_TYPES.behaviour,
      },
      full: { ...fullInterview, type: "full", typeInfo: INTERVIEW_TYPES.full },
    },
  };
}
