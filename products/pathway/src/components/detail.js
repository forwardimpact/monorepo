/**
 * Detail view components
 *
 * Re-exports generic components from @forwardimpact/libui/components/detail
 * and provides domain-specific level display components.
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
} from "@forwardimpact/map/levels";

/**
 * Create a level descriptions table
 * @param {Object} descriptions - Level descriptions object
 * @param {string} [type='skill'] - 'skill' or 'behaviour'
 * @returns {HTMLElement}
 */
export function createLevelTable(descriptions, type = "skill") {
  const levels =
    type === "skill" ? SKILL_PROFICIENCY_ORDER : BEHAVIOUR_MATURITY_ORDER;

  const levelLabels = Object.fromEntries(
    levels.map((level, index) => [level, String(index + 1)]),
  );

  const maxLevels = levels.length;

  const rows = levels.map((level) => {
    const description = descriptions?.[level] || "\u2014";
    const levelIndex = parseInt(levelLabels[level]);
    return tr(
      {},
      createLevelCell(levelIndex, maxLevels, level),
      td({}, description),
    );
  });

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
 * Create level dots indicator
 * @param {number} level - Current level (1-based)
 * @param {number} maxLevel - Maximum level
 * @returns {HTMLElement}
 */
export function createLevelDots(level, maxLevel) {
  const dots = [];
  for (let i = 1; i <= maxLevel; i++) {
    const dot = div({
      className: `level-dot ${i <= level ? "filled level-" + i : ""}`,
    });
    dots.push(dot);
  }
  return div({ className: "level-bar" }, ...dots);
}

/**
 * Create a level cell with dots and label
 * @param {number} levelIndex - Current level (1-based index)
 * @param {number} maxLevels - Maximum levels
 * @param {string} levelName - Level name to display
 * @returns {HTMLElement}
 */
export function createLevelCell(levelIndex, maxLevels, levelName) {
  return td(
    { className: "level-cell" },
    createLevelDots(levelIndex, maxLevels),
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
