/**
 * Job Description Formatter
 *
 * Formats job data into markdown job description content.
 * Parallels formatters/agent/profile.js in structure.
 *
 * Uses Mustache templates for flexible output formatting.
 * Templates are loaded from data/ directory with fallback to templates/ directory.
 */

import Mustache from "mustache";

import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "@forwardimpact/schema/levels";
import { trimValue, trimFields } from "../shared.js";

/**
 * Prepare job data for template rendering
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} [params.track] - The track (optional)
 * @returns {Object} Data object ready for Mustache template
 */
function prepareJobDescriptionData({ job, discipline, grade, track }) {
  // Build role summary from discipline - use manager version if applicable
  const isManagement = discipline.isManagement === true;
  let roleSummary =
    isManagement && discipline.managementRoleSummary
      ? discipline.managementRoleSummary
      : discipline.professionalRoleSummary || discipline.description;
  // Replace placeholders
  const { roleTitle, specialization } = discipline;
  roleSummary = roleSummary.replace(/\{roleTitle\}/g, roleTitle);
  roleSummary = roleSummary.replace(/\{specialization\}/g, specialization);

  // Build expectations paragraph
  let expectationsParagraph = "";
  if (job.expectations) {
    const exp = job.expectations;
    const expectationSentences = [];

    if (exp.impactScope) {
      expectationSentences.push(
        `This role encompasses ${exp.impactScope.toLowerCase()}.`,
      );
    }
    if (exp.autonomyExpectation) {
      let autonomySentence = `You will ${exp.autonomyExpectation.toLowerCase()}`;
      if (exp.influenceScope) {
        autonomySentence +=
          `, ${exp.influenceScope.toLowerCase()}` +
          (exp.influenceScope.endsWith(".") ? "" : ".");
      } else {
        autonomySentence += exp.autonomyExpectation.endsWith(".") ? "" : ".";
      }
      expectationSentences.push(autonomySentence);
    } else if (exp.influenceScope) {
      expectationSentences.push(
        exp.influenceScope + (exp.influenceScope.endsWith(".") ? "" : "."),
      );
    }
    if (exp.complexityHandled) {
      expectationSentences.push(
        `You will handle ${exp.complexityHandled.toLowerCase()}.`,
      );
    }

    if (expectationSentences.length > 0) {
      expectationsParagraph = expectationSentences.join(" ");
    }
  }

  // Sort behaviours by maturity level (highest first)
  const sortedBehaviours = [...job.behaviourProfile].sort((a, b) => {
    const indexA = BEHAVIOUR_MATURITY_ORDER.indexOf(a.maturity);
    const indexB = BEHAVIOUR_MATURITY_ORDER.indexOf(b.maturity);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexB - indexA;
  });

  // Group skills by level
  const skillsByLevel = {};
  for (const skill of job.skillMatrix) {
    const level = skill.level || "Other";
    if (!skillsByLevel[level]) {
      skillsByLevel[level] = [];
    }
    skillsByLevel[level].push(skill);
  }

  // Sort levels in reverse order (expert first, awareness last)
  const sortedLevels = Object.keys(skillsByLevel).sort((a, b) => {
    const indexA = SKILL_LEVEL_ORDER.indexOf(a.toLowerCase());
    const indexB = SKILL_LEVEL_ORDER.indexOf(b.toLowerCase());
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexB - indexA;
  });

  // Keep only the top 2 skill levels for job descriptions
  const topLevels = sortedLevels.slice(0, 2);

  // Build skill levels array for template
  const skillLevels = topLevels.map((level) => {
    const skills = skillsByLevel[level];
    const sortedSkills = [...skills].sort((a, b) =>
      (a.skillName || "").localeCompare(b.skillName || ""),
    );
    return {
      levelHeading: `${level.toUpperCase()}-LEVEL SKILLS`,
      skills: sortedSkills.map((s) => ({
        skillName: s.skillName,
        levelDescription: s.levelDescription || "",
      })),
    };
  });

  // Build qualification summary with placeholder replacement
  const qualificationSummary =
    (grade.qualificationSummary || "").replace(
      /\{typicalExperienceRange\}/g,
      grade.typicalExperienceRange || "",
    ) || null;

  const responsibilities = trimFields(job.derivedResponsibilities, {
    responsibility: "required",
  });
  const behaviours = trimFields(sortedBehaviours, {
    maturityDescription: "optional",
  });
  const trimmedTrackRoleContext = trimValue(track?.roleContext);
  const trimmedExpectationsParagraph = trimValue(expectationsParagraph);
  const trimmedQualificationSummary = trimValue(qualificationSummary);

  return {
    title: job.title,
    gradeId: grade.id,
    typicalExperienceRange: grade.typicalExperienceRange,
    trackName: track?.name || null,
    hasTrack: !!track,
    roleSummary: trimValue(roleSummary),
    trackRoleContext: trimmedTrackRoleContext,
    hasTrackRoleContext: !!trimmedTrackRoleContext,
    expectationsParagraph: trimmedExpectationsParagraph,
    hasExpectationsParagraph: !!trimmedExpectationsParagraph,
    responsibilities,
    hasResponsibilities: responsibilities.length > 0,
    behaviours,
    hasBehaviours: behaviours.length > 0,
    skillLevels: skillLevels.map((level) => ({
      ...level,
      skills: trimFields(level.skills, { levelDescription: "optional" }),
    })),
    hasSkillLevels: skillLevels.length > 0,
    qualificationSummary: trimmedQualificationSummary,
    hasQualificationSummary: !!trimmedQualificationSummary,
  };
}

/**
 * Format job as a markdown job description using Mustache template
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} [params.track] - The track (optional)
 * @param {string} template - Mustache template string
 * @returns {string} Markdown formatted job description
 */
export function formatJobDescription(
  { job, discipline, grade, track },
  template,
) {
  const data = prepareJobDescriptionData({ job, discipline, grade, track });
  return Mustache.render(template, data);
}
