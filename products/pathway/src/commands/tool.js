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
export async function runToolCommand({ data, args, options, runtime }) {
  const [name] = args;
  const { tools, totalCount } = prepareToolsList(data.skills);

  // --list: Output descriptive comma-separated tool lines for piping
  if (options.list) {
    for (const tool of tools) {
      runtime.proc.stdout.write(
        `${tool.name}, ${truncate(tool.description, 60)}\n`,
      );
    }
    return;
  }

  // No args: Show summary
  if (!name) {
    if (options.json) {
      runtime.proc.stdout.write(JSON.stringify(tools, null, 2) + "\n");
      return;
    }
    formatSummary(tools, totalCount, runtime);
    return;
  }

  // With name: Show detail
  const tool = tools.find((t) => t.name.toLowerCase() === name.toLowerCase());

  if (!tool) {
    runtime.proc.stderr.write(formatError(`Tool not found: ${name}`) + "\n");
    runtime.proc.stderr.write(
      `Available: ${tools.map((t) => t.name).join(", ")}\n`,
    );
    runtime.proc.exit(1);
  }

  if (options.json) {
    runtime.proc.stdout.write(JSON.stringify(tool, null, 2) + "\n");
    return;
  }

  formatDetail(tool, runtime);
}

/**
 * Format tool summary output
 * @param {Array} tools - Aggregated tools
 * @param {number} totalCount - Total tool count
 */
function formatSummary(tools, totalCount, runtime) {
  runtime.proc.stdout.write("\n" + formatHeader("\u{1F527} Tools") + "\n\n");

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

  runtime.proc.stdout.write(
    formatTable(["Tool", "Skills", "Description"], rows) + "\n",
  );
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Total: ${totalCount} tools`) + "\n",
  );
  if (sorted.length > 15) {
    runtime.proc.stdout.write(formatBullet("(showing top 15 by usage)") + "\n");
  }
  runtime.proc.stdout.write("\n");
  runtime.proc.stdout.write(
    formatBullet(
      "Run 'npx fit-pathway tool --list' for all tool names and descriptions",
    ) + "\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway tool <name>' for details") + "\n\n",
  );
}

/**
 * Format tool detail output
 * @param {Object} tool - Aggregated tool with usages
 */
function formatDetail(tool, runtime) {
  runtime.proc.stdout.write(
    "\n" + formatHeader(`\u{1F527} ${tool.name}`) + "\n\n",
  );
  runtime.proc.stdout.write(tool.description + "\n\n");

  if (tool.url) {
    runtime.proc.stdout.write(`Documentation: ${tool.url}\n\n`);
  }

  if (tool.usages.length > 0) {
    runtime.proc.stdout.write(formatSubheader("Used in Skills") + "\n\n");
    const rows = tool.usages.map((u) => [u.skillName, u.useWhen]);
    runtime.proc.stdout.write(
      formatTable(["Skill", "Use When"], rows) + "\n\n",
    );
  }
}
