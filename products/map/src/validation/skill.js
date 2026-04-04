import { Capability, SKILL_PROFICIENCY_ORDER } from "../levels.js";

import { createError, createWarning } from "./common.js";

function validateSkillBasicFields(skill, path) {
  const errors = [];
  const warnings = [];

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
  if (!skill.proficiencyDescriptions) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        "Skill missing level descriptions",
        `${path}.proficiencyDescriptions`,
      ),
    );
  }

  return { errors, warnings };
}

function validateStageFields(stageId, stageData, stagePath) {
  const errors = [];

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

  if (!stageData.readChecklist) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Stage ${stageId} missing readChecklist`,
        `${stagePath}.readChecklist`,
      ),
    );
  } else if (!Array.isArray(stageData.readChecklist)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Stage ${stageId} readChecklist must be an array`,
        `${stagePath}.readChecklist`,
        stageData.readChecklist,
      ),
    );
  }

  if (!stageData.confirmChecklist) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        `Stage ${stageId} missing confirmChecklist`,
        `${stagePath}.confirmChecklist`,
      ),
    );
  } else if (!Array.isArray(stageData.confirmChecklist)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Stage ${stageId} confirmChecklist must be an array`,
        `${stagePath}.confirmChecklist`,
        stageData.confirmChecklist,
      ),
    );
  }

  return errors;
}

function validateSkillAgentStages(skill, agentPath, requiredStageIds) {
  const errors = [];

  if (!skill.agent.stages) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill agent section missing stages",
        `${agentPath}.stages`,
      ),
    );
    return errors;
  }

  if (typeof skill.agent.stages !== "object") {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill agent stages must be an object",
        `${agentPath}.stages`,
        skill.agent.stages,
      ),
    );
    return errors;
  }

  for (const [stageId, stageData] of Object.entries(skill.agent.stages)) {
    if (requiredStageIds.length > 0 && !requiredStageIds.includes(stageId)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Invalid stage ID: ${stageId}. Must be one of: ${requiredStageIds.join(", ")}`,
          `${agentPath}.stages.${stageId}`,
          stageId,
        ),
      );
      continue;
    }
    errors.push(
      ...validateStageFields(
        stageId,
        stageData,
        `${agentPath}.stages.${stageId}`,
      ),
    );
  }

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

  return errors;
}

function validateSkillAgentDeprecatedFields(agentPath, agent) {
  const errors = [];
  const deprecated = [
    ["reference", "Use skill.implementationReference instead."],
    ["body", "Use stages instead."],
    ["applicability", "Use stages instead."],
    ["guidance", "Use stages instead."],
    ["verificationCriteria", "Use stages.{stage}.confirmChecklist instead."],
  ];

  for (const [field, hint] of deprecated) {
    if (agent[field] !== undefined) {
      errors.push(
        createError(
          "INVALID_FIELD",
          `Skill agent '${field}' field is not supported. ${hint}`,
          `${agentPath}.${field}`,
        ),
      );
    }
  }

  return errors;
}

function validateSkillAgentSection(skill, path, requiredStageIds) {
  const errors = [];
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

  errors.push(...validateSkillAgentStages(skill, agentPath, requiredStageIds));
  errors.push(...validateSkillAgentDeprecatedFields(agentPath, skill.agent));

  return errors;
}

function validateSkillOptionalStringFields(skill, path) {
  const errors = [];
  const stringFields = [
    "implementationReference",
    "instructions",
    "installScript",
  ];

  for (const field of stringFields) {
    if (skill[field] !== undefined && typeof skill[field] !== "string") {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Skill ${field} must be a string`,
          `${path}.${field}`,
          skill[field],
        ),
      );
    }
  }

  if (
    typeof skill.implementationReference === "string" &&
    skill.implementationReference.includes("<scaffolding_steps>")
  ) {
    errors.push(
      createError(
        "INVALID_FIELD",
        "Skill implementationReference contains <scaffolding_steps> tags. Extract install commands to skill.installScript instead.",
        `${path}.implementationReference`,
      ),
    );
  }

  return errors;
}

function validateSkillToolReferences(skill, path) {
  const errors = [];

  if (skill.toolReferences === undefined) return errors;

  if (!Array.isArray(skill.toolReferences)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill toolReferences must be an array",
        `${path}.toolReferences`,
        skill.toolReferences,
      ),
    );
    return errors;
  }

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

  return errors;
}

function validateSkillMarkers(skill, path) {
  const errors = [];

  if (skill.markers === undefined) return errors;

  if (typeof skill.markers !== "object" || Array.isArray(skill.markers)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill markers must be an object keyed by proficiency level",
        `${path}.markers`,
        skill.markers,
      ),
    );
    return errors;
  }

  for (const [level, levelMarkers] of Object.entries(skill.markers)) {
    if (!SKILL_PROFICIENCY_ORDER.includes(level)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Invalid marker level: ${level}. Must be one of: ${SKILL_PROFICIENCY_ORDER.join(", ")}`,
          `${path}.markers.${level}`,
          level,
        ),
      );
      continue;
    }
    if (typeof levelMarkers !== "object" || Array.isArray(levelMarkers)) {
      errors.push(
        createError(
          "INVALID_VALUE",
          `Markers at level ${level} must be an object with human/agent arrays`,
          `${path}.markers.${level}`,
          levelMarkers,
        ),
      );
      continue;
    }
    for (const section of ["human", "agent"]) {
      if (
        levelMarkers[section] !== undefined &&
        !Array.isArray(levelMarkers[section])
      ) {
        errors.push(
          createError(
            "INVALID_VALUE",
            `Markers ${section} at level ${level} must be an array of strings`,
            `${path}.markers.${level}.${section}`,
            levelMarkers[section],
          ),
        );
      }
    }
  }

  return errors;
}

/**
 * @param {import('../levels.js').Skill} skill
 * @param {number} index
 * @param {string[]} [requiredStageIds]
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateSkill(skill, index, requiredStageIds = []) {
  const path = `skills[${index}]`;
  const { errors, warnings } = validateSkillBasicFields(skill, path);

  if (skill.agent) {
    errors.push(...validateSkillAgentSection(skill, path, requiredStageIds));
  }

  errors.push(...validateSkillOptionalStringFields(skill, path));
  errors.push(...validateSkillToolReferences(skill, path));
  errors.push(...validateSkillMarkers(skill, path));

  return { errors, warnings };
}
