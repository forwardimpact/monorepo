/**
 * Behaviour presentation helpers
 *
 * Shared utilities for formatting behaviour data across DOM and markdown outputs.
 */

import { truncate } from "../shared.js";

/**
 * @typedef {Object} BehaviourListItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} truncatedDescription
 */

/**
 * Transform behaviours for list view
 * @param {Array} behaviours - Raw behaviour entities
 * @param {number} [descriptionLimit=150] - Maximum description length
 * @returns {{ items: BehaviourListItem[] }}
 */
export function prepareBehavioursList(behaviours, descriptionLimit = 150) {
  const items = behaviours.map((behaviour) => ({
    id: behaviour.id,
    name: behaviour.name,
    description: behaviour.description,
    truncatedDescription: truncate(behaviour.description, descriptionLimit),
  }));

  return { items };
}

/**
 * @typedef {Object} BehaviourDetailView
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Object<string, string>} maturityDescriptions
 * @property {Array<{id: string, name: string}>} relatedDrivers
 */

/**
 * Transform behaviour for detail view
 * @param {Object} behaviour - Raw behaviour entity
 * @param {Object} context - Additional context
 * @param {Array} context.drivers - All drivers
 * @returns {BehaviourDetailView|null}
 */
export function prepareBehaviourDetail(behaviour, { drivers }) {
  if (!behaviour) return null;

  const relatedDrivers = drivers
    .filter((d) => d.contributingBehaviours?.includes(behaviour.id))
    .map((d) => ({ id: d.id, name: d.name }));

  return {
    id: behaviour.id,
    name: behaviour.name,
    description: behaviour.description,
    maturityDescriptions: behaviour.maturityDescriptions,
    relatedDrivers,
  };
}
