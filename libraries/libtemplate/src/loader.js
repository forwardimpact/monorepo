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
  #fsSync;

  /**
   * @param {string} defaultsDir - Absolute path to the package's templates/ folder
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   */
  constructor(defaultsDir, runtime) {
    if (!defaultsDir) throw new Error("defaultsDir is required");
    if (!runtime) throw new Error("runtime is required");
    this.#defaultsDir = defaultsDir;
    this.#fsSync = runtime.fsSync;
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
      if (this.#fsSync.existsSync(path))
        return this.#fsSync.readFileSync(path, "utf-8");
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

  /**
   * Load and render a template that references Mustache partials.
   *
   * Each partial is resolved through the same two-tier fallback as the main
   * template, so users can override individual partials by dropping a file at
   * `{dataDir}/templates/{partialName}`. Missing partials raise the same
   * `Template '...' not found` error that {@link TemplateLoader#load} does.
   *
   * @param {string} name - Main template filename
   * @param {object} data - Data to render into the template
   * @param {string[]} partialNames - Filenames of partials referenced by the
   *   main template via `{{> partialName}}`
   * @param {string} [dataDir] - Optional data directory for user overrides
   * @returns {string} Rendered template content
   */
  renderWithPartials(name, data = {}, partialNames = [], dataDir) {
    const template = this.load(name, dataDir);
    const partials = {};
    for (const partialName of partialNames) {
      partials[partialName] = this.load(partialName, dataDir);
    }
    return Mustache.render(template, data, partials);
  }
}
