/**
 * Job Description Formatter
 *
 * This formatter turns job data into markdown job-description content.
 * Its structure parallels formatters/agent/profile.js.
 *
 * Mustache templates keep the output format flexible.
 * Templates come from the data/ directory. The fallback is the templates/
 * directory.
 */

import Mustache from "mustache";

import { BEHAVIOUR_MATURITY_ORDER } from "@forwardimpact/libskill/levels";
import { trimValue, trimFields } from "../shared.js";

/**
 * Make sure a string ends with a period
 * @param {string} str
 * @returns {string}
 */
function ensurePeriod(str) {
  return str.endsWith(".") ? str : `${str}.`;
}

/**
 * Build the autonomy + influence sentence
 * @param {Object} exp - Expectations object
 * @returns {string|null}
 */
function buildAutonomySentence(exp) {
  if (exp.autonomyExpectation) {
    const base = `You will ${exp.autonomyExpectation.toLowerCase()}`;
    if (exp.influenceScope) {
      return ensurePeriod(`${base}, ${exp.influenceScope.toLowerCase()}`);
    }
    return ensurePeriod(base);
  }
  if (exp.influenceScope) {
    return ensurePeriod(exp.influenceScope);
  }
  return null;
}

/**
 * Build the expectations paragraph from the job expectations
 * @param {Object|undefined} expectations
 * @returns {string}
 */
function buildExpectationsParagraph(expectations) {
  if (!expectations) return "";
  const exp = expectations;
  const sentences = [];

  if (exp.impactScope) {
    sentences.push(`This role encompasses ${exp.impactScope.toLowerCase()}.`);
  }
  const autonomy = buildAutonomySentence(exp);
  if (autonomy) {
    sentences.push(autonomy);
  }
  if (exp.complexityHandled) {
    sentences.push(`You will handle ${exp.complexityHandled.toLowerCase()}.`);
  }
  return sentences.length > 0 ? sentences.join(" ") : "";
}

/**
 * Build capability skill sections at the job's top proficiency level(s).
 *
 * Each derived responsibility sits at its capability's own highest
 * proficiency. This function sorts the list by descending proficiency.
 * Individual-contributor jobs show only the single highest proficiency.
 * Management jobs concentrate fewer skills at the very top. So one level
 * leaves their descriptions sparse. They include the top two proficiency
 * levels instead.
 * @param {Object} job
 * @param {Object} [options]
 * @param {boolean} [options.isManagement] - Whether the role is a management role
 * @returns {Array}
 */
function buildCapabilitySkills(job, { isManagement = false } = {}) {
  const derivedResponsibilities = job.derivedResponsibilities || [];
  if (derivedResponsibilities.length === 0) return [];

  // Collect the top N distinct proficiency levels present in the job.
  const levelsToShow = isManagement ? 2 : 1;
  const allowedProficiencies = new Set();
  for (const r of derivedResponsibilities) {
    if (!allowedProficiencies.has(r.proficiency)) {
      if (allowedProficiencies.size >= levelsToShow) break;
      allowedProficiencies.add(r.proficiency);
    }
  }

  const topResponsibilities = derivedResponsibilities.filter((r) =>
    allowedProficiencies.has(r.proficiency),
  );

  // Each capability lists the skills at its own responsibility proficiency.
  // So a capability shown at the second level keeps its second-level skills.
  const proficiencyByCapability = new Map(
    topResponsibilities.map((r) => [r.capability, r.proficiency]),
  );
  const skillsByCapability = {};
  for (const skill of job.skillMatrix) {
    if (proficiencyByCapability.get(skill.capability) !== skill.proficiency) {
      continue;
    }
    if (!skillsByCapability[skill.capability]) {
      skillsByCapability[skill.capability] = [];
    }
    skillsByCapability[skill.capability].push(skill);
  }

  return topResponsibilities
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

/**
 * Prepare job data so the template can render it
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} [params.track] - The track (optional)
 * @returns {Object} Data object ready for Mustache template
 */
function prepareJobDescriptionData({ job, discipline, level, track }) {
  // Build the role summary from the discipline
  const { roleTitle, specialization } = discipline;
  let roleSummary = discipline.roleSummary || discipline.description;
  roleSummary = roleSummary.replace(/\{roleTitle\}/g, roleTitle);
  roleSummary = roleSummary.replace(/\{specialization\}/g, specialization);

  const expectationsParagraph = buildExpectationsParagraph(job.expectations);

  // Sort behaviours by maturity level (highest first)
  const sortedBehaviours = [...job.behaviourProfile].sort((a, b) => {
    const indexA = BEHAVIOUR_MATURITY_ORDER.indexOf(a.maturity);
    const indexB = BEHAVIOUR_MATURITY_ORDER.indexOf(b.maturity);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexB - indexA;
  });

  const capabilitySkills = buildCapabilitySkills(job, {
    isManagement: !!discipline?.isManagement,
  });

  // Build the qualification summary. Replace the placeholders.
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
 * Format a job as a markdown job description with a Mustache template
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.level - The level
 * @param {Object} [params.track] - The track (optional)
 * @param {string} template - Mustache template string
 * @returns {string} Markdown-formatted job description
 */
export function formatJobDescription(
  { job, discipline, level, track },
  template,
) {
  const data = prepareJobDescriptionData({ job, discipline, level, track });
  return Mustache.render(template, data);
}
