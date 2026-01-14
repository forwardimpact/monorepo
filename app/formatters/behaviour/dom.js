/**
 * Behaviour formatting for DOM output
 */

import {
  div,
  heading1,
  heading2,
  p,
  table,
  tbody,
  thead,
  tr,
  th,
  td,
  ul,
  li,
} from "../../lib/render.js";
import { createBackLink } from "../../components/nav.js";
import { createLevelCell } from "../../components/detail.js";
import {
  BEHAVIOUR_MATURITY_ORDER,
  getConceptEmoji,
} from "../../model/levels.js";
import { prepareBehaviourDetail } from "./shared.js";

/**
 * Format behaviour detail as DOM elements
 * @param {Object} behaviour - Raw behaviour entity
 * @param {Object} context - Additional context and options
 * @param {Array} context.drivers - All drivers
 * @param {Object} [context.framework] - Framework data for emoji lookup
 * @param {boolean} [context.showBackLink=true] - Whether to show back navigation link
 * @returns {HTMLElement}
 */
export function behaviourToDOM(
  behaviour,
  { drivers, framework, showBackLink = true } = {},
) {
  const view = prepareBehaviourDetail(behaviour, { drivers });
  const emoji = getConceptEmoji(framework, "behaviour");
  return div(
    { className: "detail-page behaviour-detail" },
    // Header
    div(
      { className: "page-header" },
      showBackLink
        ? createBackLink("/behaviour", "← Back to Behaviours")
        : null,
      heading1({ className: "page-title" }, `${emoji} `, view.name),
      p({ className: "page-description" }, view.description),
    ),

    // Maturity descriptions
    div(
      { className: "detail-section" },
      heading2({ className: "section-title" }, "Maturity Levels"),
      table(
        { className: "level-table" },
        thead({}, tr({}, th({}, "Level"), th({}, "Description"))),
        tbody(
          {},
          ...BEHAVIOUR_MATURITY_ORDER.map((maturity, index) => {
            const description = view.maturityDescriptions[maturity] || "—";
            return tr(
              {},
              createLevelCell(
                index + 1,
                BEHAVIOUR_MATURITY_ORDER.length,
                maturity,
              ),
              td({}, description),
            );
          }),
        ),
      ),
    ),

    // Related drivers
    view.relatedDrivers.length > 0
      ? div(
          { className: "detail-section" },
          heading2({ className: "section-title" }, "Linked to Drivers"),
          ul(
            { className: "related-list" },
            ...view.relatedDrivers.map((d) => li({}, d.name)),
          ),
        )
      : null,
  );
}
