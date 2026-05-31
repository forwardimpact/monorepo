/**
 * Template Loader
 *
 * Loads Mustache templates with a two-tier resolution order:
 * 1. {dataDir}/templates/{name} — user customization
 * 2. {defaultsDir}/{name} — package defaults
 *
 * @module libtemplate
 */

export { TemplateLoader } from "./loader.js";

import { TemplateLoader } from "./loader.js";

/**
 * Create a TemplateLoader bound to a package's default templates directory.
 * Convenience factory for contexts where class instantiation is awkward.
 * @param {string} defaultsDir - Absolute path to the package's templates/ folder
 * @param {import("@forwardimpact/libutil/runtime").Runtime} [runtime]
 * @returns {TemplateLoader}
 */
export function createTemplateLoader(defaultsDir, runtime) {
  return new TemplateLoader(defaultsDir, runtime);
}
