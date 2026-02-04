/**
 * Engineering Pathway Validation Functions
 *
 * This module provides comprehensive data validation with referential integrity checks.
 */

import {
  Capability,
  Stage,
  getSkillLevelIndex,
  getBehaviourMaturityIndex,
} from "./levels.js";

import { isCapability } from "./modifiers.js";

/**
 * Create a validation result object
 * @param {boolean} valid - Whether validation passed
 * @param {Array} errors - Array of errors
 * @param {Array} warnings - Array of warnings
 * @returns {import('./levels.js').ValidationResult}
 */
function createValidationResult(valid, errors = [], warnings = []) {
  return { valid, errors, warnings };
}

/**
 * Create a validation error
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {string} [path] - Path to invalid data
 * @param {*} [value] - Invalid value
 * @returns {import('./levels.js').ValidationError}
 */
function createError(type, message, path, value) {
  const error = { type, message };
  if (path !== undefined) error.path = path;
  if (value !== undefined) error.value = value;
  return error;
}

/**
 * Create a validation warning
 * @param {string} type - Warning type
 * @param {string} message - Warning message
 * @param {string} [path] - Path to concerning data
 * @returns {import('./levels.js').ValidationWarning}
 */
function createWarning(type, message, path) {
  const warning = { type, message };
  if (path !== undefined) warning.path = path;
  return warning;
}

/**
 * Validate that a skill has required properties
 * @param {import('./levels.js').Skill} skill - Skill to validate
 * @param {number} index - Index in the skills array
 * @param {string[]} [requiredStageIds] - Stage IDs that must be present in agent skills
 * @returns {{errors: Array, warnings: Array}}
 */
