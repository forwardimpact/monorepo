/**
 * Template Loader
 *
 * Loads Mustache templates from the data directory with fallback to the
 * top-level templates directory. This allows users to customize agent
 * and skill templates by placing them in their data directory.
 *
 * Resolution order:
 * 1. {dataDir}/templates/agent.template.md
 * 2. {dataDir}/templates/skill.template.md
 * 3. {codebseDir}/templates/agent.template.md (fallback)
 * 4. {codebaseDir}/templates/skill.template.md (fallback)
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEBASE_TEMPLATES_DIR = join(__dirname, "..", "..", "templates");

/**
 * Load a template file with fallback to codebase templates
 * Tries data directory first, then falls back to templates directory
 * @param {string} templateName - Template filename (e.g., 'agent.template.md')
 * @param {string} dataDir - Path to data directory
 * @returns {Promise<string>} Template content
 * @throws {Error} If template not found in either location
 */
export async function loadTemplate(templateName, dataDir) {
  // Try data directory first
  if (dataDir) {
    const dataTemplateDir = join(dataDir, "templates");
    const dataTemplatePath = join(dataTemplateDir, templateName);
    if (existsSync(dataTemplatePath)) {
      try {
        return await readFile(dataTemplatePath, "utf-8");
      } catch (error) {
        throw new Error(
          `Failed to read template from ${dataTemplatePath}: ${error.message}`,
        );
      }
    }
  }

  // Fall back to codebase templates
  const codebaseTemplatePath = join(CODEBASE_TEMPLATES_DIR, templateName);
  if (existsSync(codebaseTemplatePath)) {
    try {
      return await readFile(codebaseTemplatePath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read template from ${codebaseTemplatePath}: ${error.message}`,
      );
    }
  }

  // Not found anywhere
  throw new Error(
    `Template '${templateName}' not found. Checked:\n` +
      (dataDir ? `  - ${join(dataDir, "templates", templateName)}\n` : "") +
      `  - ${codebaseTemplatePath}`,
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
