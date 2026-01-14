/**
 * General utility functions
 */

/**
 * Get an array of items by their IDs
 * @param {Array} items - Array of items with id property
 * @param {string[]} ids - Array of IDs to find
 * @returns {Array} - Found items, filtered to remove nulls
 */
export function getItemsByIds(items, ids) {
  if (!ids) return [];
  return ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
}
