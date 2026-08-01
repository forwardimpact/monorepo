/**
 * Toolkit formatter for markdown/CLI output
 *
 * Display the toolkit as a markdown table with tools, icons, and descriptions.
 */

import { tableToMarkdown } from "../shared.js";

/**
 * Format the toolkit as a markdown table
 * @param {Array<{name: string, description: string, url?: string, simpleIcon?: string, skillIds: string[]}>} toolkit - Derived toolkit entries
 * @returns {string}
 */
export function toolkitToMarkdown(toolkit) {
  if (!toolkit || toolkit.length === 0) {
    return "";
  }

  const rows = toolkit.map((tool) => {
    const name = tool.url ? `[${tool.name}](${tool.url})` : tool.name;
    return [name, tool.description];
  });

  return tableToMarkdown(["Tool", "Description"], rows);
}

/**
 * Format the toolkit as a plain list of tool names (for the --tools flag)
 * @param {Array<{name: string}>} toolkit - Derived toolkit entries
 * @returns {string}
 */
export function toolkitToPlainList(toolkit) {
  if (!toolkit || toolkit.length === 0) {
    return "";
  }

  return toolkit.map((tool) => tool.name).join("\n");
}
