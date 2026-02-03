/**
 * Tool CLI Command
 *
 * Handles tool summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx pathway tool              # Summary with stats
 *   npx pathway tool --list       # Tool names only (for piping)
 *   npx pathway tool <name>       # Detail view for specific tool
 */

import { prepareToolsList } from "../formatters/tool/shared.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
} from "../lib/cli-output.js";

/**
 * Run tool command
 * @param {Object} params - Command parameters
 * @param {Object} params.data - Loaded pathway data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Command options
 */
export async function runToolCommand({ data, args, options }) {
  const [name] = args;
  const { tools, totalCount } = prepareToolsList(data.skills);

  // --list: Output clean newline-separated tool names for piping
  if (options.list) {
    for (const tool of tools) {
      console.log(tool.name);
    }
    return;
  }

  // No args: Show summary
  if (!name) {
    if (options.json) {
      console.log(JSON.stringify(tools, null, 2));
      return;
    }
    formatSummary(tools, totalCount);
    return;
  }

  // With name: Show detail
  const tool = tools.find((t) => t.name.toLowerCase() === name.toLowerCase());

  if (!tool) {
    console.error(`Tool not found: ${name}`);
    console.error(`Available: ${tools.map((t) => t.name).join(", ")}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  formatDetail(tool);
}

/**
 * Format tool summary output
 * @param {Array} tools - Aggregated tools
 * @param {number} totalCount - Total tool count
 */
function formatSummary(tools, totalCount) {
  console.log(`\n🔧 Tools\n`);

  // Show tools sorted by usage count
  const sorted = [...tools].sort((a, b) => b.usages.length - a.usages.length);
  const rows = sorted
    .slice(0, 15)
    .map((t) => [
      t.name,
      t.usages.length,
      t.description.length > 50
        ? t.description.slice(0, 47) + "..."
        : t.description,
    ]);

  console.log(formatTable(["Tool", "Skills", "Description"], rows));
  console.log(`\nTotal: ${totalCount} tools`);
  if (sorted.length > 15) {
    console.log(`(showing top 15 by usage)`);
  }
  console.log(`\nRun 'npx pathway tool --list' for all tool names`);
  console.log(`Run 'npx pathway tool <name>' for details\n`);
}

/**
 * Format tool detail output
 * @param {Object} tool - Aggregated tool with usages
 */
function formatDetail(tool) {
  console.log(formatHeader(`\n🔧 ${tool.name}\n`));
  console.log(`${tool.description}\n`);

  if (tool.url) {
    console.log(`Documentation: ${tool.url}\n`);
  }

  if (tool.usages.length > 0) {
    console.log(formatSubheader("Used in Skills\n"));
    const rows = tool.usages.map((u) => [u.skillName, u.useWhen]);
    console.log(formatTable(["Skill", "Use When"], rows));
    console.log();
  }
}
