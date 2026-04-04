/**
 * Agent Profile and Skill Validation
 *
 * Pure functions for validating agent profiles and skills against
 * Claude Code spec constraints. Extracted from agent.js for max-lines compliance.
 */

/**
 * Estimate total character length of bodyData fields
 * @param {Object} bodyData - Structured profile body data
 * @returns {number} Estimated character count
 */
function estimateBodyDataLength(bodyData) {
  let length = 0;

  const stringFields = [
    "title",
    "stageDescription",
    "identity",
    "priority",
    "roleContext",
    "workingStyle",
  ];
  for (const field of stringFields) {
    if (bodyData[field]) {
      length += bodyData[field].length;
    }
  }

  if (bodyData.skillIndex) {
    for (const skill of bodyData.skillIndex) {
      length +=
        skill.name.length + skill.dirname.length + skill.useWhen.length + 50;
    }
  }
  if (bodyData.stageConstraints) {
    for (const c of bodyData.stageConstraints) {
      length += c.length + 2;
    }
  }
  if (bodyData.disciplineConstraints) {
    for (const c of bodyData.disciplineConstraints) {
      length += c.length + 2;
    }
  }
  if (bodyData.trackConstraints) {
    for (const c of bodyData.trackConstraints) {
      length += c.length + 2;
    }
  }

  return length;
}

/**
 * Validate agent profile against Claude Code spec constraints
 * @param {Object} profile - Generated profile
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentProfile(profile) {
  const errors = [];

  if (!profile.frontmatter.name) {
    errors.push("Missing required field: name");
  }

  if (!profile.frontmatter.description) {
    errors.push("Missing required field: description");
  }

  if (profile.frontmatter.name) {
    if (!/^[a-zA-Z0-9._-]+$/.test(profile.frontmatter.name)) {
      errors.push("Name contains invalid characters");
    }
  }

  if (
    profile.frontmatter.model &&
    !["sonnet", "opus", "haiku", "inherit"].includes(profile.frontmatter.model)
  ) {
    errors.push("Model must be one of: sonnet, opus, haiku, inherit");
  }

  if (
    profile.frontmatter.skills &&
    !Array.isArray(profile.frontmatter.skills)
  ) {
    errors.push("Skills must be an array");
  }

  const bodyLength = estimateBodyDataLength(profile.bodyData);
  if (bodyLength > 30000) {
    errors.push(`Body exceeds 30,000 character limit (${bodyLength})`);
  }

  return errors;
}

/**
 * Validate agent skill against spec constraints
 * @param {Object} skill - Generated skill
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateAgentSkill(skill) {
  const errors = [];

  if (!skill.frontmatter.name) {
    errors.push("Missing required field: name");
  } else {
    const name = skill.frontmatter.name;

    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push("Name must be lowercase alphanumeric with hyphens");
    }
    if (name.length > 64) {
      errors.push("Name exceeds 64 character limit");
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      errors.push("Name cannot start or end with hyphen");
    }
    if (name.includes("--")) {
      errors.push("Name cannot contain consecutive hyphens");
    }
  }

  if (!skill.frontmatter.description) {
    errors.push("Missing required field: description");
  } else if (skill.frontmatter.description.length > 1024) {
    errors.push("Description exceeds 1024 character limit");
  }

  return errors;
}