function validateSkill(skill, index, requiredStageIds = []) {
  const errors = [];
  const warnings = [];
  const path = `skills[${index}]`;

  if (!skill.id) {
    errors.push(createError("MISSING_REQUIRED", "Skill missing id", path));
  }
  if (!skill.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Skill missing name", `${path}.name`),
    );
  }
  if (!skill.capability) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill missing capability",
        `${path}.capability`,
      ),
    );
  } else if (!Object.values(Capability).includes(skill.capability)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Invalid skill capability: ${skill.capability}`,
        `${path}.capability`,
        skill.capability,
      ),
    );
  }
  if (!skill.description) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Skill missing description",
        `${path}.description`,
      ),
    );
  }
  if (!skill.levelDescriptions) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Skill missing level descriptions",
        `${path}.levelDescriptions`,
      ),
    );
  }

  // Validate agent section if present
  if (skill.agent) {
    const agentPath = `${path}.agent`;
    if (!skill.agent.name) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Skill agent section missing name",
          `${agentPath}.name`,
        ),
      );
    }
    if (!skill.agent.description) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Skill agent section missing description",
          `${agentPath}.description`,
        ),
      );
    }

    // Validate stages (required for agent skills)
    if (!skill.agent.stages) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Skill agent section missing stages",
          `${agentPath}.stages`,
        ),
      );
    } else if (typeof skill.agent.stages !== "object") {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Skill agent stages must be an object",
          `${agentPath}.stages`,
          skill.agent.stages,
        ),
      );
    } else {
      // Validate each stage
      const validStageIds = Object.values(Stage);
      for (const [stageId, stageData] of Object.entries(skill.agent.stages)) {
        if (!validStageIds.includes(stageId)) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Invalid stage ID: ${stageId}. Must be one of: ${validStageIds.join(", ")}`,
              `${agentPath}.stages.${stageId}`,
              stageId,
            ),
          );
          continue;
        }
        const stagePath = `${agentPath}.stages.${stageId}`;
        // focus is required
        if (!stageData.focus) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              `Stage ${stageId} missing focus`,
              `${stagePath}.focus`,
            ),
          );
        } else if (typeof stageData.focus !== "string") {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Stage ${stageId} focus must be a string`,
              `${stagePath}.focus`,
              stageData.focus,
            ),
          );
        }
        // activities is required and must be an array
        if (!stageData.activities) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              `Stage ${stageId} missing activities`,
              `${stagePath}.activities`,
            ),
          );
        } else if (!Array.isArray(stageData.activities)) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Stage ${stageId} activities must be an array`,
              `${stagePath}.activities`,
              stageData.activities,
            ),
          );
        }
        // ready is required and must be an array (these become checklist items)
        if (!stageData.ready) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              `Stage ${stageId} missing ready criteria`,
              `${stagePath}.ready`,
            ),
          );
        } else if (!Array.isArray(stageData.ready)) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Stage ${stageId} ready must be an array`,
              `${stagePath}.ready`,
              stageData.ready,
            ),
          );
        }
      }

      // Check that all required stages are present
      if (requiredStageIds.length > 0) {
        const presentStageIds = Object.keys(skill.agent.stages);
        for (const requiredStageId of requiredStageIds) {
          if (!presentStageIds.includes(requiredStageId)) {
            errors.push(
              createError(
                "MISSING_REQUIRED",
                `Skill agent missing required stage: ${requiredStageId}`,
                `${agentPath}.stages.${requiredStageId}`,
              ),
            );
          }
        }
      }
    }

    // Error if old 'reference' field is still present (moved to skill.implementationReference)
    if (skill.agent.reference !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Skill agent 'reference' field is not supported. Use skill.implementationReference instead.",
          `${agentPath}.reference`,
        ),
      );
    }

    // Error if old fields are still present
    if (skill.agent.body !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Skill agent 'body' field is not supported. Use stages instead.",
          `${agentPath}.body`,
        ),
      );
    }
    if (skill.agent.applicability !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Skill agent 'applicability' field is not supported. Use stages instead.",
          `${agentPath}.applicability`,
        ),
      );
    }
    if (skill.agent.guidance !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Skill agent 'guidance' field is not supported. Use stages instead.",
          `${agentPath}.guidance`,
        ),
      );
    }
    if (skill.agent.verificationCriteria !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Skill agent 'verificationCriteria' field is not supported. Use stages.{stage}.ready instead.",
          `${agentPath}.verificationCriteria`,
        ),
      );
    }
  }

  // Validate implementationReference if present (optional string)
  if (
    skill.implementationReference !== undefined &&
    typeof skill.implementationReference !== "string"
  ) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill implementationReference must be a string",
        `${path}.implementationReference`,
        skill.implementationReference,
      ),
    );
  }

  // Validate toolReferences array if present
  if (skill.toolReferences !== undefined) {
    if (!Array.isArray(skill.toolReferences)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Skill toolReferences must be an array",
          `${path}.toolReferences`,
          skill.toolReferences,
        ),
      );
    } else {
      skill.toolReferences.forEach((tool, i) => {
        const toolPath = `${path}.toolReferences[${i}]`;
        if (!tool.name) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              "Tool reference missing name",
              `${toolPath}.name`,
            ),
          );
        }
        if (!tool.description) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              "Tool reference missing description",
              `${toolPath}.description`,
            ),
          );
        }
        if (!tool.useWhen) {
          errors.push(
            createError(
              "MISSING_REQUIRED",
              "Tool reference missing useWhen",
              `${toolPath}.useWhen`,
            ),
          );
        }
        if (tool.url !== undefined && typeof tool.url !== "string") {
          errors.push(
            createError(
              "INVALID_VALUE",
              "Tool reference url must be a string",
              `${toolPath}.url`,
              tool.url,
            ),
          );
        }
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validate that a behaviour has required properties
 * @param {import('./levels.js').Behaviour} behaviour - Behaviour to validate
 * @param {number} index - Index in the behaviours array
 * @returns {{errors: Array, warnings: Array}}
 */
function validateBehaviour(behaviour, index) {
  const errors = [];
  const warnings = [];
  const path = `behaviours[${index}]`;

  // id is derived from filename by the loader
  if (!behaviour.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Behaviour missing name", `${path}.name`),
    );
  }
  if (!behaviour.description) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Behaviour missing description",
        `${path}.description`,
      ),
    );
  }
  if (!behaviour.maturityDescriptions) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Behaviour missing maturity descriptions",
        `${path}.maturityDescriptions`,
      ),
    );
  }

  // Validate agent section if present
  if (behaviour.agent) {
    const agentPath = `${path}.agent`;

    // title is required for agent behaviours
    if (!behaviour.agent.title) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Behaviour agent section missing title",
          `${agentPath}.title`,
        ),
      );
    } else if (typeof behaviour.agent.title !== "string") {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Behaviour agent title must be a string",
          `${agentPath}.title`,
          behaviour.agent.title,
        ),
      );
    }

    // workingStyle is required for agent behaviours
    if (!behaviour.agent.workingStyle) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Behaviour agent section missing workingStyle",
          `${agentPath}.workingStyle`,
        ),
      );
    } else if (typeof behaviour.agent.workingStyle !== "string") {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Behaviour agent workingStyle must be a string",
          `${agentPath}.workingStyle`,
          behaviour.agent.workingStyle,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate that a driver has required properties and valid references
 * @param {import('./levels.js').Driver} driver - Driver to validate
 * @param {number} index - Index in the drivers array
 * @param {Set<string>} skillIds - Set of valid skill IDs
 * @param {Set<string>} behaviourIds - Set of valid behaviour IDs
 * @returns {{errors: Array, warnings: Array}}
 */
function validateDriver(driver, index, skillIds, behaviourIds) {
  const errors = [];
  const warnings = [];
  const path = `drivers[${index}]`;

  if (!driver.id) {
    errors.push(createError("MISSING_REQUIRED", "Driver missing id", path));
  }
  if (!driver.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Driver missing name", `${path}.name`),
    );
  }
  if (!driver.description) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Driver missing description",
        `${path}.description`,
      ),
    );
  }

  // Validate contributing skills
  if (driver.contributingSkills) {
    driver.contributingSkills.forEach((skillId, i) => {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Driver "${driver.id}" references non-existent skill: ${skillId}`,
            `${path}.contributingSkills[${i}]`,
            skillId,
          ),
        );
      }
    });
  }

  // Validate contributing behaviours
  if (driver.contributingBehaviours) {
    driver.contributingBehaviours.forEach((behaviourId, i) => {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Driver "${driver.id}" references non-existent behaviour: ${behaviourId}`,
            `${path}.contributingBehaviours[${i}]`,
            behaviourId,
          ),
        );
      }
    });
  }

  return { errors, warnings };
}

/**
 * Validate that a discipline has required properties and valid references
 * @param {import('./levels.js').Discipline} discipline - Discipline to validate
 * @param {number} index - Index in the disciplines array
 * @param {Set<string>} skillIds - Set of valid skill IDs
 * @param {Set<string>} behaviourIds - Set of valid behaviour IDs
 * @param {Set<string>} trackIds - Set of valid track IDs
 * @param {Set<string>} gradeIds - Set of valid grade IDs
 * @returns {{errors: Array, warnings: Array}}
 */
function validateDiscipline(
  discipline,
  index,
  skillIds,
  behaviourIds,
  trackIds,
  gradeIds,
) {
  const errors = [];
  const warnings = [];
  const path = `disciplines[${index}]`;

  // id is derived from filename by the loader
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

  // Validate validTracks (REQUIRED - must be an array)
  // - null in array = allow trackless (generalist)
  // - string values = specific track IDs
  // - empty array = no valid combinations (discipline cannot be used)
  if (!Array.isArray(discipline.validTracks)) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Discipline "${discipline.id}" missing required validTracks array`,
        `${path}.validTracks`,
      ),
    );
  } else {
    discipline.validTracks.forEach((trackId, i) => {
      // null means "allow trackless" - skip validation
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
  }

  // Validate minGrade if specified
  if (discipline.minGrade) {
    if (!gradeIds.has(discipline.minGrade)) {
      errors.push(
        createError(
          "INVALID_REFERENCE",
          `Discipline "${discipline.id}" references non-existent grade: ${discipline.minGrade}`,
          `${path}.minGrade`,
          discipline.minGrade,
        ),
      );
    }
  }

  // Validate isManagement/isProfessional booleans (optional)
  if (
    discipline.isManagement !== undefined &&
    typeof discipline.isManagement !== "boolean"
  ) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Discipline "${discipline.id}" has invalid isManagement value: ${discipline.isManagement} (must be boolean)`,
        `${path}.isManagement`,
        discipline.isManagement,
      ),
    );
  }
  if (
    discipline.isProfessional !== undefined &&
    typeof discipline.isProfessional !== "boolean"
  ) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Discipline "${discipline.id}" has invalid isProfessional value: ${discipline.isProfessional} (must be boolean)`,
        `${path}.isProfessional`,
        discipline.isProfessional,
      ),
    );
  }

  // Validate core skills
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

  // Validate supporting skills
  if (discipline.supportingSkills) {
    discipline.supportingSkills.forEach((skillId, i) => {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline "${discipline.id}" references non-existent supporting skill: ${skillId}`,
            `${path}.supportingSkills[${i}]`,
            skillId,
          ),
        );
      }
    });
  }

  // Validate broad skills
  if (discipline.broadSkills) {
    discipline.broadSkills.forEach((skillId, i) => {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline "${discipline.id}" references non-existent broad skill: ${skillId}`,
            `${path}.broadSkills[${i}]`,
            skillId,
          ),
        );
      }
    });
  }

  // Validate behaviour modifiers
  if (discipline.behaviourModifiers) {
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
  }

  // Validate agent section if present
  if (discipline.agent) {
    const agentPath = `${path}.agent`;

    // Required: identity
    if (!discipline.agent.identity) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          "Discipline agent section missing identity",
          `${agentPath}.identity`,
        ),
      );
    } else if (typeof discipline.agent.identity !== "string") {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Discipline agent identity must be a string",
          `${agentPath}.identity`,
          discipline.agent.identity,
        ),
      );
    }

    // Optional: priority (string)
    if (
      discipline.agent.priority !== undefined &&
      typeof discipline.agent.priority !== "string"
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Discipline agent priority must be a string",
          `${agentPath}.priority`,
          discipline.agent.priority,
        ),
      );
    }

    // Optional: beforeMakingChanges (array of strings)
    if (discipline.agent.beforeMakingChanges !== undefined) {
      if (!Array.isArray(discipline.agent.beforeMakingChanges)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            "Discipline agent beforeMakingChanges must be an array",
            `${agentPath}.beforeMakingChanges`,
            discipline.agent.beforeMakingChanges,
          ),
        );
      } else {
        discipline.agent.beforeMakingChanges.forEach((item, i) => {
          if (typeof item !== "string") {
            errors.push(
              createError(
                "INVALID_VALUE",
                "Discipline agent beforeMakingChanges items must be strings",
                `${agentPath}.beforeMakingChanges[${i}]`,
                item,
              ),
            );
          }
        });
      }
    }

    // Optional: delegation (string)
    if (
      discipline.agent.delegation !== undefined &&
      typeof discipline.agent.delegation !== "string"
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Discipline agent delegation must be a string",
          `${agentPath}.delegation`,
          discipline.agent.delegation,
        ),
      );
    }

    // Optional: constraints (array of strings)
    if (discipline.agent.constraints !== undefined) {
      if (!Array.isArray(discipline.agent.constraints)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            "Discipline agent constraints must be an array",
            `${agentPath}.constraints`,
            discipline.agent.constraints,
          ),
        );
      } else {
        discipline.agent.constraints.forEach((item, i) => {
          if (typeof item !== "string") {
            errors.push(
              createError(
                "INVALID_VALUE",
                "Discipline agent constraints items must be strings",
                `${agentPath}.constraints[${i}]`,
                item,
              ),
            );
          }
        });
      }
    }

    // Error if old 'coreInstructions' field is still present
    if (discipline.agent.coreInstructions !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Discipline agent 'coreInstructions' field is not supported. Use identity, priority, beforeMakingChanges, and delegation instead.",
          `${agentPath}.coreInstructions`,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * Get all skill IDs referenced by any discipline
 * @param {import('./levels.js').Discipline[]} disciplines - Array of disciplines
 * @returns {Set<string>} Set of all referenced skill IDs
 */
function getAllDisciplineSkillIds(disciplines) {
  const skillIds = new Set();
  for (const discipline of disciplines) {
    (discipline.coreSkills || []).forEach((id) => skillIds.add(id));
    (discipline.supportingSkills || []).forEach((id) => skillIds.add(id));
    (discipline.broadSkills || []).forEach((id) => skillIds.add(id));
  }
  return skillIds;
}

/**
 * Validate that a track has required properties and valid references
 * @param {import('./levels.js').Track} track - Track to validate
 * @param {number} index - Index in the tracks array
 * @param {Set<string>} disciplineSkillIds - Set of skill IDs used in any discipline
 * @param {Set<string>} behaviourIds - Set of valid behaviour IDs
 * @param {Set<string>} gradeIds - Set of valid grade IDs
 * @returns {{errors: Array, warnings: Array}}
 */
function validateTrack(
  track,
  index,
  disciplineSkillIds,
  behaviourIds,
  gradeIds,
) {
  const errors = [];
  const warnings = [];
  const path = `tracks[${index}]`;

  // id is derived from filename by the loader
  if (!track.name) {
    errors.push(
      createError("MISSING_REQUIRED", "Track missing name", `${path}.name`),
    );
  }

  // Validate skill modifiers - must be capabilities only (not individual skill IDs)
  if (track.skillModifiers) {
    Object.entries(track.skillModifiers).forEach(([key, modifier]) => {
      // Key must be a capability - individual skill IDs are not allowed
      if (!isCapability(key)) {
        errors.push(
          createError(
            "INVALID_SKILL_MODIFIER_KEY",
            `Track "${track.id}" has invalid skillModifier key "${key}". Only capability names are allowed: delivery, data, ai, scale, reliability, people, process, business, documentation`,
            `${path}.skillModifiers.${key}`,
            key,
          ),
        );
      }
      if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Track "${track.id}" has invalid skill modifier: ${modifier} (must be an integer)`,
            `${path}.skillModifiers.${key}`,
            modifier,
          ),
        );
      }
    });
  }

  // Validate behaviour modifiers
  if (track.behaviourModifiers) {
    Object.entries(track.behaviourModifiers).forEach(
      ([behaviourId, modifier]) => {
        if (!behaviourIds.has(behaviourId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Track "${track.id}" references non-existent behaviour: ${behaviourId}`,
              `${path}.behaviourModifiers.${behaviourId}`,
              behaviourId,
            ),
          );
        }
        if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Track "${track.id}" has invalid behaviour modifier: ${modifier} (must be an integer)`,
              `${path}.behaviourModifiers.${behaviourId}`,
              modifier,
            ),
          );
        }
      },
    );
  }

  // Validate minGrade if specified
  if (track.minGrade) {
    if (!gradeIds.has(track.minGrade)) {
      errors.push(
        createError(
          "INVALID_REFERENCE",
          `Track "${track.id}" references non-existent grade: ${track.minGrade}`,
          `${path}.minGrade`,
          track.minGrade,
        ),
      );
    }
  }

  // Validate assessment weights if specified
  if (track.assessmentWeights) {
    const { skillWeight, behaviourWeight } = track.assessmentWeights;
    if (typeof skillWeight !== "number" || skillWeight < 0 || skillWeight > 1) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Track "${track.id}" has invalid assessmentWeights.skillWeight: ${skillWeight}`,
          `${path}.assessmentWeights.skillWeight`,
          skillWeight,
        ),
      );
    }
    if (
      typeof behaviourWeight !== "number" ||
      behaviourWeight < 0 ||
      behaviourWeight > 1
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Track "${track.id}" has invalid assessmentWeights.behaviourWeight: ${behaviourWeight}`,
          `${path}.assessmentWeights.behaviourWeight`,
          behaviourWeight,
        ),
      );
    }
    if (
      typeof skillWeight === "number" &&
      typeof behaviourWeight === "number"
    ) {
      const sum = skillWeight + behaviourWeight;
      if (Math.abs(sum - 1.0) > 0.001) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Track "${track.id}" assessmentWeights must sum to 1.0 (got ${sum})`,
            `${path}.assessmentWeights`,
            { skillWeight, behaviourWeight },
          ),
        );
      }
    }
  }

  // Validate agent section if present
  if (track.agent) {
    const agentPath = `${path}.agent`;

    // Optional: identity (string) - if provided, overrides discipline identity
    if (
      track.agent.identity !== undefined &&
      typeof track.agent.identity !== "string"
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Track agent identity must be a string",
          `${agentPath}.identity`,
          track.agent.identity,
        ),
      );
    }

    // Optional: priority (string)
    if (
      track.agent.priority !== undefined &&
      typeof track.agent.priority !== "string"
    ) {
      errors.push(
        createError(
          "INVALID_VALUE",
          "Track agent priority must be a string",
          `${agentPath}.priority`,
          track.agent.priority,
        ),
      );
    }

    // Optional: beforeMakingChanges (array of strings)
    if (track.agent.beforeMakingChanges !== undefined) {
      if (!Array.isArray(track.agent.beforeMakingChanges)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            "Track agent beforeMakingChanges must be an array",
            `${agentPath}.beforeMakingChanges`,
            track.agent.beforeMakingChanges,
          ),
        );
      } else {
        track.agent.beforeMakingChanges.forEach((item, i) => {
          if (typeof item !== "string") {
            errors.push(
              createError(
                "INVALID_VALUE",
                "Track agent beforeMakingChanges items must be strings",
                `${agentPath}.beforeMakingChanges[${i}]`,
                item,
              ),
            );
          }
        });
      }
    }

    // Optional: constraints (array of strings)
    if (track.agent.constraints !== undefined) {
      if (!Array.isArray(track.agent.constraints)) {
        errors.push(
          createError(
            "INVALID_VALUE",
            "Track agent constraints must be an array",
            `${agentPath}.constraints`,
            track.agent.constraints,
          ),
        );
      } else {
        track.agent.constraints.forEach((item, i) => {
          if (typeof item !== "string") {
            errors.push(
              createError(
                "INVALID_VALUE",
                "Track agent constraints items must be strings",
                `${agentPath}.constraints[${i}]`,
                item,
              ),
            );
          }
        });
      }
    }

    // Error if old 'coreInstructions' field is still present
    if (track.agent.coreInstructions !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          "Track agent 'coreInstructions' field is not supported. Use identity, priority, beforeMakingChanges, and constraints instead.",
          `${agentPath}.coreInstructions`,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate that a grade has required properties and valid values
 * @param {import('./levels.js').Grade} grade - Grade to validate
 * @param {number} index - Index in the grades array
 * @returns {{errors: Array, warnings: Array}}
 */
function validateGrade(grade, index) {
  const errors = [];
  const warnings = [];
  const path = `grades[${index}]`;

  if (!grade.id) {
    errors.push(createError("MISSING_REQUIRED", "Grade missing id", path));
  }

  if (!grade.professionalTitle) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Grade missing professionalTitle",
        `${path}.professionalTitle`,
      ),
    );
  }
  if (!grade.managementTitle) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Grade missing managementTitle",
        `${path}.managementTitle`,
      ),
    );
  }

  if (typeof grade.ordinalRank !== "number") {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Grade missing numeric ordinalRank",
        `${path}.ordinalRank`,
      ),
    );
  }

  // Validate base skill levels
  if (!grade.baseSkillLevels) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Grade missing baseSkillLevels",
        `${path}.baseSkillLevels`,
      ),
    );
  } else {
    ["primary", "secondary", "broad"].forEach((type) => {
      const level = grade.baseSkillLevels[type];
      if (!level) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            `Grade missing baseSkillLevels.${type}`,
            `${path}.baseSkillLevels.${type}`,
          ),
        );
      } else if (getSkillLevelIndex(level) === -1) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Grade "${grade.id}" has invalid baseSkillLevels.${type}: ${level}`,
            `${path}.baseSkillLevels.${type}`,
            level,
          ),
        );
      }
    });
  }

  // Validate base behaviour maturity
  if (!grade.baseBehaviourMaturity) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Grade missing baseBehaviourMaturity",
        `${path}.baseBehaviourMaturity`,
      ),
    );
  } else if (getBehaviourMaturityIndex(grade.baseBehaviourMaturity) === -1) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Grade "${grade.id}" has invalid baseBehaviourMaturity: ${grade.baseBehaviourMaturity}`,
        `${path}.baseBehaviourMaturity`,
        grade.baseBehaviourMaturity,
      ),
    );
  }

  // Validate expectations
  if (!grade.expectations) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Grade missing expectations",
        `${path}.expectations`,
      ),
    );
  }

  // Validate yearsExperience if present (should be a string like "0-2" or "20+")
  if (
    grade.yearsExperience !== undefined &&
    typeof grade.yearsExperience !== "string"
  ) {
    warnings.push(
      createWarning(
        "INVALID_VALUE",
        "Grade yearsExperience should be a string",
        `${path}.yearsExperience`,
      ),
    );
  }

  return { errors, warnings };
}

