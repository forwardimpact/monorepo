import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "../levels.js";

import { createError, createWarning } from "./common.js";

/**
 * @param {import('../levels.js').Level} level
 * @param {number} index
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateLevel(level, index) {
  const errors = [];
  const warnings = [];
  const path = `levels[${index}]`;

  if (!level.id) {
    errors.push(createError("MISSING_REQUIRED", "Level missing id", path));
  }

  if (!level.professionalTitle) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Level missing professionalTitle",
        `${path}.professionalTitle`,
      ),
    );
  }
  if (!level.managementTitle) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Level missing managementTitle",
        `${path}.managementTitle`,
      ),
    );
  }

  if (typeof level.ordinalRank !== "number") {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Level missing numeric ordinalRank",
        `${path}.ordinalRank`,
      ),
    );
  }

  if (!level.baseSkillProficiencies) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Level missing baseSkillProficiencies",
        `${path}.baseSkillProficiencies`,
      ),
    );
  } else {
    ["primary", "secondary", "broad"].forEach((type) => {
      const proficiency = level.baseSkillProficiencies[type];
      if (!proficiency) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            `Level missing baseSkillProficiencies.${type}`,
            `${path}.baseSkillProficiencies.${type}`,
          ),
        );
      } else if (getSkillProficiencyIndex(proficiency) === -1) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Level "${level.id}" has invalid baseSkillProficiencies.${type}: ${proficiency}`,
            `${path}.baseSkillProficiencies.${type}`,
            proficiency,
          ),
        );
      }
    });
  }

  if (!level.baseBehaviourMaturity) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Level missing baseBehaviourMaturity",
        `${path}.baseBehaviourMaturity`,
      ),
    );
  } else if (getBehaviourMaturityIndex(level.baseBehaviourMaturity) === -1) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Level "${level.id}" has invalid baseBehaviourMaturity: ${level.baseBehaviourMaturity}`,
        `${path}.baseBehaviourMaturity`,
        level.baseBehaviourMaturity,
      ),
    );
  }

  if (!level.expectations) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Level missing expectations",
        `${path}.expectations`,
      ),
    );
  }

  if (
    level.yearsExperience !== undefined &&
    typeof level.yearsExperience !== "string"
  ) {
    warnings.push(
      createWarning(
        "INVALID_VALUE",
        "Level yearsExperience should be a string",
        `${path}.yearsExperience`,
      ),
    );
  }

  return { errors, warnings };
}

/**
 * @param {Object} capability
 * @param {number} index
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateCapability(capability, index) {
  const errors = [];
  const warnings = [];
  const path = `capabilities[${index}]`;

  if (!capability.name) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Capability missing name",
        `${path}.name`,
      ),
    );
  }
  if (!capability.emojiIcon) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Capability missing emojiIcon",
        `${path}.emojiIcon`,
      ),
    );
  }

  const expectedLevels = [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];

  if (!capability.professionalResponsibilities) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Capability missing professionalResponsibilities",
        `${path}.professionalResponsibilities`,
      ),
    );
  } else {
    for (const level of expectedLevels) {
      if (!capability.professionalResponsibilities[level]) {
        warnings.push(
          createWarning(
            "MISSING_OPTIONAL",
            `Capability missing ${level} professional responsibility`,
            `${path}.professionalResponsibilities.${level}`,
          ),
        );
      }
    }
  }

  if (!capability.managementResponsibilities) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Capability missing managementResponsibilities",
        `${path}.managementResponsibilities`,
      ),
    );
  } else {
    for (const level of expectedLevels) {
      if (!capability.managementResponsibilities[level]) {
        warnings.push(
          createWarning(
            "MISSING_OPTIONAL",
            `Capability missing ${level} management responsibility`,
            `${path}.managementResponsibilities.${level}`,
          ),
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * @param {Object} stage
 * @param {number} index
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateStage(stage, index) {
  const errors = [];
  const warnings = [];
  const path = `stages[${index}]`;

  if (!stage.id) {
    errors.push(createError("MISSING_REQUIRED", "Stage missing id", path));
  }

  if (!stage.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Stage missing name", `${path}.name`),
    );
  }

  if (!stage.description) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Stage missing description",
        `${path}.description`,
      ),
    );
  }

  if (!stage.handoffs || !Array.isArray(stage.handoffs)) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Stage missing handoffs array",
        `${path}.handoffs`,
      ),
    );
  } else {
    stage.handoffs.forEach((handoff, hIndex) => {
      if (!handoff.targetStage) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            "Handoff missing targetStage",
            `${path}.handoffs[${hIndex}].targetStage`,
          ),
        );
      }
      if (!handoff.label) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            "Handoff missing label",
            `${path}.handoffs[${hIndex}].label`,
          ),
        );
      }
      if (!handoff.prompt) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            "Handoff missing prompt",
            `${path}.handoffs[${hIndex}].prompt`,
          ),
        );
      }
    });
  }

  return { errors, warnings };
}
