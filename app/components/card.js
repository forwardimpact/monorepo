/**
 * Reusable card component
 */

import { div, h3, p, span } from "../lib/render.js";

/**
 * Create a card component
 * @param {Object} options
 * @param {string} options.title - Card title
 * @param {string} [options.description] - Card description
 * @param {string} [options.href] - Link destination (makes card clickable)
 * @param {HTMLElement[]} [options.badges] - Badges to display
 * @param {HTMLElement[]} [options.meta] - Meta information
 * @param {HTMLElement} [options.content] - Additional content
 * @param {HTMLElement} [options.icon] - Icon element to display
 * @param {string} [options.className] - Additional CSS class
 * @returns {HTMLElement}
 */
export function createCard({
  title,
  description,
  href,
  badges = [],
  meta = [],
  content,
  icon,
  className = "",
}) {
  const isClickable = !!href;

  const titleContent = icon
    ? div(
        { className: "card-title-with-icon" },
        icon,
        h3({ className: "card-title" }, title),
      )
    : h3({ className: "card-title" }, title);

  const cardHeader = div(
    { className: "card-header" },
    titleContent,
    badges.length > 0 ? div({ className: "card-badges" }, ...badges) : null,
  );

  const card = div(
    {
      className:
        `card ${isClickable ? "card-clickable" : ""} ${className}`.trim(),
    },
    cardHeader,
    description ? p({ className: "card-description" }, description) : null,
    content || null,
    meta.length > 0 ? div({ className: "card-meta" }, ...meta) : null,
  );

  if (isClickable) {
    card.addEventListener("click", () => {
      window.location.hash = href;
    });
  }

  return card;
}

/**
 * Create a stat card for the landing page
 * @param {Object} options
 * @param {number|string} options.value - The stat value
 * @param {string} options.label - The stat label
 * @param {string} [options.href] - Optional link
 * @returns {HTMLElement}
 */
export function createStatCard({ value, label, href }) {
  const card = div(
    { className: "stat-card" },
    div({ className: "stat-value" }, String(value)),
    div({ className: "stat-label" }, label),
  );

  if (href) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      window.location.hash = href;
    });
  }

  return card;
}

/**
 * Create a badge element
 * @param {string} text - Badge text
 * @param {string} [type] - Badge type (default, primary, secondary, broad, technical, ai, etc.)
 * @returns {HTMLElement}
 */
export function createBadge(text, type = "default") {
  return span({ className: `badge badge-${type}` }, text);
}

/**
 * Create a tag element
 * @param {string} text
 * @returns {HTMLElement}
 */
export function createTag(text) {
  return span({ className: "tag" }, text);
}
