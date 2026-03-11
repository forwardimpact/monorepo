/**
 * Prompt Loader
 *
 * Loads .prompt.md files from a directory and renders them
 * with Mustache templating.
 *
 * @module libprompt
 */

export { PromptLoader } from "./loader.js";

import { PromptLoader } from "./loader.js";

/**
 * Create a PromptLoader bound to a prompt directory.
 * Convenience factory for contexts where class instantiation is awkward.
 * @param {string} promptDir - Directory containing .prompt.md files
 * @returns {PromptLoader}
 */
export function createPromptLoader(promptDir) {
  return new PromptLoader(promptDir);
}
