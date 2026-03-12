/**
 * Template Loader — delegates to @forwardimpact/libtemplate.
 *
 * Resolution order:
 * 1. {dataDir}/templates/{name} (user customization)
 * 2. {templateDir}/{name} (pathway defaults)
 */

import { createTemplateLoader } from "@forwardimpact/libtemplate";

/**
 * Create a template loader for pathway templates
 * @param {string} templateDir - Path to template directory (required)
 * @returns {Object} Template loader instance
 */
export function createPathwayTemplateLoader(templateDir) {
  if (!templateDir) throw new Error("templateDir is required");
  return createTemplateLoader(templateDir);
}