/**
 * Validate that a capability has required properties
 * @param {Object} capability - Capability to validate
 * @param {number} index - Index in the capabilities array
 * @returns {{errors: Array, warnings: Array}}
 */
function validateCapability(capability, index) {
  const errors = [];
  const warnings = [];
  const path = `capabilities[${index}]`;

  // id is derived from filename by the loader
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

  // Validate professionalResponsibilities and managementResponsibilities
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
 * Validate a stage object
 * @param {Object} stage - Stage to validate
 * @param {number} index - Index in the stages array
 * @returns {{errors: Array, warnings: Array}}
 */
function validateStage(stage, index) {
  const errors = [];
  const warnings = [];
  const path = `stages[${index}]`;

  if (!stage.id) {
    errors.push(createError("MISSING_REQUIRED", "Stage missing id", path));
  } else if (!Object.values(Stage).includes(stage.id)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Invalid stage id: ${stage.id}`,
        `${path}.id`,
        stage.id,
      ),
    );
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

/**
 * Validate a self-assessment object
 * @param {import('./levels.js').SelfAssessment} selfAssessment - Self-assessment to validate
 * @param {import('./levels.js').Skill[]} skills - Array of valid skills
 * @param {import('./levels.js').Behaviour[]} behaviours - Array of valid behaviours
 * @returns {import('./levels.js').ValidationResult}
 */
export function validateSelfAssessment(selfAssessment, skills, behaviours) {
  const errors = [];
  const warnings = [];
  const skillIds = new Set(skills.map((s) => s.id));
  const behaviourIds = new Set(behaviours.map((b) => b.id));

  if (!selfAssessment) {
    return createValidationResult(false, [
      createError("MISSING_REQUIRED", "Self-assessment is required"),
    ]);
  }

  // Validate skill assessments
  if (
    !selfAssessment.skillLevels ||
    Object.keys(selfAssessment.skillLevels).length === 0
  ) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Self-assessment has no skill assessments",
      ),
    );
  } else {
    Object.entries(selfAssessment.skillLevels).forEach(([skillId, level]) => {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Self-assessment references non-existent skill: ${skillId}`,
            `selfAssessment.skillLevels.${skillId}`,
            skillId,
          ),
        );
      }
      if (getSkillLevelIndex(level) === -1) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Self-assessment has invalid skill level for ${skillId}: ${level}`,
            `selfAssessment.skillLevels.${skillId}`,
            level,
          ),
        );
      }
    });
  }

  // Validate behaviour assessments
  if (
    !selfAssessment.behaviourMaturities ||
    Object.keys(selfAssessment.behaviourMaturities).length === 0
  ) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Self-assessment has no behaviour assessments",
      ),
    );
  } else {
    Object.entries(selfAssessment.behaviourMaturities).forEach(
      ([behaviourId, maturity]) => {
        if (!behaviourIds.has(behaviourId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Self-assessment references non-existent behaviour: ${behaviourId}`,
              `selfAssessment.behaviourMaturities.${behaviourId}`,
              behaviourId,
            ),
          );
        }
        if (getBehaviourMaturityIndex(maturity) === -1) {
          errors.push(
            createError(
              "INVALID_VALUE",
              `Self-assessment has invalid behaviour maturity for ${behaviourId}: ${maturity}`,
              `selfAssessment.behaviourMaturities.${behaviourId}`,
              maturity,
            ),
          );
        }
      },
    );
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validate all data with referential integrity checks
 * @param {Object} data - All data to validate
 * @param {import('./levels.js').Driver[]} data.drivers - Drivers
 * @param {import('./levels.js').Behaviour[]} data.behaviours - Behaviours
 * @param {import('./levels.js').Skill[]} data.skills - Skills
 * @param {import('./levels.js').Discipline[]} data.disciplines - Disciplines
 * @param {import('./levels.js').Track[]} data.tracks - Tracks
 * @param {import('./levels.js').Grade[]} data.grades - Grades
 * @param {Object[]} data.capabilities - Capabilities
 * @param {Object[]} [data.stages] - Stages
 * @returns {import('./levels.js').ValidationResult}
 */
