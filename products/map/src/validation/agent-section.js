import { createError } from "./common.js";

/**
 * Validate agent identity/priority/constraints section (shared by discipline and track)
 * @param {Object} agent
 * @param {string} agentPath
 * @param {string} entityName
 * @returns {Array}
 */
export function validateAgentIdentitySection(agent, agentPath, entityName) {
  const errors = [];
  const requireIdentity = entityName === "Discipline";

  if (requireIdentity) {
    if (!agent.identity) {
      errors.push(
        createError(
          "MISSING_REQUIRED",
          `${entityName} agent section missing identity`,
          `${agentPath}.identity`,
        ),
      );
    } else if (typeof agent.identity !== "string") {
      errors.push(
        createError(
          "INVALID_VALUE",
          `${entityName} agent identity must be a string`,
          `${agentPath}.identity`,
          agent.identity,
        ),
      );
    }
  } else if (
    agent.identity !== undefined &&
    typeof agent.identity !== "string"
  ) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `${entityName} agent identity must be a string`,
        `${agentPath}.identity`,
        agent.identity,
      ),
    );
  }

  if (agent.priority !== undefined && typeof agent.priority !== "string") {
    errors.push(
      createError(
        "INVALID_VALUE",
        `${entityName} agent priority must be a string`,
        `${agentPath}.priority`,
        agent.priority,
      ),
    );
  }

  if (agent.constraints !== undefined) {
    if (!Array.isArray(agent.constraints)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `${entityName} agent constraints must be an array`,
          `${agentPath}.constraints`,
          agent.constraints,
        ),
      );
    } else {
      agent.constraints.forEach((item, i) => {
        if (typeof item !== "string") {
          errors.push(
            createError(
              "INVALID_VALUE",
              `${entityName} agent constraints items must be strings`,
              `${agentPath}.constraints[${i}]`,
              item,
            ),
          );
        }
      });
    }
  }

  if (agent.coreInstructions !== undefined) {
    errors.push(
      createError(
        "INVALID_FIELD",
        `${entityName} agent 'coreInstructions' field is not supported. Use identity, priority, and constraints instead.`,
        `${agentPath}.coreInstructions`,
      ),
    );
  }

  return errors;
}
