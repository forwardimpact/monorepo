/**
 * Template Loader
 *
 * Loads Mustache templates from the data directory with fallback to the
 * top-level templates directory. This allows users to customize agent
 * and skill templates by placing them in their data directory.
 *
 * Resolution order:
 * 1. {dataDir}/templates/{name} (user customization)
 * 2. {codebaseDir}/templates/{name} (fallback)
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEBASE_TEMPLATES_DIR = join(__dirname, "..", "..", "templates");

/**
 * Load a template file with fallback to codebase templates
 * @param {string} templateName - Template filename (e.g., 'agent.template.md')
 * @param {string} dataDir - Path to data directory
 * @returns {Promise<string>} Template content
 * @throws {Error} If template not found in either location
 */
export async function loadTemplate(templateName, dataDir) {
  // Build list of paths to try
  const paths = [];
  if (dataDir) {
    paths.push(join(dataDir, "templates", templateName));
  }
  paths.push(join(CODEBASE_TEMPLATES_DIR, templateName));

  // Try each path in order
  for (const path of paths) {
    if (existsSync(path)) {
      return await readFile(path, "utf-8");
    }
  }

  // Not found
  throw new Error(
    `Template '${templateName}' not found. Checked:\n` +
      paths.map((p) => `  - ${p}`).join("\n"),
  );
}

/**
 * Load agent profile template
 * @param {string} dataDir - Path to data directory
 * @returns {Promise<string>} Agent template content
 */
export async function loadAgentTemplate(dataDir) {
  return loadTemplate("agent.template.md", dataDir);
}

/**
 * Load agent skill template
 * @param {string} dataDir - Path to data directory
 * @returns {Promise<string>} Skill template content
 */
export async function loadSkillTemplate(dataDir) {
  return loadTemplate("skill.template.md", dataDir);
}

/**
 * Load job description template
 * @param {string} dataDir - Path to data directory
 * @returns {Promise<string>} Job template content
 */
export async function loadJobTemplate(dataDir) {
  return loadTemplate("job.template.md", dataDir);
}
