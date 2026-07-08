import {
  createValidationResult,
  createError,
  checkDuplicateIds,
} from "./validation/common.js";

import { validateSkill } from "./validation/skill.js";
import { validateBehaviour } from "./validation/behaviour.js";
import {
  validateDiscipline,
  getAllDisciplineSkillIds,
} from "./validation/discipline.js";
import { validateTrack } from "./validation/track.js";
import { validateDriver } from "./validation/driver.js";
import {
  validateLevel,
  validateCapability,
  checkProfessionalTitleShape,
  checkProfessionalTitleDisjoint,
  checkAutonomyExpectation,
  CONTRACT_URL,
} from "./validation/level.js";
import { validateAgentData } from "./validation/agent.js";
import {
  validateSelfAssessment,
  validateQuestionBank,
} from "./validation/questions.js";

export { validateSelfAssessment, validateQuestionBank, validateAgentData };

function validateEntityList(
  items,
  entityName,
  validateFn,
  allErrors,
  allWarnings,
) {
  if (!items || items.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", `At least one ${entityName} is required`),
    );
    return;
  }
  items.forEach((item, index) => {
    const { errors, warnings } = validateFn(item, index);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  });
  allErrors.push(...checkDuplicateIds(items, entityName));
}

function validateSkillCapabilityRefs(skills, capabilityIds, allErrors) {
  if (!skills || skills.length === 0) return;
  skills.forEach((skill, index) => {
    if (skill.capability && !capabilityIds.has(skill.capability)) {
      allErrors.push(
        createError(
          "INVALID_REFERENCE",
          `Skill '${skill.id}' references unknown capability '${skill.capability}'`,
          `skills[${index}].capability`,
          skill.capability,
        ),
      );
    }
  });
}

/**
 * @param {Object} data
 * @returns {import('@forwardimpact/libskill/levels').ValidationResult}
 */
export function validateAllData({
  drivers,
  behaviours,
  skills,
  disciplines,
  tracks,
  levels,
  capabilities,
}) {
  const allErrors = [];
  const allWarnings = [];

  const skillIds = new Set((skills || []).map((s) => s.id));
  const behaviourIds = new Set((behaviours || []).map((b) => b.id));
  const capabilityIds = new Set((capabilities || []).map((c) => c.id));
  const trackIdSet = new Set((tracks || []).map((t) => t.id));
  const levelIdSet = new Set((levels || []).map((g) => g.id));

  validateEntityList(
    skills,
    "skill",
    (skill, index) => validateSkill(skill, index),
    allErrors,
    allWarnings,
  );

  validateEntityList(
    behaviours,
    "behaviour",
    (behaviour, index) => validateBehaviour(behaviour, index),
    allErrors,
    allWarnings,
  );

  validateEntityList(
    disciplines,
    "discipline",
    (discipline, index) =>
      validateDiscipline(
        discipline,
        index,
        skillIds,
        behaviourIds,
        trackIdSet,
        levelIdSet,
      ),
    allErrors,
    allWarnings,
  );

  const disciplineSkillIds = getAllDisciplineSkillIds(disciplines || []);

  validateEntityList(
    tracks,
    "track",
    (track, index) =>
      validateTrack(track, index, disciplineSkillIds, behaviourIds, levelIdSet),
    allErrors,
    allWarnings,
  );

  validateEntityList(
    levels,
    "level",
    (level, index) => validateLevel(level, index),
    allErrors,
    allWarnings,
  );

  (levels || []).forEach((level, index) => {
    const path = `levels[${index}]`;

    const shape = checkProfessionalTitleShape(level.professionalTitle);
    if (!shape.ok) {
      allErrors.push(
        createError(
          "INVALID_VALUE",
          `${shape.reason} — see ${CONTRACT_URL}`,
          `${path}.professionalTitle`,
          level.professionalTitle,
        ),
      );
    }

    const disjoint = checkProfessionalTitleDisjoint(level, disciplines || []);
    if (!disjoint.ok) {
      allErrors.push(
        createError(
          "INVALID_VALUE",
          `${disjoint.reason} — see ${CONTRACT_URL}`,
          `${path}.professionalTitle`,
          level.professionalTitle,
        ),
      );
    }

    const exp = level.expectations || {};
    const autonomy = checkAutonomyExpectation(exp.autonomyExpectation);
    if (!autonomy.ok) {
      allErrors.push(
        createError(
          "INVALID_VALUE",
          `${autonomy.reason} — see ${CONTRACT_URL}`,
          `${path}.expectations.autonomyExpectation`,
          exp.autonomyExpectation,
        ),
      );
    }
  });

  if (!capabilities || capabilities.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one capability is required"),
    );
  } else {
    capabilities.forEach((capability, index) => {
      const { errors, warnings } = validateCapability(capability, index);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });
    allErrors.push(...checkDuplicateIds(capabilities, "capability"));
    validateSkillCapabilityRefs(skills, capabilityIds, allErrors);
  }

  validateEntityList(
    drivers,
    "driver",
    (driver, index) => validateDriver(driver, index, skillIds, behaviourIds),
    allErrors,
    allWarnings,
  );

  return createValidationResult(allErrors.length === 0, allErrors, allWarnings);
}
