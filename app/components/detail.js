/**
 * Reusable detail view component
 */

import {
  div,
  h1,
  h2,
  p,
  a,
  span,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  section,
} from "../lib/render.js";
import { createBackLink } from "./nav.js";
import { createTag } from "./card.js";
import { formatLevel } from "../lib/render.js";
import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "../model/levels.js";

/**
 * Create a detail page header
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {string} options.backLink - Path to go back to
 * @param {string} [options.backText] - Back link text
 * @param {HTMLElement[]} [options.badges]
 * @param {HTMLElement[]} [options.actions] - Action buttons
 * @returns {HTMLElement}
 */
export function createDetailHeader({
  title,
  description,
  backLink,
  backText = "← Back to list",
  badges = [],
  actions = [],
}) {
  return div(
    { className: "page-header" },
    createBackLink(backLink, backText),
    div(
      { className: "card-header" },
      h1({ className: "page-title" }, title),
      badges.length > 0 ? div({ className: "page-meta" }, ...badges) : null,
    ),
    description ? p({ className: "page-description" }, description) : null,
    actions.length > 0 ? div({ className: "page-actions" }, ...actions) : null,
  );
}

/**
 * Create a detail section
 * @param {Object} options
 * @param {string} options.title
 * @param {HTMLElement} options.content
 * @returns {HTMLElement}
 */
export function createDetailSection({ title, content }) {
  return section(
    { className: "section section-detail" },
    h2({ className: "section-title" }, title),
    content,
  );
}

/**
 * Create a level descriptions table
 * @param {Object} descriptions - Level descriptions object
 * @param {string} [type='skill'] - 'skill' or 'behaviour'
 * @returns {HTMLElement}
 */
export function createLevelTable(descriptions, type = "skill") {
  const levels =
    type === "skill" ? SKILL_LEVEL_ORDER : BEHAVIOUR_MATURITY_ORDER;

  const levelLabels = Object.fromEntries(
    levels.map((level, index) => [level, String(index + 1)]),
  );

  const maxLevels = levels.length;

  const rows = levels.map((level) => {
    const description = descriptions?.[level] || "—";
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
    span({ className: "level-label text-muted" }, "—"),
  );
}

/**
 * Create a links list
 * @param {Array<{id: string, name: string}>} items
 * @param {string} basePath - Base path for links (e.g., '/skill')
 * @param {string} [emptyMessage='None']
 * @param {Function} [getDisplayName] - Optional function to get display name
 * @returns {HTMLElement}
 */
export function createLinksList(
  items,
  basePath,
  emptyMessage = "None",
  getDisplayName,
) {
  if (!items || items.length === 0) {
    return p({ className: "text-muted" }, emptyMessage);
  }

  const displayFn = getDisplayName || ((item) => item.name);
  const links = items.map((item) =>
    a({ href: `#${basePath}/${item.id}` }, displayFn(item)),
  );

  return div({ className: "links-list" }, ...links);
}

/**
 * Create a tags list
 * @param {string[]} tags
 * @param {string} [emptyMessage='None']
 * @returns {HTMLElement}
 */
export function createTagsList(tags, emptyMessage = "None") {
  if (!tags || tags.length === 0) {
    return p({ className: "text-muted" }, emptyMessage);
  }

  return div({ className: "tags" }, ...tags.map((tag) => createTag(tag)));
}

/**
 * Create a detail grid item
 * @param {string} label
 * @param {string|HTMLElement} value
 * @returns {HTMLElement}
 */
export function createDetailItem(label, value) {
  const valueEl =
    typeof value === "string"
      ? div({ className: "detail-item-value" }, value)
      : value;

  return div(
    { className: "detail-item" },
    div({ className: "detail-item-label" }, label),
    valueEl,
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
