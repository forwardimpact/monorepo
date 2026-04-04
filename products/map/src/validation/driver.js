import { createError, createWarning } from "./common.js";

/**
 * @param {import('../levels.js').Driver} driver
 * @param {number} index
 * @param {Set<string>} skillIds
 * @param {Set<string>} behaviourIds
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateDriver(driver, index, skillIds, behaviourIds) {
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
