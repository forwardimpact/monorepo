/**
 * Format generated content with Prettier before writing to disk.
 *
 * @module libuniverse/format
 */

import { format, resolveConfig } from "prettier";
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
 * @param {string} filePath - Relative or absolute file path (used to infer parser)
 * @param {string} content - File content to format
 * @returns {Promise<string>} Formatted content
 */
export async function formatContent(filePath, content) {
  const ext = extname(filePath).toLowerCase();
  const parser = PARSER_BY_EXT[ext];
  if (!parser) return content;

  const config = (await resolveConfig(filePath)) || {};
  try {
    return await format(content, { ...config, parser, filepath: filePath });
  } catch {
    return content;
  }
}

/**
 * Format all entries in a Map of path→content.
 *
 * @param {Map<string, string>} files - Map of relative paths to file content
 * @returns {Promise<Map<string, string>>} Map with formatted content
 */
export async function formatFiles(files) {
  const formatted = new Map();
  const entries = [...files.entries()];
  const results = await Promise.all(
    entries.map(([path, content]) => formatContent(path, content)),
  );
  for (let i = 0; i < entries.length; i++) {
    formatted.set(entries[i][0], results[i]);
  }
  return formatted;
}
