/**
 * Tools page
 *
 * Displays aggregated tools from all skills with links to skill context.
 */

import { render, div, h1, p } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { prepareToolsList } from "../formatters/tool/shared.js";
import { createBadge } from "../components/card.js";
import { createCardList } from "../components/list.js";
import { toolToCardConfig } from "../lib/card-mappers.js";
import { getConceptEmoji } from "../model/levels.js";

/**
 * Render tools list page
 */
export function renderToolsList() {
  const { data } = getState();
  const { framework } = data;
  const toolEmoji = getConceptEmoji(framework, "tool");

  const { tools, totalCount } = prepareToolsList(data.skills);

  const page = div(
    { className: "tools-page" },
    // Header
    div(
      { className: "page-header" },
      h1(
        { className: "page-title" },
        `${toolEmoji} ${framework.entityDefinitions.tool.title}`,
      ),
      p(
        { className: "page-description" },
        framework.entityDefinitions.tool.description.trim().split("\n")[0],
      ),
      createBadge(`${totalCount} tools`, "default"),
    ),

    // Tools list using standard card grid
    createCardList(
      tools,
      (tool) => toolToCardConfig(tool, data.capabilities),
      "No tools defined yet.",
    ),
  );

  render(page);
}
