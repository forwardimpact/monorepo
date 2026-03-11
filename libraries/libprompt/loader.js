import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Mustache from "mustache";

/**
 * Prompt loader with Mustache templating.
 * Loads .prompt.md files from a directory and renders them with variable substitution.
 */
export class PromptLoader {
  #promptDir;

  /**
   * @param {string} promptDir - Directory containing .prompt.md files
   */
  constructor(promptDir) {
    if (!promptDir) throw new Error("promptDir is required");
    this.#promptDir = promptDir;
  }

  /**
   * Load a prompt file.
   * @param {string} promptName - Name of the prompt (without .prompt.md extension)
   * @returns {string} Raw prompt content
   */
  load(promptName) {
    if (!promptName) throw new Error("promptName is required");

    const promptPath = join(this.#promptDir, `${promptName}.prompt.md`);
    if (!existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    return readFileSync(promptPath, "utf-8");
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
