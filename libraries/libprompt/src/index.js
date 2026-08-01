/**
 * Prompt Loader
 *
 * Loads .prompt.md files from a directory. Renders them
 * with Mustache templates.
 *
 * @module libprompt
 */

export { PromptLoader } from "./loader.js";

import { PromptLoader } from "./loader.js";

/**
 * Create a PromptLoader bound to a prompt directory.
 * Use this factory where a call to the class constructor is awkward.
 * @param {string} promptDir - Directory that contains .prompt.md files
 * @param {import("@forwardimpact/libutil/runtime").Runtime} [runtime]
 * @returns {PromptLoader}
 */
export function createPromptLoader(promptDir, runtime) {
  return new PromptLoader(promptDir, runtime);
}
