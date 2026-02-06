/**
 * @forwardimpact/schema
 *
 * Schema definitions, data validation, and loading for Engineering Pathway.
 */

// Data loading
export {
  loadAllData,
  loadYamlFile,
  createDataLoader,
  loadFrameworkConfig,
  loadQuestionFolder,
  loadQuestionBankFromFolder,
  loadSelfAssessments,
  loadExampleData,
  loadAndValidate,
  loadAgentData,
  loadSkillsWithAgentData,
} from "./loader.js";

// Referential integrity validation
export {
  validateAllData,
  validateQuestionBank,
  validateSelfAssessment,
  validateAgentData,
} from "./validation.js";

// Schema-based validation
export {
  validateDataDirectory,
  validateReferentialIntegrity,
  runSchemaValidation,
} from "./schema-validation.js";

// Index generation
export { generateAllIndexes, generateDirIndex } from "./index-generator.js";

// Type constants and helpers
export * from "./levels.js";

// Capability validation helper
export { isCapability } from "./modifiers.js";
