/**
 * @forwardimpact/map
 *
 * Data model definitions, validation, and loading for Engineering Pathway.
 */

// Classes
export { DataLoader } from "./loader.js";
export { SchemaValidator } from "./schema-validation.js";
export { IndexGenerator } from "./index-generator.js";

// Factory functions
export { createDataLoader } from "./loader.js";
export { createSchemaValidator } from "./schema-validation.js";
export { createIndexGenerator } from "./index-generator.js";

// Pure validation functions (unchanged)
export {
  validateAllData,
  validateQuestionBank,
  validateSelfAssessment,
  validateAgentData,
} from "./validation.js";

// Type constants and helpers
export * from "./levels.js";

// Capability validation helper
export { isCapability } from "./modifiers.js";
