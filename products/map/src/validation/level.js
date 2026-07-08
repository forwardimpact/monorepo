import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/libskill/levels";

import { createError, createWarning } from "./common.js";

/**
 * @param {import('@forwardimpact/libskill/levels').Level} level
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
    ["core", "supporting", "broad"].forEach((type) => {
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

const EXPECTED_LEVELS = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];

/**
 * Validate a responsibilities block (professional or management) against
 * expected proficiency levels.
 * @param {object|undefined} responsibilities
 * @param {string} fieldName - e.g. "professionalResponsibilities"
 * @param {string} label - human-readable label, e.g. "professional"
 * @param {string} path - parent JSON path
 * @returns {Array} warnings
 */
function validateResponsibilities(responsibilities, fieldName, label, path) {
  const warnings = [];

  if (!responsibilities) {
    warnings.push(
      createWarning(
        "MISSING_OPTIONAL",
        `Capability missing ${fieldName}`,
        `${path}.${fieldName}`,
      ),
    );
    return warnings;
  }

  for (const level of EXPECTED_LEVELS) {
    if (!responsibilities[level]) {
      warnings.push(
        createWarning(
          "MISSING_OPTIONAL",
          `Capability missing ${level} ${label} responsibility`,
          `${path}.${fieldName}.${level}`,
        ),
      );
    }
  }

  return warnings;
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

  warnings.push(
    ...validateResponsibilities(
      capability.professionalResponsibilities,
      "professionalResponsibilities",
      "professional",
      path,
    ),
  );
  warnings.push(
    ...validateResponsibilities(
      capability.managementResponsibilities,
      "managementResponsibilities",
      "management",
      path,
    ),
  );

  return { errors, warnings };
}

export const CONTRACT_URL =
  "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions";

const PROFESSIONAL_TITLE_SHAPE =
  /^(?:Level [IVX]+|Level \d+|Senior (?:Staff|Principal)|[A-Z][a-z]+)$/;

/** @param {string} value */
export function checkProfessionalTitleShape(value) {
  if (typeof value !== "string" || !PROFESSIONAL_TITLE_SHAPE.test(value)) {
    return {
      ok: false,
      reason: `professionalTitle must be a single capitalised rank word, a "Senior Staff"/"Senior Principal" seniority-qualified rank, or "Level <numeral>"; got ${JSON.stringify(value)}`,
    };
  }
  return { ok: true };
}

function tokenise(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t !== "level");
}

/** @param {{professionalTitle: string}} level @param {Array<{roleTitle: string}>} disciplines */
export function checkProfessionalTitleDisjoint(level, disciplines) {
  const titleTokens = new Set(tokenise(level.professionalTitle));
  for (const discipline of disciplines || []) {
    const roleTokens = tokenise(discipline.roleTitle);
    const overlap = roleTokens.filter((t) => titleTokens.has(t));
    if (overlap.length > 0) {
      return {
        ok: false,
        reason: `professionalTitle ${JSON.stringify(level.professionalTitle)} shares token "${overlap[0]}" with discipline "${discipline.id}" roleTitle ${JSON.stringify(discipline.roleTitle)}`,
      };
    }
  }
  return { ok: true };
}

const AUTONOMY_THIRD_PERSON = /^[A-Z][a-z]*[^s]s$/;

/** @param {string} value */
export function checkAutonomyExpectation(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: true };
  }
  const firstToken = value.split(/\s+/)[0];
  if (firstToken === "Is" || AUTONOMY_THIRD_PERSON.test(firstToken)) {
    return {
      ok: false,
      reason: `autonomyExpectation must open with a base-form verb (e.g. "Work…"); got third-person opener ${JSON.stringify(firstToken)}`,
    };
  }
  return { ok: true };
}
