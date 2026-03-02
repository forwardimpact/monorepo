/**
 * Application state management
 *
 * Uses generic store from @forwardimpact/libui/state
 * with Pathway-specific state shape and accessors.
 */

import { createStore } from "@forwardimpact/libui/state";

const store = createStore({
  data: {
    skills: [],
    behaviours: [],
    disciplines: [],
    tracks: [],
    levels: [],
    drivers: [],
    questions: {},
    capabilities: [],
    stages: [],
    framework: {},
    loaded: false,
    error: null,
  },
  ui: {
    currentRoute: "/",
    filters: {
      skills: { capability: null, search: "" },
      behaviours: { search: "" },
      disciplines: { search: "" },
      tracks: { search: "" },
      levels: { search: "" },
      drivers: { search: "" },
    },
  },
});

export const { getState, getStatePath, updateState, subscribe } = store;

/**
 * Merge data into state
 * @param {Object} data - Data to merge
 */
export function setData(data) {
  const state = getState();
  Object.assign(state.data, data, { loaded: true, error: null });
  updateState("data", state.data);
}

/**
 * Set an error in state
 * @param {Error} error
 */
export function setError(error) {
  updateState("data.error", error.message);
}

/**
 * Update a filter
 * @param {string} entity - Entity type (skills, behaviours, etc.)
 * @param {string} filterKey - Filter key
 * @param {*} value - Filter value
 */
export function setFilter(entity, filterKey, value) {
  const state = getState();
  if (state.ui.filters[entity]) {
    state.ui.filters[entity][filterKey] = value;
    updateState("ui.filters", state.ui.filters);
  }
}

/**
 * Get filters for an entity
 * @param {string} entity
 * @returns {Object}
 */
export function getFilters(entity) {
  return getState().ui.filters[entity] || {};
}

/**
 * @typedef {Object} Branding
 * @property {string} title - Application title
 * @property {string} tag - Brand hashtag/tag
 * @property {string} description - Application description
 * @property {string} emojiIcon - Emoji icon for the framework
 */

/**
 * Get branding elements from framework data
 * @returns {Branding}
 */
export function getBranding() {
  const { framework } = getState().data;
  return {
    title: framework.title || "Engineering Pathway",
    tag: framework.tag || "#BenchTools",
    description: framework.description || "",
    emojiIcon: framework.emojiIcon || "🧭",
  };
}
