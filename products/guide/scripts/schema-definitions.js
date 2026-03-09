/**
 * Schema.org Type Definitions
 *
 * Predefined Schema.org vocabulary knowledge used for top-down ontology generation.
 * Based on Schema.org specifications and observed usage patterns in examples/knowledge/
 *
 * Schema definitions are loaded from schema-definitions.json to keep this file
 * within linting limits (similar to how ontology.js loads ontology-prompt.md).
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load schema definitions from external JSON file
 * @returns {Promise<object>} Schema definitions object
 */
async function loadSchemaDefinitions() {
  const schemaPath = join(__dirname, "schema-definitions.json");
  const content = await readFile(schemaPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Schema.org type definitions with expected properties and their ranges
 * Loaded from schema-definitions.json at module initialization
 * @type {Record<string, {properties: Record<string, {range: string, cardinality?: string}>}>}
 */
export const SCHEMA_DEFINITIONS = await loadSchemaDefinitions();

/**
 * Get schema definition for a type IRI
 * @param {string} typeIRI - Schema.org type IRI
 * @returns {object|null} Schema definition or null if not found
 */
export function getSchemaDefinition(typeIRI) {
  return SCHEMA_DEFINITIONS[typeIRI] || null;
}

/**
 * Get all defined Schema.org type IRIs
 * @returns {string[]} Array of type IRIs
 */
export function getDefinedTypes() {
  return Object.keys(SCHEMA_DEFINITIONS);
}

/**
 * Check if a type IRI has a schema definition
 * @param {string} typeIRI - Type IRI to check
 * @returns {boolean} True if schema definition exists
 */
export function hasSchemaDefinition(typeIRI) {
  return typeIRI in SCHEMA_DEFINITIONS;
}
