/**
 * Schema-based Validation for Engineering Pathway
 *
 * Validates YAML data files against JSON schemas using Ajv.
 * Replaces custom validation with declarative schema validation.
 */

import { readFile, readdir, stat } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaDir = join(__dirname, "../schema/json");

/**
 * Schema mappings for different file types
 * Maps directory/file patterns to schema files
 */
const SCHEMA_MAPPINGS = {
  // Single files at root of data directory
  "drivers.yaml": "drivers.schema.json",
  "grades.yaml": "grades.schema.json",
  "stages.yaml": "stages.schema.json",
  "framework.yaml": "framework.schema.json",
  "self-assessments.yaml": "self-assessments.schema.json",
  // Directories - each file in directory uses the schema
  capabilities: "capability.schema.json",
  disciplines: "discipline.schema.json",
  tracks: "track.schema.json",
  behaviours: "behaviour.schema.json",
  "questions/skills": "skill-questions.schema.json",
  "questions/behaviours": "behaviour-questions.schema.json",
};

/**
 * Create a validation result object
 * @param {boolean} valid - Whether validation passed
 * @param {Array<{type: string, message: string, path?: string}>} errors - Array of errors
 * @param {Array<{type: string, message: string, path?: string}>} warnings - Array of warnings
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
function createValidationResult(valid, errors = [], warnings = []) {
  return { valid, errors, warnings };
}

/**
 * Create a validation error
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {string} [path] - Path to invalid data
 * @returns {{type: string, message: string, path?: string}}
 */
function createError(type, message, path) {
  const error = { type, message };
  if (path !== undefined) error.path = path;
  return error;
}

/**
 * Create a validation warning
 * @param {string} type - Warning type
 * @param {string} message - Warning message
 * @param {string} [path] - Path to concerning data
 * @returns {{type: string, message: string, path?: string}}
 */
function createWarning(type, message, path) {
  const warning = { type, message };
  if (path !== undefined) warning.path = path;
  return warning;
}

/**
 * Check if a path exists and is a directory
 * @param {string} path - Path to check
 * @returns {Promise<boolean>}
 */
async function isDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a file exists
 * @param {string} path - Path to check
 * @returns {Promise<boolean>}
 */
async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and parse a JSON schema
 * @param {string} schemaPath - Path to the schema file
 * @returns {Promise<Object>} Parsed schema
 */
async function loadSchema(schemaPath) {
  const content = await readFile(schemaPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load and parse a YAML file
 * @param {string} filePath - Path to the YAML file
 * @returns {Promise<any>} Parsed YAML content
 */
async function loadYamlFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return parseYaml(content);
}

/**
 * Format Ajv errors into readable messages
 * @param {import('ajv').ErrorObject[]} ajvErrors - Ajv error objects
 * @param {string} filePath - File being validated
 * @returns {Array<{type: string, message: string, path?: string}>}
 */
function formatAjvErrors(ajvErrors, filePath) {
  return ajvErrors.map((err) => {
    const path = err.instancePath ? `${filePath}${err.instancePath}` : filePath;
    let message = err.message || "Unknown error";

    // Add context for specific error types
    if (err.keyword === "additionalProperties") {
      message = `${message}: '${err.params.additionalProperty}'`;
    } else if (err.keyword === "enum") {
      message = `${message}. Allowed: ${err.params.allowedValues.join(", ")}`;
    } else if (err.keyword === "pattern") {
      message = `${message}. Pattern: ${err.params.pattern}`;
    }

    return createError("SCHEMA_VALIDATION", message, path);
  });
}

/**
 * Create and configure an Ajv instance with all schemas loaded
 * @returns {Promise<Ajv>}
 */
async function createValidator() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);

  // Load all schema files
  const schemaFiles = await readdir(schemaDir);
  for (const file of schemaFiles.filter((f) => f.endsWith(".schema.json"))) {
    const schema = await loadSchema(join(schemaDir, file));
    ajv.addSchema(schema);
  }

  return ajv;
}

/**
 * Validate a single file against a schema
 * @param {Ajv} ajv - Configured Ajv instance
 * @param {string} filePath - Path to the YAML file
 * @param {string} schemaId - Schema $id to validate against
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateFile(ajv, filePath, schemaId) {
  const data = await loadYamlFile(filePath);
  const validate = ajv.getSchema(schemaId);

  if (!validate) {
    return {
      valid: false,
      errors: [
        createError("SCHEMA_NOT_FOUND", `Schema not found: ${schemaId}`),
      ],
    };
  }

  const valid = validate(data);
  const errors = valid ? [] : formatAjvErrors(validate.errors || [], filePath);

  return { valid, errors };
}

/**
 * Validate all files in a directory against a schema
 * @param {Ajv} ajv - Configured Ajv instance
 * @param {string} dirPath - Path to the directory
 * @param {string} schemaId - Schema $id to validate against
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateDirectory(ajv, dirPath, schemaId) {
  const files = await readdir(dirPath);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const allErrors = [];
  let allValid = true;

  for (const file of yamlFiles) {
    const filePath = join(dirPath, file);
    const result = await validateFile(ajv, filePath, schemaId);
    if (!result.valid) {
      allValid = false;
      allErrors.push(...result.errors);
    }
  }

  return { valid: allValid, errors: allErrors };
}

/**
 * Build the schema $id from the schema filename
 * @param {string} schemaFilename - Schema filename (e.g., "capability.schema.json")
 * @returns {string} Full schema $id URL
 */
