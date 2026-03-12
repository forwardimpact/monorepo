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

/**
 * Schema mappings for different file types
 * Maps directory/file patterns to schema files
 */
const SCHEMA_MAPPINGS = {
  "drivers.yaml": "drivers.schema.json",
  "levels.yaml": "levels.schema.json",
  "stages.yaml": "stages.schema.json",
  "framework.yaml": "framework.schema.json",
  "self-assessments.yaml": "self-assessments.schema.json",
  capabilities: "capability.schema.json",
  disciplines: "discipline.schema.json",
  tracks: "track.schema.json",
  behaviours: "behaviour.schema.json",
  "questions/skills": "skill-questions.schema.json",
  "questions/behaviours": "behaviour-questions.schema.json",
};

/**
 * Create a validation result object
 * @param {boolean} valid
 * @param {Array} errors
 * @param {Array} warnings
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
function createValidationResult(valid, errors = [], warnings = []) {
  return { valid, errors, warnings };
}

/**
 * Create a validation error
 * @param {string} type
 * @param {string} message
 * @param {string} [path]
 * @returns {{type: string, message: string, path?: string}}
 */
function createError(type, message, path) {
  const error = { type, message };
  if (path !== undefined) error.path = path;
  return error;
}

/**
 * Create a validation warning
 * @param {string} type
 * @param {string} message
 * @param {string} [path]
 * @returns {{type: string, message: string, path?: string}}
 */
function createWarning(type, message, path) {
  const warning = { type, message };
  if (path !== undefined) warning.path = path;
  return warning;
}

/**
 * Format Ajv errors into readable messages
 * @param {import('ajv').ErrorObject[]} ajvErrors
 * @param {string} filePath
 * @returns {Array}
 */
