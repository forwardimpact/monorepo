/**
 * Toolkit formatters for DOM/web output
 *
 * Display a compact toolkit table of tools with icons and descriptions.
 */

import {
  div,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  a,
  span,
} from "../../lib/render.js";
import { createToolIcon } from "../../lib/card-mappers.js";

/**
 * Create a toolkit table for display in job/agent detail pages
 * @param {Array<{name: string, description: string, url?: string, simpleIcon?: string, skillIds: string[]}>} toolkit - Derived toolkit entries
 * @returns {HTMLElement}
 */
export function createToolkitTable(toolkit) {
  if (!toolkit || toolkit.length === 0) {
    return div({ className: "empty-state" }, "No tools in toolkit");
  }

  const rows = toolkit.map((tool) => {
    const icon = tool.simpleIcon
      ? createToolIcon(tool.simpleIcon, tool.name)
      : null;

    const nameContent = tool.url
      ? a(
          {
            href: tool.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "tool-link",
          },
          tool.name,
          span({ className: "external-icon" }, " ↗"),
        )
      : span({}, tool.name);

    return tr(
      {},
      td({ className: "tool-name-cell" }, icon, nameContent),
      td({ className: "tool-description-cell" }, tool.description),
    );
  });

  return div(
    { className: "table-container" },
    table(
      { className: "table toolkit-table" },
      thead({}, tr({}, th({}, "Tool"), th({}, "Description"))),
      tbody({}, ...rows),
    ),
  );
}
