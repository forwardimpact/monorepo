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
  validateStage,
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

function validateStageHandoffTargets(stages, allErrors) {
  if (!stages || stages.length === 0) return;
  const stageIds = new Set(stages.map((s) => s.id));
  stages.forEach((stage, sIndex) => {
    if (!stage.handoffs) return;
    stage.handoffs.forEach((handoff, hIndex) => {
      if (handoff.target && !stageIds.has(handoff.target)) {
        allErrors.push(
          createError(
            "INVALID_REFERENCE",
            `Stage '${stage.id}' handoff references unknown stage '${handoff.target}'`,
            `stages[${sIndex}].handoffs[${hIndex}].target`,
            handoff.target,
          ),
        );
      }
    });
  });
}

/**
 * @param {Object} data
 * @returns {import('./levels.js').ValidationResult}
 */
export function validateAllData({
  drivers,
  behaviours,
  skills,
  disciplines,
  tracks,
  levels,
  capabilities,
  stages,
}) {
  const allErrors = [];
  const allWarnings = [];

  const skillIds = new Set((skills || []).map((s) => s.id));
  const behaviourIds = new Set((behaviours || []).map((b) => b.id));
  const capabilityIds = new Set((capabilities || []).map((c) => c.id));
  const requiredStageIds = (stages || []).map((s) => s.id);
  const trackIdSet = new Set((tracks || []).map((t) => t.id));
  const levelIdSet = new Set((levels || []).map((g) => g.id));

  validateEntityList(
    skills,
    "skill",
    (skill, index) => validateSkill(skill, index, requiredStageIds),
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

  if (stages && stages.length > 0) {
    stages.forEach((stage, index) => {
      const { errors, warnings } = validateStage(stage, index);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });
    allErrors.push(...checkDuplicateIds(stages, "stage"));
    validateStageHandoffTargets(stages, allErrors);
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
