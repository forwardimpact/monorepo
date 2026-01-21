#!/usr/bin/env node
/**
 * Validate SHACL RDF schema files for syntax correctness.
 *
 * Usage: node scripts/validate-shacl.js
 *
 * Exits with code 0 on success, 1 on error.
 */

import { Parser } from "n3";
import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_DIR = join(__dirname, "..", "schema", "rdf");

/**
 * Validate a single Turtle file
 * @param {string} filePath - Path to the .ttl file
 * @returns {Promise<{valid: boolean, triples: number, error?: string}>}
 */
function validateTurtleFile(filePath) {
  return new Promise((resolve) => {
    const parser = new Parser();
    const content = readFileSync(filePath, "utf-8");
    let tripleCount = 0;

    parser.parse(content, (error, quad) => {
      if (error) {
        resolve({ valid: false, triples: 0, error: error.message });
        return;
      }
      if (quad) {
        tripleCount++;
      } else {
        resolve({ valid: true, triples: tripleCount });
      }
    });
  });
}

/**
 * Find all .ttl files in the schema directory
 * @returns {string[]}
 */
function findTurtleFiles() {
  const files = readdirSync(SCHEMA_DIR);
  return files
    .filter((f) => extname(f) === ".ttl")
    .map((f) => join(SCHEMA_DIR, f));
}

async function main() {
  const files = findTurtleFiles();

  if (files.length === 0) {
    console.log("No .ttl files found in schema/rdf/");
    process.exit(0);
  }

  let allValid = true;
  let totalTriples = 0;

  for (const file of files) {
    const relativePath = file.replace(join(__dirname, "..") + "/", "");
    const result = await validateTurtleFile(file);

    if (result.valid) {
      console.log(`✓ ${relativePath} (${result.triples} triples)`);
      totalTriples += result.triples;
    } else {
      console.error(`✗ ${relativePath}: ${result.error}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log(`\nSHACL validation passed: ${totalTriples} total triples`);
    process.exit(0);
  } else {
    console.error("\nSHACL validation failed");
    process.exit(1);
  }
}

main();
