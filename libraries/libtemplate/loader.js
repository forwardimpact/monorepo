import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";

/**
 * Template loader with two-tier resolution and Mustache rendering.
 * Follows constructor dependency injection pattern.
 *
 * Resolution order:
 * 1. {dataDir}/templates/{name} — user customization
 * 2. {defaultsDir}/{name} — package defaults
 */
export class TemplateLoader {
  #defaultsDir;

  /**
   * @param {string} defaultsDir - Absolute path to the package's templates/ folder
   */
  constructor(defaultsDir) {
    if (!defaultsDir) throw new Error("defaultsDir is required");
    this.#defaultsDir = defaultsDir;
  }

  /**
   * Load a template file with fallback to package defaults.
   * @param {string} name - Template filename (e.g. 'agent.template.md')
   * @param {string} [dataDir] - Optional data directory for user overrides
   * @returns {string} Template content
   */
  load(name, dataDir) {
    if (!name) throw new Error("name is required");

    const paths = [];
    if (dataDir) paths.push(join(dataDir, "templates", name));
    paths.push(join(this.#defaultsDir, name));

    for (const path of paths) {
      if (existsSync(path)) return readFileSync(path, "utf-8");
    }

    throw new Error(
      `Template '${name}' not found. Checked:\n` +
        paths.map((p) => `  - ${p}`).join("\n"),
    );
  }

  /**
   * Load and render a template with Mustache templating.
   * @param {string} name - Template filename (e.g. 'agent.template.md')
   * @param {object} data - Data to render into the template
   * @param {string} [dataDir] - Optional data directory for user overrides
   * @returns {string} Rendered template content
   */
  render(name, data = {}, dataDir) {
    const template = this.load(name, dataDir);
    return Mustache.render(template, data);
  }
}
