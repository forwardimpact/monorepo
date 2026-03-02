/**
 * Reusable detail view component
 */

import { div, h1, h2, p, a, section } from "../render.js";
import { createBackLink } from "./nav.js";
import { createTag } from "./card.js";

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
  backText = "\u2190 Back to list",
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

  return div({ className: "info-tags" }, ...tags.map((tag) => createTag(tag)));
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
