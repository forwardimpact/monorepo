import { Store } from "n3";
import { createStorage } from "@forwardimpact/libstorage";
import { GraphIndex } from "./index/graph.js";

/**
 * Standard RDF namespace prefixes used throughout the graph system
 */
export const RDF_PREFIXES = {
  schema: "https://schema.org/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  foaf: "http://xmlns.com/foaf/0.1/",
  ex: "https://example.invalid/",
};

/**
 * Checks if a value should be treated as a wildcard in graph queries
 * @param {any} value - The value to check
 * @returns {boolean} True if the value represents a wildcard
 */
export function isWildcard(value) {
  const wildcards = ["?", "*", "_", "null", "NULL"];
  return !value || wildcards.includes(value);
}

/**
 * Parses a space-delimited graph query line into a triple object
 * @param {string} line - Query line in format: <subject> <predicate> <object>
 * @returns {object} Triple object with subject, predicate, object as strings
 * @example
 * parseGraphQuery('person:john ? ?') // { subject: 'person:john', predicate: '?', object: '?' }
 * parseGraphQuery('? foaf:name "John Doe"') // { subject: '?', predicate: 'foaf:name', object: '"John Doe"' }
 * parseGraphQuery('person:john rdf:type schema:Person') // { subject: 'person:john', predicate: 'rdf:type', object: 'schema:Person' }
 */
export function parseGraphQuery(line) {
  if (typeof line !== "string") {
    throw new Error("line must be a string");
  }

  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("line cannot be empty");
  }

  // Check for unterminated quotes
  const quoteCount = (trimmed.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    throw new Error("Unterminated quoted string");
  }

  // Use regex to split on spaces but preserve quoted strings
  const terms = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

  if (terms.length !== 3) {
    throw new Error(
      `Expected 3 parts (subject predicate object), got ${terms.length}`,
    );
  }

  const [subject, predicate, object] = terms;
  return { subject, predicate, object };
}

/**
 * Creates a `GraphIndex` with the provided storage prefix and default index key.
 * @param {string} prefix - Storage prefix (directory name or S3 key prefix) for graph data
 * @returns {GraphIndex} Graph index instance
 */
export function createGraphIndex(prefix) {
  if (!prefix) throw new Error("prefix is required");
  const storage = createStorage(prefix);
  const n3Store = new Store({ prefixes: RDF_PREFIXES });
  // New constructor order: storage, store, prefixes, indexKey
  return new GraphIndex(storage, n3Store, RDF_PREFIXES, "index.jsonl");
}

// GraphIndex is NOT exported to avoid circular dependency - import from ./index/graph.js
// OntologyProcessor is NOT exported to avoid unnecessary dependencies - import from ./processor/ontology.js
export { ShaclSerializer } from "./serializer.js";
