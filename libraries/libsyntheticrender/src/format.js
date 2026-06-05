/**
 * Format generated content with Prettier before writing to disk.
 *
 * @module libterrain/format
 */

import { resolveConfig } from "prettier";
import { extname } from "path";

const PARSER_BY_EXT = {
  ".html": "html",
  ".md": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
};

/**
 * Format a single file's content with Prettier.
 *
 * @param {Function} prettierFn - Prettier format function
 * @param {string} filePath - Relative or absolute file path (used to infer parser)
 * @param {string} content - File content to format
 * @param {Set<string>} [skipParsers] - Parsers whose content is already canonical
 *   (e.g. machine-serialized JSON/YAML); these are passed through unformatted.
 * @returns {Promise<string>} Formatted content
 */
async function formatOne(prettierFn, filePath, content, skipParsers) {
  const ext = extname(filePath).toLowerCase();
  const parser = PARSER_BY_EXT[ext];
  if (!parser || skipParsers?.has(parser)) return content;

  const config = (await resolveConfig(filePath)) || {};
  try {
    return await prettierFn(content, { ...config, parser, filepath: filePath });
  } catch {
    return content;
  }
}

/**
 * Format a single file's content with the default Prettier format function.
 *
 * @param {string} filePath - Relative or absolute file path (used to infer parser)
 * @param {string} content - File content to format
 * @returns {Promise<string>} Formatted content
 */
export async function formatContent(filePath, content) {
  const { format } = await import("prettier");
  return formatOne(format, filePath, content);
}

/**
 * Content formatter class with DI.
 */
export class ContentFormatter {
  /**
   * @param {Function} prettierFn - Prettier format function
   * @param {object} logger - Logger instance
   */
  constructor(prettierFn, logger) {
    if (!prettierFn) throw new Error("prettierFn is required");
    if (!logger) throw new Error("logger is required");
    this.prettierFn = prettierFn;
    this.logger = logger;
  }

  /**
   * Format all entries in a Map of path→content.
   * @param {Map<string, string>} files
   * @param {{ skipParsers?: Set<string> }} [options] - `skipParsers` lists
   *   parsers whose content is already canonical (e.g. machine-serialized
   *   JSON/YAML), so a second Prettier pass is redundant work and they are
   *   written through unchanged.
   * @returns {Promise<Map<string, string>>}
   */
  async format(files, { skipParsers } = {}) {
    const formatted = new Map();
    const entries = [...files.entries()];
    const results = await Promise.all(
      entries.map(([path, content]) =>
        formatOne(this.prettierFn, path, content, skipParsers),
      ),
    );
    for (let i = 0; i < entries.length; i++) {
      formatted.set(entries[i][0], results[i]);
    }
    return formatted;
  }
}
