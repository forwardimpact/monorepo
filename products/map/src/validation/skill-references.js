import { createError } from "./common.js";

const REFERENCE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateName(entry, entryPath, seenNames) {
  if (entry.name === undefined) {
    return createError(
      "MISSING_REQUIRED",
      "Reference entry missing name",
      `${entryPath}.name`,
    );
  }
  if (typeof entry.name !== "string") {
    return createError(
      "INVALID_VALUE",
      "Reference name must be a string",
      `${entryPath}.name`,
      entry.name,
    );
  }
  if (
    entry.name.length < 1 ||
    entry.name.length > 64 ||
    !REFERENCE_NAME_PATTERN.test(entry.name)
  ) {
    return createError(
      "INVALID_VALUE",
      "Reference name must match ^[a-z0-9][a-z0-9_-]*$ with length 1–64",
      `${entryPath}.name`,
      entry.name,
    );
  }
  const lower = entry.name.toLowerCase();
  if (seenNames.has(lower)) {
    return createError(
      "INVALID_VALUE",
      `Duplicate reference name (case-insensitive): ${entry.name}`,
      `${entryPath}.name`,
      entry.name,
    );
  }
  seenNames.add(lower);
  return null;
}

function validateRequiredString(value, entryPath, fieldName, allowWhitespace) {
  if (value === undefined) {
    return createError(
      "MISSING_REQUIRED",
      `Reference entry missing ${fieldName}`,
      `${entryPath}.${fieldName}`,
    );
  }
  if (typeof value !== "string") {
    return createError(
      "INVALID_VALUE",
      `Reference ${fieldName} must be a string`,
      `${entryPath}.${fieldName}`,
      value,
    );
  }
  if (value.length === 0) {
    return createError(
      "INVALID_VALUE",
      `Reference ${fieldName} must be a non-empty string`,
      `${entryPath}.${fieldName}`,
      value,
    );
  }
  if (!allowWhitespace && /^\s*$/.test(value)) {
    return createError(
      "INVALID_VALUE",
      `Reference ${fieldName} must be a non-empty (non-whitespace) string`,
      `${entryPath}.${fieldName}`,
      value,
    );
  }
  return null;
}

function validateEntry(entry, entryPath, seenNames) {
  const errors = [];
  if (!isPlainObject(entry)) {
    errors.push(
      createError(
        "INVALID_VALUE",
        "Reference entry must be an object",
        entryPath,
        entry,
      ),
    );
    return errors;
  }

  const nameErr = validateName(entry, entryPath, seenNames);
  if (nameErr) errors.push(nameErr);

  const titleErr = validateRequiredString(
    entry.title,
    entryPath,
    "title",
    true,
  );
  if (titleErr) errors.push(titleErr);

  const bodyErr = validateRequiredString(entry.body, entryPath, "body", false);
  if (bodyErr) errors.push(bodyErr);

  return errors;
}

/**
 * Reject the deprecated top-level `implementationReference` field. The
 * message points at `skill.references`.
 */
export function validateSkillDeprecatedFields(skill, path) {
  if (skill.implementationReference === undefined) return [];
  return [
    createError(
      "INVALID_FIELD",
      "Skill 'implementationReference' field is no longer supported. Use skill.references instead.",
      `${path}.implementationReference`,
    ),
  ];
}

/**
 * Validate `skill.references`. It is an optional array of
 * `{name, title, body}` entries. The generator emits one file per entry
 * under `references/{name}.md`.
 */
export function validateSkillReferences(skill, path) {
  if (skill.references === undefined || skill.references === null) return [];

  if (!Array.isArray(skill.references)) {
    return [
      createError(
        "INVALID_VALUE",
        "Skill references must be an array",
        `${path}.references`,
        skill.references,
      ),
    ];
  }

  const errors = [];
  const seenNames = new Set();
  skill.references.forEach((entry, i) => {
    errors.push(...validateEntry(entry, `${path}.references[${i}]`, seenNames));
  });
  return errors;
}
