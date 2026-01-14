/**
 * Driver presentation helpers
 *
 * Shared utilities for formatting driver data across DOM and markdown outputs.
 */

import { truncate } from "../shared.js";

/**
 * Get items by their IDs
 * @param {Array} items - Array of items with id property
 * @param {string[]} ids - Array of IDs to find
 * @returns {Array} - Found items
 */
function getItemsByIds(items, ids) {
  if (!ids) return [];
  return ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
}

/**
 * @typedef {Object} DriverListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} truncatedDescription
 * @property {number} contributingSkillsCount
 * @property {number} contributingBehavioursCount
 */

/**
 * Transform drivers for list view
 * @param {Array} drivers - Raw driver entities
 * @param {number} [descriptionLimit=150] - Maximum description length
 * @returns {{ items: DriverListItem[] }}
 */
export function prepareDriversList(drivers, descriptionLimit = 150) {
  const items = drivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    description: driver.description,
    truncatedDescription: truncate(driver.description, descriptionLimit),
    contributingSkillsCount: driver.contributingSkills?.length || 0,
    contributingBehavioursCount: driver.contributingBehaviours?.length || 0,
  }));

  return { items };
}

/**
 * @typedef {Object} DriverDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Array<{id: string, name: string}>} contributingSkills
 * @property {Array<{id: string, name: string}>} contributingBehaviours
 */

/**
 * Transform driver for detail view
 * @param {Object} driver - Raw driver entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @returns {DriverDetailView|null}
 */
export function prepareDriverDetail(driver, { skills, behaviours }) {
  if (!driver) return null;

  const contributingSkills = getItemsByIds(
    skills,
    driver.contributingSkills,
  ).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const contributingBehaviours = getItemsByIds(
    behaviours,
    driver.contributingBehaviours,
  ).map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return {
    id: driver.id,
    name: driver.name,
    description: driver.description,
    contributingSkills,
    contributingBehaviours,
  };
}
