import { createError, createWarning } from "./common.js";

/**
 * @param {import('../levels.js').Behaviour} behaviour
 * @param {number} index
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateBehaviour(behaviour, index) {
  const errors = [];
  const warnings = [];
  const path = `behaviours[${index}]`;

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

  if (behaviour.agent) {
    const agentPath = `${path}.agent`;

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
