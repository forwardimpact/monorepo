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

import { BEHAVIOUR_MATURITY_ORDER } from "@forwardimpact/map/levels";
import { trimValue, trimFields } from "../shared.js";

/**
 * Prepare job data for template rendering
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} [params.track] - The track (optional)
 * @returns {Object} Data object ready for Mustache template
 */
function prepareJobDescriptionData({ job, discipline, level, track }) {
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

  // Build capability skill sections at the highest skill proficiency
  let capabilitySkills = [];
  const derivedResponsibilities = job.derivedResponsibilities || [];
  if (derivedResponsibilities.length > 0) {
    // derivedResponsibilities is sorted: highest proficiency first, then by skill count
    const highestProficiency = derivedResponsibilities[0].proficiency;

    // Filter responsibilities to only the highest proficiency
    const topResponsibilities = derivedResponsibilities.filter(
      (r) => r.proficiency === highestProficiency,
    );

    // Group skill matrix entries by capability at the highest level
    const skillsByCapability = {};
    for (const skill of job.skillMatrix) {
      if (skill.proficiency !== highestProficiency) continue;
      if (!skillsByCapability[skill.capability]) {
        skillsByCapability[skill.capability] = [];
      }
      skillsByCapability[skill.capability].push(skill);
    }

    // Build capability sections in skill count order
    capabilitySkills = topResponsibilities
      .filter((r) => skillsByCapability[r.capability]?.length > 0)
      .map((r) => {
        const skills = [...skillsByCapability[r.capability]].sort((a, b) =>
          (a.skillName || "").localeCompare(b.skillName || ""),
        );
        return {
          capabilityHeading: r.capabilityName.toUpperCase(),
          responsibilityDescription: r.responsibility,
          skills: skills.map((s) => ({
            skillName: s.skillName,
            proficiencyDescription: s.proficiencyDescription || "",
          })),
        };
      });
  }

  // Build qualification summary with placeholder replacement
  const qualificationSummary =
    (level.qualificationSummary || "").replace(
      /\{typicalExperienceRange\}/g,
      level.typicalExperienceRange || "",
    ) || null;

  const behaviours = trimFields(sortedBehaviours, {
    maturityDescription: "optional",
  });
  const trimmedTrackRoleContext = trimValue(track?.roleContext);
  const trimmedExpectationsParagraph = trimValue(expectationsParagraph);
  const trimmedQualificationSummary = trimValue(qualificationSummary);

  return {
    title: job.title,
    levelId: level.id,
    typicalExperienceRange: level.typicalExperienceRange,
    trackName: track?.name || null,
    hasTrack: !!track,
    roleSummary: trimValue(roleSummary),
    trackRoleContext: trimmedTrackRoleContext,
    hasTrackRoleContext: !!trimmedTrackRoleContext,
    expectationsParagraph: trimmedExpectationsParagraph,
    hasExpectationsParagraph: !!trimmedExpectationsParagraph,
    behaviours,
    hasBehaviours: behaviours.length > 0,
    capabilitySkills: capabilitySkills.map((cap) => ({
      ...cap,
      responsibilityDescription: trimValue(cap.responsibilityDescription),
      skills: trimFields(cap.skills, { proficiencyDescription: "optional" }),
    })),
    hasCapabilitySkills: capabilitySkills.length > 0,
    qualificationSummary: trimmedQualificationSummary,
    hasQualificationSummary: !!trimmedQualificationSummary,
  };
}

/**
 * Format job as a markdown job description using Mustache template
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} [params.track] - The track (optional)
 * @param {string} template - Mustache template string
 * @returns {string} Markdown formatted job description
 */
export function formatJobDescription(
  { job, discipline, level, track },
  template,
) {
  const data = prepareJobDescriptionData({ job, discipline, level, track });
  return Mustache.render(template, data);
}