export function validateAllData({
  drivers,
  behaviours,
  skills,
  disciplines,
  tracks,
  grades,
  capabilities,
  stages,
}) {
  const allErrors = [];
  const allWarnings = [];

  // Build ID sets for reference validation
  const skillIds = new Set((skills || []).map((s) => s.id));
  const behaviourIds = new Set((behaviours || []).map((b) => b.id));
  const capabilityIds = new Set((capabilities || []).map((c) => c.id));

  // Extract stage IDs for agent skill validation
  const requiredStageIds = (stages || []).map((s) => s.id);

  // Validate skills
  if (!skills || skills.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one skill is required"),
    );
  } else {
    skills.forEach((skill, index) => {
      const { errors, warnings } = validateSkill(
        skill,
        index,
        requiredStageIds,
      );
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    skills.forEach((skill, index) => {
      if (skill.id) {
        if (seenIds.has(skill.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate skill ID: ${skill.id}`,
              `skills[${index}]`,
              skill.id,
            ),
          );
        }
        seenIds.add(skill.id);
      }
    });
  }

  // Validate behaviours
  if (!behaviours || behaviours.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one behaviour is required"),
    );
  } else {
    behaviours.forEach((behaviour, index) => {
      const { errors, warnings } = validateBehaviour(behaviour, index);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    behaviours.forEach((behaviour, index) => {
      if (behaviour.id) {
        if (seenIds.has(behaviour.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate behaviour ID: ${behaviour.id}`,
              `behaviours[${index}]`,
              behaviour.id,
            ),
          );
        }
        seenIds.add(behaviour.id);
      }
    });
  }

  // Get track IDs for discipline validation
  const trackIdSet = new Set((tracks || []).map((t) => t.id));

  // Get grade IDs for discipline and track validation
  const gradeIdSet = new Set((grades || []).map((g) => g.id));

  // Validate disciplines
  if (!disciplines || disciplines.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one discipline is required"),
    );
  } else {
    disciplines.forEach((discipline, index) => {
      const { errors, warnings } = validateDiscipline(
        discipline,
        index,
        skillIds,
        behaviourIds,
        trackIdSet,
        gradeIdSet,
      );
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    disciplines.forEach((discipline, index) => {
      if (discipline.id) {
        if (seenIds.has(discipline.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate discipline ID: ${discipline.id}`,
              `disciplines[${index}]`,
              discipline.id,
            ),
          );
        }
        seenIds.add(discipline.id);
      }
    });
  }

  // Get all skill IDs from disciplines for track validation
  const disciplineSkillIds = getAllDisciplineSkillIds(disciplines || []);

  // Validate tracks
  if (!tracks || tracks.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one track is required"),
    );
  } else {
    tracks.forEach((track, index) => {
      const { errors, warnings } = validateTrack(
        track,
        index,
        disciplineSkillIds,
        behaviourIds,
        gradeIdSet,
      );
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    tracks.forEach((track, index) => {
      if (track.id) {
        if (seenIds.has(track.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate track ID: ${track.id}`,
              `tracks[${index}]`,
              track.id,
            ),
          );
        }
        seenIds.add(track.id);
      }
    });
  }

  // Validate grades
  if (!grades || grades.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one grade is required"),
    );
  } else {
    grades.forEach((grade, index) => {
      const { errors, warnings } = validateGrade(grade, index);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    grades.forEach((grade, index) => {
      if (grade.id) {
        if (seenIds.has(grade.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate grade ID: ${grade.id}`,
              `grades[${index}]`,
              grade.id,
            ),
          );
        }
        seenIds.add(grade.id);
      }
    });
  }

  // Validate capabilities (required)
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

    // Check for duplicate IDs
    const seenIds = new Set();
    capabilities.forEach((capability, index) => {
      if (capability.id) {
        if (seenIds.has(capability.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate capability ID: ${capability.id}`,
              `capabilities[${index}]`,
              capability.id,
            ),
          );
        }
        seenIds.add(capability.id);
      }
    });

    // Validate skill capability references against loaded capabilities
    if (skills && skills.length > 0) {
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
  }

  // Validate stages (optional but validate if present)
  if (stages && stages.length > 0) {
    stages.forEach((stage, index) => {
      const { errors, warnings } = validateStage(stage, index);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    stages.forEach((stage, index) => {
      if (stage.id) {
        if (seenIds.has(stage.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate stage ID: ${stage.id}`,
              `stages[${index}]`,
              stage.id,
            ),
          );
        }
        seenIds.add(stage.id);
      }
    });

    // Validate handoff targets reference valid stages
    const stageIds = new Set(stages.map((s) => s.id));
    stages.forEach((stage, sIndex) => {
      if (stage.handoffs) {
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
      }
    });
  }

  // Validate drivers (required)
  if (!drivers || drivers.length === 0) {
    allErrors.push(
      createError("MISSING_REQUIRED", "At least one driver is required"),
    );
  } else {
    drivers.forEach((driver, index) => {
      const { errors, warnings } = validateDriver(
        driver,
        index,
        skillIds,
        behaviourIds,
      );
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    // Check for duplicate IDs
    const seenIds = new Set();
    drivers.forEach((driver, index) => {
      if (driver.id) {
        if (seenIds.has(driver.id)) {
          allErrors.push(
            createError(
              "DUPLICATE_ID",
              `Duplicate driver ID: ${driver.id}`,
              `drivers[${index}]`,
              driver.id,
            ),
          );
        }
        seenIds.add(driver.id);
      }
    });
  }

  return createValidationResult(allErrors.length === 0, allErrors, allWarnings);
}

/**
 * Validate question bank structure
 * @param {import('./levels.js').QuestionBank} questionBank - Question bank to validate
 * @param {import('./levels.js').Skill[]} skills - Valid skills
 * @param {import('./levels.js').Behaviour[]} behaviours - Valid behaviours
 * @returns {import('./levels.js').ValidationResult}
 */
export function validateQuestionBank(questionBank, skills, behaviours) {
  const errors = [];
  const warnings = [];
  const skillIds = new Set(skills.map((s) => s.id));
  const behaviourIds = new Set(behaviours.map((b) => b.id));

  if (!questionBank) {
    return createValidationResult(false, [
      createError("MISSING_REQUIRED", "Question bank is required"),
    ]);
  }

  // Validate skill questions
  if (questionBank.skillLevels) {
    Object.entries(questionBank.skillLevels).forEach(
      ([skillId, levelQuestions]) => {
        if (!skillIds.has(skillId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Question bank references non-existent skill: ${skillId}`,
              `questionBank.skillLevels.${skillId}`,
              skillId,
            ),
          );
        }
        Object.entries(levelQuestions || {}).forEach(([level, questions]) => {
          if (getSkillLevelIndex(level) === -1) {
            errors.push(
              createError(
                "INVALID_VALUE",
                `Question bank has invalid skill level: ${level}`,
                `questionBank.skillLevels.${skillId}.${level}`,
                level,
              ),
            );
          }
          if (!Array.isArray(questions) || questions.length === 0) {
            warnings.push(
              createWarning(
                "EMPTY_QUESTIONS",
                `No questions for skill ${skillId} at level ${level}`,
                `questionBank.skillLevels.${skillId}.${level}`,
              ),
            );
          }
        });
      },
    );
  }

  // Validate behaviour questions
  if (questionBank.behaviourMaturities) {
    Object.entries(questionBank.behaviourMaturities).forEach(
      ([behaviourId, maturityQuestions]) => {
        if (!behaviourIds.has(behaviourId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Question bank references non-existent behaviour: ${behaviourId}`,
              `questionBank.behaviourMaturities.${behaviourId}`,
              behaviourId,
            ),
          );
        }
        Object.entries(maturityQuestions || {}).forEach(
          ([maturity, questions]) => {
            if (getBehaviourMaturityIndex(maturity) === -1) {
              errors.push(
                createError(
                  "INVALID_VALUE",
                  `Question bank has invalid behaviour maturity: ${maturity}`,
                  `questionBank.behaviourMaturities.${behaviourId}.${maturity}`,
                  maturity,
                ),
              );
            }
            if (!Array.isArray(questions) || questions.length === 0) {
              warnings.push(
                createWarning(
                  "EMPTY_QUESTIONS",
                  `No questions for behaviour ${behaviourId} at maturity ${maturity}`,
                  `questionBank.behaviourMaturities.${behaviourId}.${maturity}`,
                ),
              );
            }
          },
        );
      },
    );
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validate agent-specific data comprehensively
 * This validates cross-references between human and agent definitions
 * @param {Object} params - Validation parameters
 * @param {Object} params.humanData - Human data (disciplines, tracks, skills, behaviours, stages)
 * @param {Object} params.agentData - Agent-specific data (disciplines, tracks, behaviours with agent sections)
 * @returns {import('./levels.js').ValidationResult}
 */
export function validateAgentData({ humanData, agentData }) {
  const errors = [];
  const warnings = [];

  const humanDisciplineIds = new Set(
    (humanData.disciplines || []).map((d) => d.id),
  );
  const humanTrackIds = new Set((humanData.tracks || []).map((t) => t.id));
  const humanBehaviourIds = new Set(
    (humanData.behaviours || []).map((b) => b.id),
  );
  const stageIds = new Set((humanData.stages || []).map((s) => s.id));

  // Validate agent disciplines reference human disciplines
  for (const agentDiscipline of agentData.disciplines || []) {
    if (!humanDisciplineIds.has(agentDiscipline.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent discipline '${agentDiscipline.id}' has no human definition`,
          `agentData.disciplines`,
          agentDiscipline.id,
        ),
      );
    }

    // Validate required identity exists (spread from agent section by loader)
    if (!agentDiscipline.identity) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent discipline '${agentDiscipline.id}' missing identity`,
          `agentData.disciplines.${agentDiscipline.id}.identity`,
        ),
      );
    }
  }

  // Validate agent tracks reference human tracks
  for (const agentTrack of agentData.tracks || []) {
    if (!humanTrackIds.has(agentTrack.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent track '${agentTrack.id}' has no human definition`,
          `agentData.tracks`,
          agentTrack.id,
        ),
      );
    }
  }

  // Validate agent behaviours reference human behaviours
  for (const agentBehaviour of agentData.behaviours || []) {
    if (!humanBehaviourIds.has(agentBehaviour.id)) {
      errors.push(
        createError(
          "ORPHANED_AGENT",
          `Agent behaviour '${agentBehaviour.id}' has no human definition`,
          `agentData.behaviours`,
          agentBehaviour.id,
        ),
      );
    }

    // Validate required agent fields (spread from agent section by loader)
    if (!agentBehaviour.title) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent behaviour '${agentBehaviour.id}' missing title`,
          `agentData.behaviours.${agentBehaviour.id}.title`,
        ),
      );
    }
    if (!agentBehaviour.workingStyle) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `Agent behaviour '${agentBehaviour.id}' missing workingStyle`,
          `agentData.behaviours.${agentBehaviour.id}.workingStyle`,
        ),
      );
    }
  }

  // Validate skills with agent sections have complete stage coverage
  const skillsWithAgent = (humanData.skills || []).filter((s) => s.agent);
  const requiredStages = ["plan", "code", "review"];

  for (const skill of skillsWithAgent) {
    const stages = skill.agent.stages || {};
    const missingStages = requiredStages.filter((stage) => !stages[stage]);

    if (missingStages.length > 0) {
      warnings.push(
        createWarning(
          "INCOMPLETE_STAGES",
          `Skill '${skill.id}' agent section missing stages: ${missingStages.join(", ")}`,
          `skills.${skill.id}.agent.stages`,
        ),
      );
    }

    // Validate each stage has required fields
    for (const [stageId, stageData] of Object.entries(stages)) {
      if (!stageData.focus) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            `Skill '${skill.id}' agent stage '${stageId}' missing focus`,
            `skills.${skill.id}.agent.stages.${stageId}.focus`,
          ),
        );
      }
      if (
        !stageData.activities ||
        !Array.isArray(stageData.activities) ||
        stageData.activities.length === 0
      ) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            `Skill '${skill.id}' agent stage '${stageId}' missing or empty activities`,
            `skills.${skill.id}.agent.stages.${stageId}.activities`,
          ),
        );
      }
      if (
        !stageData.ready ||
        !Array.isArray(stageData.ready) ||
        stageData.ready.length === 0
      ) {
        errors.push(
          createError(
            "MISSING_REQUIRED",
            `Skill '${skill.id}' agent stage '${stageId}' missing or empty ready criteria`,
            `skills.${skill.id}.agent.stages.${stageId}.ready`,
          ),
        );
      }
    }
  }

  // Validate stage handoff targets exist
  for (const stage of humanData.stages || []) {
    if (stage.handoffs) {
      for (const handoff of stage.handoffs) {
        const targetId = handoff.targetStage || handoff.target;
        if (targetId && !stageIds.has(targetId)) {
          errors.push(
            createError(
              "INVALID_REFERENCE",
              `Stage '${stage.id}' handoff references unknown stage '${targetId}'`,
              `stages.${stage.id}.handoffs`,
              targetId,
            ),
          );
        }
      }
    }
  }

  // Summary statistics as warnings (informational)
  const stats = {
    agentDisciplines: (agentData.disciplines || []).length,
    agentTracks: (agentData.tracks || []).length,
    agentBehaviours: (agentData.behaviours || []).length,
    skillsWithAgent: skillsWithAgent.length,
    skillsWithCompleteStages: skillsWithAgent.filter((s) => {
      const stages = s.agent.stages || {};
      return requiredStages.every((stage) => stages[stage]);
    }).length,
  };

  if (stats.skillsWithCompleteStages < stats.skillsWithAgent) {
    warnings.push(
      createWarning(
        "INCOMPLETE_COVERAGE",
        `${stats.skillsWithCompleteStages}/${stats.skillsWithAgent} skills have complete stage coverage (plan, code, review)`,
        "agentData",
      ),
    );
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}
