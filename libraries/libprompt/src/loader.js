import { join } from "node:path";
import Mustache from "mustache";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * Prompt loader with Mustache templating.
 * Loads .prompt.md files from a directory and renders them with variable substitution.
 */
export class PromptLoader {
  #promptDir;
  #fsSync;

  /**
   * @param {string} promptDir - Directory containing .prompt.md files
   * @param {import("@forwardimpact/libutil/runtime").Runtime} [runtime]
   */
  constructor(promptDir, runtime = createDefaultRuntime()) {
    if (!promptDir) throw new Error("promptDir is required");
    this.#promptDir = promptDir;
    this.#fsSync = runtime.fsSync;
  }

  /**
   * Load a prompt file.
   * @param {string} promptName - Name of the prompt (without .prompt.md extension)
   * @returns {string} Raw prompt content
   */
  load(promptName) {
    if (!promptName) throw new Error("promptName is required");

    const promptPath = join(this.#promptDir, `${promptName}.prompt.md`);
    if (!this.#fsSync.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    return this.#fsSync.readFileSync(promptPath, "utf-8");
  }

  /**
   * Load and render a prompt with Mustache templating.
   * @param {string} promptName - Name of the prompt (without .prompt.md extension)
   * @param {object} data - Data to render into the template
   * @returns {string} Rendered prompt content
   */
  render(promptName, data = {}) {
    const template = this.load(promptName);
    return Mustache.render(template, data);
  }
}
