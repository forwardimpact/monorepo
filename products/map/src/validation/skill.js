import {
  Capability,
  SKILL_PROFICIENCY_ORDER,
} from "@forwardimpact/libskill/levels";

import { createError, createWarning } from "./common.js";
import {
  validateSkillReferences,
  validateSkillDeprecatedFields,
} from "./skill-references.js";

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

function validateSkillAgentFlatFields(skill, agentPath) {
  const errors = [];

  if (skill.agent.stages) {
    errors.push(
      createError(
        "INVALID_FIELD",
        "Skill agent uses deprecated stages nesting — flatten to agent.focus/readChecklist/confirmChecklist",
        `${agentPath}.stages`,
      ),
    );
  }

  if (!skill.agent.focus) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill agent missing focus",
        `${agentPath}.focus`,
      ),
    );
  } else if (typeof skill.agent.focus !== "string") {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill agent focus must be a string",
        `${agentPath}.focus`,
        skill.agent.focus,
      ),
    );
  }

  if (!skill.agent.readChecklist) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill agent missing readChecklist",
        `${agentPath}.readChecklist`,
      ),
    );
  } else if (!Array.isArray(skill.agent.readChecklist)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill agent readChecklist must be an array",
        `${agentPath}.readChecklist`,
        skill.agent.readChecklist,
      ),
    );
  }

  if (!skill.agent.confirmChecklist) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill agent missing confirmChecklist",
        `${agentPath}.confirmChecklist`,
      ),
    );
  } else if (!Array.isArray(skill.agent.confirmChecklist)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Skill agent confirmChecklist must be an array",
        `${agentPath}.confirmChecklist`,
        skill.agent.confirmChecklist,
      ),
    );
  }

  return errors;
}

function validateSkillAgentDeprecatedFields(agentPath, agent) {
  const errors = [];
  const deprecated = [
    ["reference", "Use skill.references instead."],
    ["body", "Use agent.focus instead."],
    ["applicability", "Use agent.focus instead."],
    ["guidance", "Use agent.focus instead."],
    ["verificationCriteria", "Use agent.confirmChecklist instead."],
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

function validateSkillAgentSection(skill, path) {
  const errors = [];
  const agentPath = `${path}.agent`;

  if (!skill.agent.description) {
    errors.push(
      createError(
        "MISSING_REQUIRED",
        "Skill agent section missing description",
        `${agentPath}.description`,
      ),
    );
  }

  errors.push(...validateSkillAgentFlatFields(skill, agentPath));
  errors.push(...validateSkillAgentDeprecatedFields(agentPath, skill.agent));

  return errors;
}

function validateSkillOptionalStringFields(skill, path) {
  const errors = [];
  const stringFields = ["instructions", "installScript"];

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

function validateMarkerLevel(level, levelMarkers, markersPath) {
  const errors = [];

  if (!SKILL_PROFICIENCY_ORDER.includes(level)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Invalid marker level: ${level}. Must be one of: ${SKILL_PROFICIENCY_ORDER.join(", ")}`,
        `${markersPath}.${level}`,
        level,
      ),
    );
    return errors;
  }

  if (typeof levelMarkers !== "object" || Array.isArray(levelMarkers)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        `Markers at level ${level} must be an object with human/agent arrays`,
        `${markersPath}.${level}`,
        levelMarkers,
      ),
    );
    return errors;
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
          `${markersPath}.${level}.${section}`,
          levelMarkers[section],
        ),
      );
    }
  }

  return errors;
}

function validateSkillMarkers(skill, path) {
  if (skill.markers === undefined) return [];

  if (typeof skill.markers !== "object" || Array.isArray(skill.markers)) {
    return [
      createError(
        "INVALID_VALUE",
        "Skill markers must be an object keyed by proficiency level",
        `${path}.markers`,
        skill.markers,
      ),
    ];
  }

  const errors = [];
  const markersPath = `${path}.markers`;
  for (const [level, levelMarkers] of Object.entries(skill.markers)) {
    errors.push(...validateMarkerLevel(level, levelMarkers, markersPath));
  }
  return errors;
}

/**
 * @param {import('@forwardimpact/libskill/levels').Skill} skill
 * @param {number} index
 * @param {string[]} [requiredStageIds]
 * @returns {{errors: Array, warnings: Array}}
 */
export function validateSkill(skill, index) {
  const path = `skills[${index}]`;
  const { errors, warnings } = validateSkillBasicFields(skill, path);

  if (skill.agent) {
    errors.push(...validateSkillAgentSection(skill, path));
  }

  errors.push(...validateSkillOptionalStringFields(skill, path));
  errors.push(...validateSkillDeprecatedFields(skill, path));
  errors.push(...validateSkillReferences(skill, path));
  errors.push(...validateSkillToolReferences(skill, path));
  errors.push(...validateSkillMarkers(skill, path));

  return { errors, warnings };
}
