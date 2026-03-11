/**
 * Template Loader — delegates to @forwardimpact/libtemplate.
 *
 * Resolution order:
 * 1. {dataDir}/templates/{name} (user customization)
 * 2. {packageDir}/templates/{name} (pathway defaults)
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createTemplateLoader } from "@forwardimpact/libtemplate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loader = createTemplateLoader(join(__dirname, "..", "..", "templates"));

/**
 * Load a template file with fallback to package defaults
 * @param {string} templateName - Template filename
 * @param {string} dataDir - Path to data directory
 * @returns {string}
 */
export function loadTemplate(templateName, dataDir) {
  return loader.load(templateName, dataDir);
}

/** @param {string} dataDir */
export function loadAgentTemplate(dataDir) {
  return loader.load("agent.template.md", dataDir);
}

/** @param {string} dataDir */
export function loadSkillTemplate(dataDir) {
  return loader.load("skill.template.md", dataDir);
}

/** @param {string} dataDir */
export function loadSkillInstallTemplate(dataDir) {
  return loader.load("skill-install.template.sh", dataDir);
}

/** @param {string} dataDir */
export function loadSkillReferenceTemplate(dataDir) {
  return loader.load("skill-reference.template.md", dataDir);
}

/** @param {string} dataDir */
export function loadJobTemplate(dataDir) {
  return loader.load("job.template.md", dataDir);
}
