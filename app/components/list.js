/**
 * Reusable list component
 */

import { div, h2, input, select, option } from "../lib/render.js";
import { createCard, createBadge } from "./card.js";

/**
 * Create a search/filter bar
 * @param {Object} options
 * @param {Function} options.onSearch - Search callback
 * @param {Array<{value: string, label: string}>} [options.filterOptions] - Filter dropdown options
 * @param {Function} [options.onFilter] - Filter callback
 * @param {string} [options.searchPlaceholder='Search...']
 * @param {string} [options.filterPlaceholder='All']
 * @returns {HTMLElement}
 */
export function createSearchBar({
  onSearch,
  filterOptions,
  onFilter,
  searchPlaceholder = "Search...",
  filterPlaceholder = "All",
}) {
  const searchInput = input({
    type: "text",
    className: "form-input",
    placeholder: searchPlaceholder,
  });

  searchInput.addEventListener("input", (e) => {
    onSearch(e.target.value);
  });

  const children = [searchInput];

  if (filterOptions && onFilter) {
    const filterSelect = select(
      { className: "form-select" },
      option({ value: "" }, filterPlaceholder),
      ...filterOptions.map((opt) => option({ value: opt.value }, opt.label)),
    );

    filterSelect.addEventListener("change", (e) => {
      onFilter(e.target.value);
    });

    children.push(filterSelect);
  }

  return div({ className: "search-bar" }, ...children);
}

/**
 * Create a list of cards
 * @param {Array} items - Items to render
 * @param {Function} renderItem - Function to render each item as a card config
 * @param {string} [emptyMessage='No items found']
 * @returns {HTMLElement}
 */
export function createCardList(
  items,
  renderItem,
  emptyMessage = "No items found",
) {
  if (!items || items.length === 0) {
    return div(
      { className: "empty-state" },
      div({ className: "empty-message" }, emptyMessage),
    );
  }

  const cards = items.map((item) => {
    const config = renderItem(item);
    return createCard(config);
  });

  return div({ className: "grid grid-3" }, ...cards);
}

/**
 * Create a grouped list (like skills by capability)
 * @param {Object} groups - Object with group names as keys and arrays as values
 * @param {Function} renderItem - Function to render each item
 * @param {Function} [renderGroupHeader] - Function to render group header
 * @returns {HTMLElement}
 */
export function createGroupedList(groups, renderItem, renderGroupHeader) {
  const sections = Object.entries(groups).map(([groupName, items]) => {
    const header = renderGroupHeader
      ? renderGroupHeader(groupName, items.length)
      : div(
          { className: "capability-header" },
          h2({ className: "capability-title" }, formatGroupName(groupName)),
          createBadge(`${items.length}`, "default"),
        );

    const cards = items.map((item) => {
      const config = renderItem(item);
      return createCard(config);
    });

    return div(
      { className: "capability-group" },
      header,
      div({ className: "grid grid-3" }, ...cards),
    );
  });

  return div({ className: "grouped-list" }, ...sections);
}

/**
 * Format a group name for display
 * @param {string} name
 * @returns {string}
 */
function formatGroupName(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
