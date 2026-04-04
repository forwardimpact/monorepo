import { createError } from "./common.js";
import { validateAgentIdentitySection } from "./agent-section.js";

function validateDisciplineBasicFields(discipline, path) {
  const errors = [];

  if (!discipline.specialization) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Discipline missing specialization",
        `${path}.specialization`,
      ),
    );
  }
  if (!discipline.roleTitle) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Discipline missing roleTitle",
        `${path}.roleTitle`,
      ),
    );
  }

  return errors;
}

function validateDisciplineValidTracks(discipline, path, trackIds) {
  const errors = [];

  if (!Array.isArray(discipline.validTracks)) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Discipline "${discipline.id}" missing required validTracks array`,
        `${path}.validTracks`,
      ),
    );
    return errors;
  }

  discipline.validTracks.forEach((trackId, i) => {
    if (trackId === null) return;
    if (!trackIds.has(trackId)) {
      errors.push(
        createError(
          "INVALID_REFERENCE",
          `Discipline "${discipline.id}" references non-existent track: ${trackId}`,
          `${path}.validTracks[${i}]`,
          trackId,
        ),
      );
    }
  });

  return errors;
}

function validateDisciplineBooleanFields(discipline, path) {
  const errors = [];

  for (const field of ["isManagement", "isProfessional"]) {
    if (
      discipline[field] !== undefined &&
      typeof discipline[field] !== "boolean"
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Discipline "${discipline.id}" has invalid ${field} value: ${discipline[field]} (must be boolean)`,
          `${path}.${field}`,
          discipline[field],
        ),
      );
    }
  }

  return errors;
}

function validateDisciplineSkillRefs(discipline, path, skillIds) {
  const errors = [];

  if (!discipline.coreSkills || discipline.coreSkills.length === 0) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Discipline must have at least one core skill",
        `${path}.coreSkills`,
      ),
    );
  } else {
    discipline.coreSkills.forEach((skillId, i) => {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline "${discipline.id}" references non-existent core skill: ${skillId}`,
            `${path}.coreSkills[${i}]`,
            skillId,
          ),
        );
      }
    });
  }

  for (const tier of ["supportingSkills", "broadSkills"]) {
    if (discipline[tier]) {
      discipline[tier].forEach((skillId, i) => {
        if (!skillIds.has(skillId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Discipline "${discipline.id}" references non-existent ${tier === "supportingSkills" ? "supporting" : "broad"} skill: ${skillId}`,
              `${path}.${tier}[${i}]`,
              skillId,
            ),
          );
        }
      });
    }
  }

  return errors;
}

function validateDisciplineBehaviourModifiers(discipline, path, behaviourIds) {
  const errors = [];

  if (!discipline.behaviourModifiers) return errors;

  Object.entries(discipline.behaviourModifiers).forEach(
    ([behaviourId, modifier]) => {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline "${discipline.id}" references non-existent behaviour: ${behaviourId}`,
            `${path}.behaviourModifiers.${behaviourId}`,
            behaviourId,
          ),
        );
      }
      if (typeof modifier !== "number" || modifier < -1 || modifier > 1) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Discipline "${discipline.id}" has invalid behaviour modifier: ${modifier} (must be -1, 0, or 1)`,
            `${path}.behaviourModifiers.${behaviourId}`,
            modifier,
          ),
        );
      }
    },
  );

  return errors;
}

/**
 * @param {import('../levels.js').Discipline} discipline
 * @param {number} index
 * @param {Set<string>} skillIds
 * @param {Set<string>} behaviourIds
 * @param {Set<string>} trackIds
 * @param {Set<string>} levelIds
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateDiscipline(
  discipline,
  index,
  skillIds,
  behaviourIds,
  trackIds,
  levelIds,
) {
  const errors = [];
  const warnings = [];
  const path = `disciplines[${index}]`;

  errors.push(...validateDisciplineBasicFields(discipline, path));
  errors.push(...validateDisciplineValidTracks(discipline, path, trackIds));

  if (discipline.minLevel && !levelIds.has(discipline.minLevel)) {
    errors.push(
      createError(
        "INVALID_REFERENCE",
        `Discipline "${discipline.id}" references non-existent level: ${discipline.minLevel}`,
        `${path}.minLevel`,
        discipline.minLevel,
      ),
    );
  }

  errors.push(...validateDisciplineBooleanFields(discipline, path));
  errors.push(...validateDisciplineSkillRefs(discipline, path, skillIds));
  errors.push(
    ...validateDisciplineBehaviourModifiers(discipline, path, behaviourIds),
  );

  if (discipline.agent) {
    errors.push(
      ...validateAgentIdentitySection(
        discipline.agent,
        `${path}.agent`,
        "Discipline",
      ),
    );
  }

  return { errors, warnings };
}

/**
 * @param {import('../levels.js').Discipline[]} disciplines
 * @returns {Set<string>}
 */
export function getAllDisciplineSkillIds(disciplines) {
  const skillIds = new Set();
  for (const discipline of disciplines) {
    (discipline.coreSkills || []).forEach((id) => skillIds.add(id));
    (discipline.supportingSkills || []).forEach((id) => skillIds.add(id));
    (discipline.broadSkills || []).forEach((id) => skillIds.add(id));
  }
  return skillIds;
}