function getSchemaId(schemaFilename) {
  return `https://www.forwardimpact.team/schema/json/${schemaFilename}`;
}

/**
 * Validate a data directory against JSON schemas
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array, stats: Object}>}
 */
export async function validateDataDirectory(dataDir) {
  const ajv = await createValidator();
  const allErrors = [];
  const warnings = [];
  const stats = {
    filesValidated: 0,
    schemasUsed: new Set(),
  };

  // Validate single files at root level
  for (const [filename, schemaFile] of Object.entries(SCHEMA_MAPPINGS)) {
    // Skip directory mappings
    if (!filename.includes(".yaml")) continue;

    const filePath = join(dataDir, filename);
    if (!(await fileExists(filePath))) {
      // Some files are optional
      if (!["self-assessments.yaml"].includes(filename)) {
        warnings.push(
          createWarning("MISSING_FILE", `Optional file not found: ${filename}`),
        );
      }
      continue;
    }

    const schemaId = getSchemaId(schemaFile);
    const result = await validateFile(ajv, filePath, schemaId);
    stats.filesValidated++;
    stats.schemasUsed.add(schemaFile);

    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  // Validate directories
  for (const [dirName, schemaFile] of Object.entries(SCHEMA_MAPPINGS)) {
    // Skip single file mappings
    if (dirName.includes(".yaml")) continue;

    const dirPath = join(dataDir, dirName);
    if (!(await isDirectory(dirPath))) {
      continue;
    }

    const schemaId = getSchemaId(schemaFile);
    const result = await validateDirectory(ajv, dirPath, schemaId);

    // Count files
    const files = await readdir(dirPath);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );
    stats.filesValidated += yamlFiles.length;
    stats.schemasUsed.add(schemaFile);

    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return createValidationResult(allErrors.length === 0, allErrors, warnings);
}

/**
 * Validate referential integrity (skill/behaviour references exist)
 * This supplements schema validation with cross-file reference checks
 * @param {Object} data - Loaded data object
 * @param {Array} data.skills - Skills
 * @param {Array} data.behaviours - Behaviours
 * @param {Array} data.disciplines - Disciplines
 * @param {Array} data.drivers - Drivers
 * @param {Array} data.capabilities - Capabilities
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
export function validateReferentialIntegrity(data) {
  const errors = [];
  const warnings = [];

  const skillIds = new Set((data.skills || []).map((s) => s.id));
  const behaviourIds = new Set((data.behaviours || []).map((b) => b.id));
  const capabilityIds = new Set((data.capabilities || []).map((c) => c.id));

  // Validate discipline skill references
  for (const discipline of data.disciplines || []) {
    const allSkillRefs = [
      ...(discipline.coreSkills || []),
      ...(discipline.supportingSkills || []),
      ...(discipline.broadSkills || []),
    ];

    for (const skillId of allSkillRefs) {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline '${discipline.id}' references unknown skill '${skillId}'`,
            `disciplines/${discipline.id}`,
          ),
        );
      }
    }

    // Validate behaviour modifier references
    for (const behaviourId of Object.keys(
      discipline.behaviourModifiers || {},
    )) {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Discipline '${discipline.id}' references unknown behaviour '${behaviourId}'`,
            `disciplines/${discipline.id}`,
          ),
        );
      }
    }
  }

  // Validate track skill modifier references (should reference capabilities, not skills)
  for (const track of data.tracks || []) {
    for (const capabilityId of Object.keys(track.skillModifiers || {})) {
      if (!capabilityIds.has(capabilityId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Track '${track.id}' references unknown capability '${capabilityId}'`,
            `tracks/${track.id}`,
          ),
        );
      }
    }

    // Validate behaviour modifier references
    for (const behaviourId of Object.keys(track.behaviourModifiers || {})) {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Track '${track.id}' references unknown behaviour '${behaviourId}'`,
            `tracks/${track.id}`,
          ),
        );
      }
    }
  }

  // Validate driver skill/behaviour references
  for (const driver of data.drivers || []) {
    for (const skillId of driver.contributingSkills || []) {
      if (!skillIds.has(skillId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Driver '${driver.id}' references unknown skill '${skillId}'`,
            `drivers`,
          ),
        );
      }
    }

    for (const behaviourId of driver.contributingBehaviours || []) {
      if (!behaviourIds.has(behaviourId)) {
        errors.push(
          createError(
            "INVALID_REFERENCE",
            `Driver '${driver.id}' references unknown behaviour '${behaviourId}'`,
            `drivers`,
          ),
        );
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Run full validation: schema validation + referential integrity
 * @param {string} dataDir - Path to the data directory
 * @param {Object} [loadedData] - Pre-loaded data (if available, skips schema validation stats gathering)
 * @returns {Promise<{valid: boolean, errors: Array, warnings: Array}>}
 */
export async function runSchemaValidation(dataDir, loadedData) {
  const allErrors = [];
  const allWarnings = [];

  // Run schema validation
  const schemaResult = await validateDataDirectory(dataDir);
  allErrors.push(...schemaResult.errors);
  allWarnings.push(...schemaResult.warnings);

  // If we have loaded data, also check referential integrity
  if (loadedData) {
    const refResult = validateReferentialIntegrity(loadedData);
    allErrors.push(...refResult.errors);
    allWarnings.push(...refResult.warnings);
  }

  return createValidationResult(allErrors.length === 0, allErrors, allWarnings);
}
