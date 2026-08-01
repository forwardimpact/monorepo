import { join } from "node:path";
import Mustache from "mustache";

/**
 * The loader resolves a template in two tiers. It renders the template with
 * Mustache. It follows the constructor dependency-injection pattern.
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
   * Load a template and render it with Mustache.
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
   * The loader resolves each partial through the same two-tier fallback as
   * the main template. So a user can override one partial with a file at
   * `{dataDir}/templates/{partialName}`. A partial that does not exist raises
   * the same `Template '...' not found` error as {@link TemplateLoader#load}.
   *
   * @param {string} name - Main template filename
   * @param {object} data - Data to render into the template
   * @param {string[]} partialNames - Filenames of the partials that the main
   *   template references with `{{> partialName}}`
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
