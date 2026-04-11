/**
 * Tool CLI Command
 *
 * Handles tool summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway tool              # Summary with stats
 *   npx fit-pathway tool --list       # Tool names only (for piping)
 *   npx fit-pathway tool <name>       # Detail view for specific tool
 */

import { truncate } from "../formatters/shared.js";
import { prepareToolsList } from "../formatters/tool/shared.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
  formatError,
} from "@forwardimpact/libcli";

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

  // --list: Output descriptive comma-separated tool lines for piping
  if (options.list) {
    for (const tool of tools) {
      console.log(`${tool.name}, ${truncate(tool.description, 60)}`);
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
    process.stderr.write(formatError(`Tool not found: ${name}`) + "\n");
    process.stderr.write(`Available: ${tools.map((t) => t.name).join(", ")}\n`);
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
  process.stdout.write("\n" + formatHeader("\u{1F527} Tools") + "\n\n");

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

  process.stdout.write(
    formatTable(["Tool", "Skills", "Description"], rows) + "\n",
  );
  process.stdout.write(
    "\n" + formatSubheader(`Total: ${totalCount} tools`) + "\n",
  );
  if (sorted.length > 15) {
    process.stdout.write(formatBullet("(showing top 15 by usage)") + "\n");
  }
  process.stdout.write("\n");
  process.stdout.write(
    formatBullet(
      "Run 'npx fit-pathway tool --list' for all tool names and descriptions",
    ) + "\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway tool <name>' for details") + "\n\n",
  );
}

/**
 * Format tool detail output
 * @param {Object} tool - Aggregated tool with usages
 */
function formatDetail(tool) {
  process.stdout.write("\n" + formatHeader(`\u{1F527} ${tool.name}`) + "\n\n");
  process.stdout.write(tool.description + "\n\n");

  if (tool.url) {
    process.stdout.write(`Documentation: ${tool.url}\n\n`);
  }

  if (tool.usages.length > 0) {
    process.stdout.write(formatSubheader("Used in Skills") + "\n\n");
    const rows = tool.usages.map((u) => [u.skillName, u.useWhen]);
    process.stdout.write(formatTable(["Skill", "Use When"], rows) + "\n\n");
  }
}