function formatAjvErrors(ajvErrors, filePath) {
  return ajvErrors.map((err) => {
    const path = err.instancePath ? `${filePath}${err.instancePath}` : filePath;
    let message = err.message || "Unknown error";

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
 * Schema validator class with injectable dependencies.
 */
export class SchemaValidator {
  #fs;
  #schemaDir;
  #ajvFactory;

  /**
   * @param {{ readFile: Function, readdir: Function, stat: Function }} fs
   * @param {string} schemaDir - Path to JSON schema directory
   * @param {{ Ajv: Function, addFormats: Function }} ajvFactory
   */
  constructor(fs, schemaDir, ajvFactory) {
    if (!fs) throw new Error("fs is required");
    if (!schemaDir) throw new Error("schemaDir is required");
    if (!ajvFactory) throw new Error("ajvFactory is required");
    this.#fs = fs;
    this.#schemaDir = schemaDir;
    this.#ajvFactory = ajvFactory;
  }

  /**
   * Check if a path exists and is a directory
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async #isDirectory(path) {
    try {
      const stats = await this.#fs.stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async #fileExists(path) {
    try {
      await this.#fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load and parse a JSON schema
   * @param {string} schemaPath
   * @returns {Promise<Object>}
   */
  async #loadSchema(schemaPath) {
    const content = await this.#fs.readFile(schemaPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Load and parse a YAML file
   * @param {string} filePath
   * @returns {Promise<any>}
   */
  async #loadYamlFile(filePath) {
    const content = await this.#fs.readFile(filePath, "utf-8");
    return parseYaml(content);
  }

  /**
   * Create and configure an Ajv instance with all schemas loaded
   * @returns {Promise<Ajv>}
   */
  async #createValidator() {
    const ajv = new this.#ajvFactory.Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    this.#ajvFactory.addFormats(ajv);

    const schemaFiles = await this.#fs.readdir(this.#schemaDir);
    for (const file of schemaFiles.filter((f) => f.endsWith(".schema.json"))) {
      const schema = await this.#loadSchema(join(this.#schemaDir, file));
      ajv.addSchema(schema);
    }

    return ajv;
  }

  /**
   * Validate a single file against a schema
   * @param {Ajv} ajv
   * @param {string} filePath
   * @param {string} schemaId
   * @returns {Promise<{valid: boolean, errors: Array}>}
   */
  async #validateFile(ajv, filePath, schemaId) {
    const data = await this.#loadYamlFile(filePath);
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
    const errors = valid
      ? []
      : formatAjvErrors(validate.errors || [], filePath);

    return { valid, errors };
  }

  /**
   * Validate all files in a directory against a schema
   * @param {Ajv} ajv
   * @param {string} dirPath
   * @param {string} schemaId
   * @returns {Promise<{valid: boolean, errors: Array}>}
   */
  async #validateDirectory(ajv, dirPath, schemaId) {
    const files = await this.#fs.readdir(dirPath);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const allErrors = [];
    let allValid = true;

    for (const file of yamlFiles) {
      const filePath = join(dirPath, file);
      const result = await this.#validateFile(ajv, filePath, schemaId);
      if (!result.valid) {
        allValid = false;
        allErrors.push(...result.errors);
      }
    }

    return { valid: allValid, errors: allErrors };
  }

  /**
   * Build the schema $id from the schema filename
   * @param {string} schemaFilename
   * @returns {string}
   */
  #getSchemaId(schemaFilename) {
    return `https://www.forwardimpact.team/schema/json/${schemaFilename}`;
  }

  /**
   * Validate a data directory against JSON schemas
   * @param {string} dataDir
   * @returns {Promise<{valid: boolean, errors: Array, warnings: Array, stats: Object}>}
   */
  async validateDataDirectory(dataDir) {
    const ajv = await this.#createValidator();
    const allErrors = [];
    const warnings = [];
    const stats = {
      filesValidated: 0,
      schemasUsed: new Set(),
    };

    for (const [filename, schemaFile] of Object.entries(SCHEMA_MAPPINGS)) {
      if (!filename.includes(".yaml")) continue;

      const filePath = join(dataDir, filename);
      if (!(await this.#fileExists(filePath))) {
        if (!["self-assessments.yaml"].includes(filename)) {
          warnings.push(
            createWarning(
              "MISSING_FILE",
              `Optional file not found: ${filename}`,
            ),
          );
        }
        continue;
      }

      const schemaId = this.#getSchemaId(schemaFile);
      const result = await this.#validateFile(ajv, filePath, schemaId);
      stats.filesValidated++;
      stats.schemasUsed.add(schemaFile);

      if (!result.valid) {
        allErrors.push(...result.errors);
      }
    }

    for (const [dirName, schemaFile] of Object.entries(SCHEMA_MAPPINGS)) {
      if (dirName.includes(".yaml")) continue;

      const dirPath = join(dataDir, dirName);
      if (!(await this.#isDirectory(dirPath))) {
        continue;
      }

      const schemaId = this.#getSchemaId(schemaFile);
      const result = await this.#validateDirectory(ajv, dirPath, schemaId);

      const files = await this.#fs.readdir(dirPath);
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
   * @param {Object} data
   * @returns {{valid: boolean, errors: Array, warnings: Array}}
   */
  validateReferentialIntegrity(data) {
    const errors = [];
    const warnings = [];

    const skillIds = new Set((data.skills || []).map((s) => s.id));
    const behaviourIds = new Set((data.behaviours || []).map((b) => b.id));
    const capabilityIds = new Set((data.capabilities || []).map((c) => c.id));

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
   * @param {string} dataDir
   * @param {Object} [loadedData]
   * @returns {Promise<{valid: boolean, errors: Array, warnings: Array}>}
   */
  async runFullValidation(dataDir, loadedData) {
    const allErrors = [];
    const allWarnings = [];

    const schemaResult = await this.validateDataDirectory(dataDir);
    allErrors.push(...schemaResult.errors);
    allWarnings.push(...schemaResult.warnings);

    if (loadedData) {
      const refResult = this.validateReferentialIntegrity(loadedData);
      allErrors.push(...refResult.errors);
      allWarnings.push(...refResult.warnings);
    }

    return createValidationResult(
      allErrors.length === 0,
      allErrors,
      allWarnings,
    );
  }
}

/**
 * Create a SchemaValidator with real dependencies
 * @returns {SchemaValidator}
 */
export function createSchemaValidator() {
  const schemaDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../schema/json",
  );
  return new SchemaValidator({ readFile, readdir, stat }, schemaDir, {
    Ajv,
    addFormats,
  });
}
