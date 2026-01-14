/**
 * Application state management
 */

/**
 * @typedef {Object} AppState
 * @property {Object} data - Loaded data from YAML files
 * @property {Object} ui - UI state
 */

/** @type {AppState} */
const state = {
  data: {
    skills: [],
    behaviours: [],
    disciplines: [],
    tracks: [],
    grades: [],
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
      grades: { search: "" },
      drivers: { search: "" },
    },
  },
};

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * Get the current state
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Get a specific path from state
 * @param {string} path - Dot-notation path (e.g., 'data.skills')
 * @returns {*}
 */
export function getStatePath(path) {
  return path.split(".").reduce((obj, key) => obj?.[key], state);
}

/**
 * Update state at a specific path
 * @param {string} path - Dot-notation path
 * @param {*} value - New value
 */
export function updateState(path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  const target = keys.reduce((obj, key) => obj[key], state);
  target[lastKey] = value;
  notifyListeners();
}

/**
 * Merge data into state
 * @param {Object} data - Data to merge
 */
export function setData(data) {
  Object.assign(state.data, data, { loaded: true, error: null });
  notifyListeners();
}

/**
 * Set an error in state
 * @param {Error} error
 */
export function setError(error) {
  state.data.error = error.message;
  notifyListeners();
}

/**
 * Subscribe to state changes
 * @param {Function} listener
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  listeners.forEach((listener) => listener(state));
}

/**
 * Update a filter
 * @param {string} entity - Entity type (skills, behaviours, etc.)
 * @param {string} filterKey - Filter key
 * @param {*} value - Filter value
 */
export function setFilter(entity, filterKey, value) {
  if (state.ui.filters[entity]) {
    state.ui.filters[entity][filterKey] = value;
    notifyListeners();
  }
}

/**
 * Get filters for an entity
 * @param {string} entity
 * @returns {Object}
 */
export function getFilters(entity) {
  return state.ui.filters[entity] || {};
}

/**
 * @typedef {Object} Branding
 * @property {string} title - Application title
 * @property {string} tag - Brand hashtag/tag
 * @property {string} description - Application description
 */

/**
 * Get branding elements from framework data
 * @returns {Branding}
 */
export function getBranding() {
  const { framework } = state.data;
  return {
    title: framework.title || "Engineering Pathway",
    tag: framework.tag || "#BenchTools",
    description: framework.description || "",
  };
}
