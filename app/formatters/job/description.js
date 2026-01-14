/**
 * Job Description Formatter
 *
 * Formats job data into markdown job description content.
 * Parallels formatters/agent/profile.js in structure.
 */

import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "../../model/levels.js";

/**
 * Format job as a markdown job description
 * @param {Object} params
 * @param {Object} params.job - The job definition
 * @param {Object} params.discipline - The discipline
 * @param {Object} params.grade - The grade
 * @param {Object} params.track - The track
 * @returns {string} Markdown formatted job description
 */
export function formatJobDescription({ job, discipline, grade, track }) {
  const lines = [];

  // Title
  lines.push(`# ${job.title}`);
  lines.push("");

  // Meta information
  lines.push(`- **Level:** ${grade.id}`);
  lines.push(`- **Experience:** ${grade.typicalExperienceRange}`);
  lines.push(`- **Track:** ${track.name}`);
  lines.push("");

  // Role Summary
  lines.push("## ROLE SUMMARY");
  lines.push("");

  // Build role summary from discipline - use manager version if applicable
  const isManagement = track.isManagement === true;
  let roleSummary =
    isManagement && discipline.managementRoleSummary
      ? discipline.managementRoleSummary
      : discipline.professionalRoleSummary || discipline.description;
  // Replace placeholders
  const { roleTitle, specialization } = discipline;
  roleSummary = roleSummary.replace(/\{roleTitle\}/g, roleTitle);
  roleSummary = roleSummary.replace(/\{specialization\}/g, specialization);
  lines.push(roleSummary);
  lines.push("");

  // Add track context
  if (track.roleContext) {
    lines.push(track.roleContext);
    lines.push("");
  }

  // Add grade expectations as natural paragraphs
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
      lines.push(expectationSentences.join(" "));
      lines.push("");
    }
  }

  // Key Responsibilities
  lines.push("## ROLE RESPONSIBILITIES");
  lines.push("");

  // Use derived responsibilities (already sorted by level descending)
  const derivedResponsibilities = job.derivedResponsibilities || [];

  for (const r of derivedResponsibilities) {
    lines.push(`- **${r.capabilityName}:** ${r.responsibility}`);
  }
  lines.push("");

  // Key Behaviours
  lines.push("## ROLE BEHAVIOURS");
  lines.push("");

  // Sort behaviours by maturity level (highest first)
  const sortedBehaviours = [...job.behaviourProfile].sort((a, b) => {
    const indexA = BEHAVIOUR_MATURITY_ORDER.indexOf(a.maturity);
    const indexB = BEHAVIOUR_MATURITY_ORDER.indexOf(b.maturity);
    // Sort in reverse order (exemplifying first, emerging last)
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexB - indexA;
  });

  for (const behaviour of sortedBehaviours) {
    lines.push(
      `- **${behaviour.behaviourName}:** ${behaviour.maturityDescription || ""}`,
    );
  }
  lines.push("");

  // Group skills by level
  const skillsByLevel = {};
  for (const skill of job.skillMatrix) {
    const level = skill.level || "Other";
    if (!skillsByLevel[level]) {
      skillsByLevel[level] = [];
    }
    skillsByLevel[level].push(skill);
  }

  // Sort levels in a logical order using SKILL_LEVEL_ORDER from types.js
  const sortedLevels = Object.keys(skillsByLevel).sort((a, b) => {
    const indexA = SKILL_LEVEL_ORDER.indexOf(a.toLowerCase());
    const indexB = SKILL_LEVEL_ORDER.indexOf(b.toLowerCase());
    // Sort in reverse order (expert first, awareness last)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexB - indexA;
  });

  for (const level of sortedLevels) {
    const skills = skillsByLevel[level];
    if (skills.length > 0) {
      lines.push(`## ${level.toUpperCase()}-LEVEL SKILLS`);
      lines.push("");
      // Sort skills alphabetically by name
      const sortedSkills = [...skills].sort((a, b) =>
        (a.skillName || "").localeCompare(b.skillName || ""),
      );
      for (const skill of sortedSkills) {
        lines.push(`- **${skill.skillName}:** ${skill.levelDescription || ""}`);
      }
      lines.push("");
    }
  }

  // Qualifications
  lines.push("## QUALIFICATIONS");
  lines.push("");

  if (grade.qualificationSummary) {
    lines.push(grade.qualificationSummary);
    lines.push("");
  }

  return lines.join("\n");
}
