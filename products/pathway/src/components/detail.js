/**
 * Detail view components
 *
 * Re-exports generic components from @forwardimpact/libui/components/detail.
 * Also provides level display components for this domain.
 */

export {
  createDetailHeader,
  createDetailSection,
  createLinksList,
  createTagsList,
  createDetailItem,
} from "@forwardimpact/libui/components/detail";

import {
  div,
  span,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  formatLevel,
} from "@forwardimpact/libui/render";
import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "@forwardimpact/libskill/levels";

/**
 * Create a level descriptions table
 * @param {Object} descriptions - Level descriptions object
 * @param {string} [type='skill'] - 'skill' or 'behaviour'
 * @returns {HTMLElement}
 */
export function createLevelTable(descriptions, type = "skill") {
  const order =
    type === "skill" ? SKILL_PROFICIENCY_ORDER : BEHAVIOUR_MATURITY_ORDER;

  const rows = order.map((level) =>
    tr(
      {},
      createLevelCell(level, order),
      td({}, descriptions?.[level] || "\u2014"),
    ),
  );

  return div(
    { className: "table-container" },
    table(
      { className: "table levels-table" },
      thead({}, tr({}, th({}, "Level"), th({}, "Description"))),
      tbody({}, ...rows),
    ),
  );
}

/**
 * Rank a level name on its scale
 *
 * The rank is a count, not an index. The lowest level on the scale ranks 1.
 * An absent or unknown name ranks 0, which fills no dots.
 * @param {string} levelName - Level name, e.g. 'working' or 'practicing'
 * @param {string[]} order - Ordered scale, lowest level first
 * @returns {number} 1-based rank, or 0 when the name is not on the scale
 */
export function rankLevel(levelName, order) {
  return order.indexOf(levelName) + 1;
}

/**
 * Create a level dots indicator
 * @param {number} filled - Number of dots to fill (0 fills none)
 * @param {number} total - Number of dots to draw
 * @returns {HTMLElement}
 */
export function createLevelDots(filled, total) {
  const count = Number.isFinite(filled) ? Math.max(0, filled) : 0;
  const dots = [];
  for (let i = 1; i <= total; i++) {
    const dot = div({
      className: `level-dot ${i <= count ? "filled level-" + i : ""}`,
    });
    dots.push(dot);
  }
  return div({ className: "level-bar" }, ...dots);
}

/**
 * Create a level bar for a named level on its scale
 * @param {string} levelName - Level name, e.g. 'working' or 'practicing'
 * @param {string[]} order - Ordered scale, lowest level first
 * @returns {HTMLElement}
 */
export function createLevelBar(levelName, order) {
  return createLevelDots(rankLevel(levelName, order), order.length);
}

/**
 * Create a level cell with dots and a label
 * @param {string} levelName - Level name, e.g. 'working' or 'practicing'
 * @param {string[]} order - Ordered scale, lowest level first
 * @returns {HTMLElement}
 */
export function createLevelCell(levelName, order) {
  return td(
    { className: "level-cell" },
    createLevelBar(levelName, order),
    span({ className: "level-label" }, formatLevel(levelName)),
  );
}

/**
 * Create an empty level cell (for gained/lost states)
 * @returns {HTMLElement}
 */
export function createEmptyLevelCell() {
  return td(
    { className: "level-cell" },
    span({ className: "level-label text-muted" }, "\u2014"),
  );
}

/**
 * Create an expectations card
 * @param {Object} expectations
 * @returns {HTMLElement}
 */
export function createExpectationsCard(expectations) {
  if (!expectations) return null;

  const items = Object.entries(expectations).map(([key, value]) =>
    div(
      { className: "expectation-item" },
      div({ className: "expectation-label" }, formatLevel(key)),
      div({ className: "expectation-value" }, value),
    ),
  );

  return div({ className: "auto-grid-sm" }, ...items);
}
